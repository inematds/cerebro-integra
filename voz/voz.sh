#!/usr/bin/env bash
# Ponte de voz genérica do cerebro-integra.
#
#   áudio → STT_CMD → texto → cérebro (API /buscar ou RESPONDER_CMD) → TTS_CMD → fala
#
# Nada aqui depende de um motor específico. Tudo vem de variáveis de ambiente:
#
#   STT_CMD        comando que recebe o caminho do áudio em $AUDIO (e como último
#                  argumento) e imprime o texto transcrito na saída padrão.
#                  Ex.: STT_CMD='whisper-cli -nt -f'
#   TTS_CMD        comando que lê o texto da entrada padrão e fala/gera áudio.
#                  Ex.: TTS_CMD='espeak-ng -v pt-br --stdin'
#                       TTS_CMD='piper -m voz.onnx --output-raw | aplay -r 22050 -f S16_LE'
#   GRAVAR_CMD     (opcional) comando que grava o microfone no arquivo $AUDIO.
#                  Ex.: GRAVAR_CMD='arecord -d 6 -f cd -q'
#   CEREBRO_API    URL da API local (padrão http://127.0.0.1:4650)
#   CEREBRO_TOKEN  token Bearer, se a API exigir
#   RESPONDER_CMD  (opcional) comando que responde a pergunta com o cérebro
#                  (lê a pergunta na entrada padrão, roda em CEREBRO_DIR).
#                  Ex.: RESPONDER_CMD='claude -p'
#   CEREBRO_DIR    pasta do cérebro (só usada com RESPONDER_CMD)
#
# Uso:
#   voz/voz.sh --texto "quais são as prioridades"   # testa sem áudio (pula STT)
#   voz/voz.sh pergunta.ogg                         # transcreve o arquivo
#   voz/voz.sh                                      # grava com GRAVAR_CMD e transcreve
#   Flags: --sem-tts (só imprime), --limite N (resultados da busca)
#
# Requer: bash, node (para formatar o JSON) e curl (ou só node, se curl faltar).

set -euo pipefail

CEREBRO_API="${CEREBRO_API:-http://127.0.0.1:4650}"
LIMITE=5
SEM_TTS=0
TEXTO=""
AUDIO_ARQ=""

while [ $# -gt 0 ]; do
  case "$1" in
    --texto)   TEXTO="${2:-}"; shift 2 ;;
    --limite)  LIMITE="${2:-5}"; shift 2 ;;
    --sem-tts) SEM_TTS=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *)         AUDIO_ARQ="$1"; shift ;;
  esac
done

log() { echo "[voz] $*" >&2; }

# 1) Obter o texto da pergunta: --texto, arquivo de áudio, ou gravação.
if [ -z "$TEXTO" ]; then
  if [ -z "${STT_CMD:-}" ]; then
    log "Defina STT_CMD (ou use --texto para testar sem áudio)."; exit 1
  fi
  if [ -z "$AUDIO_ARQ" ]; then
    if [ -z "${GRAVAR_CMD:-}" ]; then
      log "Passe um arquivo de áudio ou defina GRAVAR_CMD."; exit 1
    fi
    AUDIO_ARQ="$(mktemp --suffix=.wav)"
    trap 'rm -f "$AUDIO_ARQ"' EXIT
    log "gravando com GRAVAR_CMD..."
    AUDIO="$AUDIO_ARQ" bash -c "$GRAVAR_CMD \"\$AUDIO\""
  fi
  log "transcrevendo com STT_CMD..."
  TEXTO="$(AUDIO="$AUDIO_ARQ" bash -c "$STT_CMD \"\$AUDIO\"" | tr -s '[:space:]' ' ' | sed 's/^ *//; s/ *$//')"
fi

if [ -z "$TEXTO" ]; then log "nenhum texto reconhecido."; exit 1; fi
log "pergunta: $TEXTO"

# 2) Responder: RESPONDER_CMD (agente na pasta do cérebro) ou /buscar na API.
if [ -n "${RESPONDER_CMD:-}" ]; then
  RESPOSTA="$(cd "${CEREBRO_DIR:-.}" && printf '%s' "$TEXTO" | bash -c "$RESPONDER_CMD")"
else
  QUERY="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$TEXTO")"
  URL="$CEREBRO_API/buscar?q=$QUERY&limite=$LIMITE"
  if command -v curl >/dev/null 2>&1; then
    if [ -n "${CEREBRO_TOKEN:-}" ]; then
      JSON="$(curl -sS -H "Authorization: Bearer $CEREBRO_TOKEN" "$URL")"
    else
      JSON="$(curl -sS "$URL")"
    fi
  else
    JSON="$(URL="$URL" node -e '
      const h = process.env.CEREBRO_TOKEN ? { Authorization: "Bearer " + process.env.CEREBRO_TOKEN } : {};
      fetch(process.env.URL, { headers: h }).then(r => r.text()).then(t => process.stdout.write(t));
    ')"
  fi
  # Formata o JSON em frases curtas, boas para serem faladas.
  RESPOSTA="$(printf '%s' "$JSON" | node -e '
    let s = ""; process.stdin.on("data", c => s += c).on("end", () => {
      let j; try { j = JSON.parse(s); } catch { console.log("A API respondeu algo que não entendi."); return; }
      if (j.erro) { console.log("Erro da API: " + j.erro); return; }
      if (!j.total) { console.log("Não encontrei nada sobre " + j.consulta + "."); return; }
      const frases = j.resultados.map((r, i) => (i + 1) + ". " + r.titulo + ". " + r.trecho.replace(/[#*_`>\[\]]/g, "").slice(0, 160));
      console.log("Encontrei " + j.total + " resultado" + (j.total > 1 ? "s" : "") + ". " + frases.join(" "));
    });
  ')"
fi

# 3) Falar (ou só imprimir).
printf '%s\n' "$RESPOSTA"
if [ "$SEM_TTS" -eq 0 ] && [ -n "${TTS_CMD:-}" ]; then
  printf '%s' "$RESPOSTA" | bash -c "$TTS_CMD"
elif [ "$SEM_TTS" -eq 0 ]; then
  log "TTS_CMD não definido; resposta só em texto."
fi
