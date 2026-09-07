# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versão semântica `X.XX.YY`.

## [1.0.0] - 2026-09-07

Primeira versão.

### Adicionado

- `lib/cerebro.mjs`: núcleo compartilhado (localizar cérebro, busca sem acento, leitura com bloqueio de path traversal, contexto/prioridades/projetos/conexões, gravar fonte sem sobrescrever, registrar decisão, registrar execução de rotina, loader de `.env`).
- `api/servidor.mjs`: API HTTP local em `127.0.0.1:4650` com token opcional, escrita opt-in (`CEREBRO_ESCRITA=1`), CORS opcional e limite de corpo de 1 MB. Rotas: `/saude`, `/contexto`, `/prioridades`, `/buscar`, `/pagina`, `/projetos`, `/conexoes`, `/rotinas`, `POST /decisao`, `POST /fonte`, `POST /rotina/execucao`.
- `telegram/bot.mjs`: bot por long polling com `/buscar`, `/prioridades`, `/contexto`, `/decisao`, `/fonte`, `/rotina`, chats permitidos, `RESPONDER_CMD` para texto livre, mensagem encaminhada vira fonte, token nunca impresso.
- `importadores/importar-json.mjs`, `importar-csv.mjs`, `importar-pasta.mjs`: uma nota por item em `fontes/`, mapa de campos por JSON, idempotentes, `--simular`.
- `importadores/exportar-wiki.mjs`: `wiki/` → JSON com páginas, frontmatter, links, links quebrados e páginas órfãs.
- `n8n/fluxo-exemplo.json`: webhook → `/buscar` → resposta, token por `$env`.
- `voz/voz.sh`: ponte STT → cérebro → TTS configurável por ambiente, modo `--texto`.
- Testes com `node --test` (73 testes) cobrindo núcleo, API, importadores, bot, n8n e voz.
- Documentação: README, INSTALAR, `docs/` (arquitetura, api, telegram, importadores, n8n, voz, segurança, receitas).
