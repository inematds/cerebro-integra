# Voz

`voz/voz.sh` é uma ponte genérica: **áudio → STT → texto → cérebro → TTS → fala**. Não escolhe motor nenhum; você aponta os comandos por variáveis de ambiente. Tem um modo `--texto` para testar a ponte sem microfone.

```
microfone ──GRAVAR_CMD──► arquivo.wav ──STT_CMD──► "qual a prioridade?"
                                                         │
                                        ┌────────────────┴────────────────┐
                                        │ RESPONDER_CMD (se definido)     │
                                        │ senão GET /buscar na CEREBRO_API│
                                        └────────────────┬────────────────┘
                                                         ▼
                                    "Encontrei 3 resultados. 1. ..." ──TTS_CMD──► caixa de som
```

## Variáveis

| Variável | Papel | Exemplos |
|---|---|---|
| `STT_CMD` | Recebe o caminho do áudio em `$AUDIO` (e como último argumento) e imprime o texto. | `whisper-cli -nt -f` · `whisper --language pt --output_format txt --output_dir /tmp` (com adaptação) · `vosk-transcriber -i` |
| `TTS_CMD` | Lê o texto da entrada padrão e fala ou gera áudio. | `espeak-ng -v pt-br --stdin` · `piper -m pt_BR.onnx --output-raw \| aplay -r 22050 -f S16_LE` · `say` (macOS) |
| `GRAVAR_CMD` | Opcional. Grava o microfone no arquivo `$AUDIO`. | `arecord -d 6 -f cd -q` · `sox -d -q` · `ffmpeg -y -f pulse -i default -t 6` |
| `CEREBRO_API` | URL da API. Padrão `http://127.0.0.1:4650`. | |
| `CEREBRO_TOKEN` | Token da API, se houver. | |
| `RESPONDER_CMD` | Opcional. Responde a pergunta com o cérebro (stdin → stdout), rodando em `CEREBRO_DIR`. | `claude -p` |
| `CEREBRO_DIR` | Pasta do cérebro (para `RESPONDER_CMD`). | |

Os comandos rodam com `bash -c`, então pipes e aspas funcionam.

## Uso

```bash
# 1. Só a ponte, sem áudio: pergunta em texto, resposta impressa e falada
TTS_CMD='espeak-ng -v pt-br --stdin' voz/voz.sh --texto "o que sabemos sobre o catálogo"

# 2. Transcrever um arquivo de áudio
STT_CMD='whisper-cli -nt -f' TTS_CMD='espeak-ng -v pt-br --stdin' voz/voz.sh pergunta.ogg

# 3. Gravar, transcrever, responder, falar
GRAVAR_CMD='arecord -d 6 -f cd -q' STT_CMD='whisper-cli -nt -f' TTS_CMD='espeak-ng -v pt-br --stdin' voz/voz.sh

# 4. Com IA na resposta (roda `claude -p` na pasta do cérebro)
RESPONDER_CMD='claude -p' CEREBRO_DIR=/meu/cerebro voz/voz.sh --texto "resume o projeto alfa"
```

Flags: `--sem-tts` (só imprime), `--limite N` (resultados da busca, padrão 5), `--help`.

Coloque as variáveis no `.env` e carregue com `set -a; source .env; set +a` antes de chamar, ou passe inline como acima.

## Saída

Sem `RESPONDER_CMD`, a resposta é montada para ser ouvida: sem Markdown, frases curtas.

```
[voz] pergunta: o que sabemos sobre o catálogo
Encontrei 3 resultados. 1. Reunião de kickoff da fase 2. A fase 2 do Projeto Alfa começa em setembro e cobre o catálogo de produtos. 2. Prioridades do trimestre. ...
```

Erro da API vira frase também ("Erro da API: Token ausente ou inválido."), para você ouvir o que deu errado.

## Montar um "botão de voz"

- **Atalho de teclado** (Linux): vincule `voz/voz.sh` com `GRAVAR_CMD` a uma tecla. Aperta, fala 6 segundos, ouve a resposta.
- **Telegram com áudio:** o bot não transcreve áudio por si só. Um workflow no n8n pode baixar a nota de voz, rodar o STT e mandar o texto para o bot ou direto para `/buscar`.
- **Assistente doméstico:** qualquer sistema que rode um comando shell com o texto reconhecido pode chamar `voz/voz.sh --texto "$TEXTO" --sem-tts` e falar a saída.

## Requisitos

bash, `node` (para montar a URL e formatar o JSON) e `curl`. Sem `curl`, o script usa `fetch` do Node. Os motores de STT/TTS são escolha sua; o kit não instala nenhum.
