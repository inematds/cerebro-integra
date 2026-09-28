# cerebro-integra

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

**Second brain integration kit.** Connects a Markdown folder created by [astra-2cerebro](https://github.com/inematds/astra-2cerebro) to the systems you already use: a Telegram bot, a website or app (local HTTP API), databases and catalogs (importers), automations (n8n), and voice.

Node.js 20 or higher. **Zero npm dependencies.** Everything is in Brazilian Portuguese.

## The problem

The second brain works great in the terminal: you open Claude Code or Codex in the folder, and the agent reads `contexto/`, `wiki/`, `decisoes/` and responds with what it knows about you.

But life doesn’t happen in the terminal. A question arrives on Telegram while you’re on the bus. Your company’s website needs to display the catalog in the wiki. The database generates new records every night that should become notes in `fontes/`. An n8n automation wants to check your priorities before deciding what to do. You want to ask out loud and hear the answer.

Without a bridge, each of these integrations becomes an improvised script that reads files directly, without security controls or regard for the brain’s conventions (file names, frontmatter, records). **cerebro-integra** is that bridge, built once and the right way.

## Adapter map

```
                    ┌──────────────────────────────────────┐
                    │          your second brain            │
                    │  contexto/  wiki/  fontes/  decisoes/ │
                    │  projetos/  conexoes.md  rotinas/     │
                    └──────────────────┬───────────────────┘
                                       │
                            ┌──────────┴──────────┐
                            │   lib/cerebro.mjs   │  ← core: locate, search,
                            │  (safe reading +    │    read with traversal protection,
                            │   append-only write)│    record source, decision, execution
                            └──────────┬──────────┘
          ┌──────────────┬─────────────┼─────────────┬──────────────┐
          │              │             │             │              │
   ┌──────┴──────┐ ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐ ┌──────┴──────┐
   │ api/        │ │ telegram/ │ │importers  │ │ n8n/      │ │ voz/        │
   │ server      │ │ bot       │ │ json, csv,│ │ example   │ │ voz.sh      │
   │ HTTP JSON   │ │ long poll │ │ folder,   │ │ workflow  │ │ STT→API→TTS │
   │ 127.0.0.1   │ │ commands  │ │ export    │ │ webhook   │ │ via env     │
   └──────┬──────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬──────┘
          │              │             │             │              │
     website / app    Telegram     database / CSV /  n8n / Make    microphone /
     / dashboard                   spreadsheet / folder            speaker
```

| Adapter | File | What it does |
|---|---|---|
| Local HTTP API | `api/servidor.mjs` | Exposes the brain as JSON (`/buscar`, `/contexto`, `/prioridades`, `/pagina`, `/projetos`, `/conexoes`, and optional writes to `/decisao`, `/fonte`, `/rotina/execucao`). |
| Telegram bot | `telegram/bot.mjs` | `/buscar`, `/prioridades`, `/contexto`, `/decisao`, `/fonte`, `/rotina`; free text gets a response via `RESPONDER_CMD` or search. |
| Import JSON | `importadores/importar-json.mjs` | Catalog or records → one note per item in `fontes/`, with field mapping. Idempotent. |
| Import CSV | `importadores/importar-csv.mjs` | Same for spreadsheets, with its own parser (quotes, `;`, BOM, CRLF). |
| Import folder | `importadores/importar-pasta.mjs` | Copies `.md`/`.txt` files from an external folder with a date prefix and log. |
| Export wiki | `importadores/exportar-wiki.mjs` | `wiki/` → one JSON with pages, frontmatter, links, and diagnostics. |
| n8n | `n8n/fluxo-exemplo.json` | Ready-to-use workflow: webhook → `/buscar` → response. |
| Voice | `voz/voz.sh` | Configurable STT → brain → configurable TTS. `--texto` mode for testing without audio. |

## 📖 User guide

Complete guide (landing page + walkthrough): **https://inematds.github.io/cerebro-integra/guia/en/**

## Install in 1 minute

```bash
git clone https://github.com/inematds/cerebro-integra.git
cd cerebro-integra
cp .env.exemplo .env          # edit CEREBRO_DIR to point to your brain
npm test                      # optional: checks that everything works here
npm run api                   # starts the API at http://127.0.0.1:4650
```

No `npm install`: there are no dependencies. Details, systemd, and instructions for the agent are in [INSTALAR.md](INSTALAR.md).

## One example per adapter

**API.** Search all notes:

```bash
curl 'http://127.0.0.1:4650/buscar?q=catalogo&limite=3'
```

```json
{
  "consulta": "catalogo",
  "total": 3,
  "resultados": [
    { "caminho": "fontes/2026-08-18-reuniao-kickoff-fase-2.md", "titulo": "Reunião de kickoff da fase 2", "pontos": 4, "trecho": "..." }
  ]
}
```

**Telegram.** With `TELEGRAM_TOKEN` and `TELEGRAM_CHATS` in `.env`:

```bash
npm run bot
```

In the chat: `/prioridades` lists the quarter; `/decisao Usar API local | O site consulta a API | Evita duplicar dados` records in `decisoes/registro.md`; forwarding any message saves a note in `fontes/`.

**Import JSON.** Catalog with field mapping:

```bash
node importadores/importar-json.mjs catalogo.json --config mapa.json
# created: 340 · skipped (already existed): 0
node importadores/importar-json.mjs catalogo.json --config mapa.json
# created: 0 · skipped (already existed): 340      ← running again does not create duplicates
```

**Import CSV.** `node importadores/importar-csv.mjs produtos.csv --config mapa.json`

**Import folder.** `node importadores/importar-pasta.mjs ~/Documentos/notas --prefixo notas`

**Export wiki.** `node importadores/exportar-wiki.mjs --saida wiki.json` generates a JSON that your website or search can consume.

**n8n.** Import `n8n/fluxo-exemplo.json`, set `CEREBRO_API` and `CEREBRO_TOKEN` in the n8n environment, and call the webhook with `{"q": "prioridades"}`.

**Voice.** Test the bridge without a microphone:

```bash
TTS_CMD='espeak-ng -v pt-br --stdin' voz/voz.sh --texto "o que sabemos sobre o catálogo"
```

## Security

The brain contains personal data. The kit is conservative by default:

- **Loopback.** The API listens only on `127.0.0.1`. Exposing it externally requires explicitly setting `CEREBRO_HOST`; even then, a proxy with HTTPS is recommended.
- **Token.** When `CEREBRO_TOKEN` is set, every route (except `/saude`) requires `Authorization: Bearer <token>`, compared in constant time.
- **Opt-in writing.** `POST` to the API and the bot’s write commands work only with `CEREBRO_ESCRITA=1`. Even when enabled, writing is always *append-only*: existing sources are never overwritten; records only gain lines.
- **Allowed chats.** The bot responds only to IDs in `TELEGRAM_CHATS`. Without the list, it won’t start. Messages from other chats are silently ignored.
- **No traversal.** `/pagina` only reads `.md`/`.txt` files inside the brain’s root; `..`, absolute and encoded paths, and symlinks pointing outside are blocked.
- **Never expose secrets.** The Telegram token is removed from any error message or log. `.env` is in `.gitignore`. The n8n workflow uses `$env.CEREBRO_TOKEN`, never a literal value.
- **CORS disabled.** Only enabled with `CEREBRO_CORS=<origem>`.

More in [docs/seguranca.md](docs/seguranca.md).

## Documentation

- [INSTALAR.md](INSTALAR.md): clone, `.env`, API and bot as a service (systemd), instructions for the agent.
- [docs/arquitetura.md](docs/arquitetura.md): how the pieces fit together and why.
- [docs/api.md](docs/api.md): each route with a request and response.
- [docs/telegram.md](docs/telegram.md): BotFather, chat ID, commands, `RESPONDER_CMD`.
- [docs/importadores.md](docs/importadores.md): field mapping, JSON/CSV examples, idempotency.
- [docs/n8n.md](docs/n8n.md), [docs/voz.md](docs/voz.md), [docs/seguranca.md](docs/seguranca.md).
- [docs/receitas.md](docs/receitas.md): three complete recipes (existing bot, website, database → wiki every night).
- [CHANGELOG.md](CHANGELOG.md).

## Tests

```bash
npm test
```

Results on 2026-09-07 (Node 24.13.0, Linux):

```
ℹ tests 73
ℹ suites 17
ℹ pass 73
ℹ fail 0
```

What they cover: core (accent-insensitive search, reading with traversal protection for `..`, absolute, encoded, and symlink paths, idempotent sources, decisions in the kit’s format, routine execution inserted at the top of the table), API (all routes on an available port, 401 without a token, 403 without `CEREBRO_ESCRITA`, 400 for invalid JSON, CORS), JSON and CSV importers (expected files in a temporary copy of the fixture, no duplicates on the second run, CSV parser with quotes/BOM/CRLF/`;`), folder (date prefix, log, no duplicates), export-wiki (pages, links, frontmatter, broken and orphaned links), bot (command parser and full handler without a network, Telegram client with a fake `fetch`, token redaction), n8n (valid JSON, coherent connections, token only via env), and voice (`bash -n`, `--texto` against the API in a process with `TTS_CMD=cat`, `RESPONDER_CMD`).

## Frequently asked questions

**Do I need astra-2cerebro installed?** You need a folder with its structure (at least `AGENTS.md` or `CLAUDE.md`, `contexto/`, `fontes/`). `test/fixture/` is a minimal example brain you can copy to try it out.

**Does it work with Obsidian or another Markdown folder?** It works for search and reading. Writing follows the kit’s conventions (`fontes/AAAA-MM-DD-slug.md`, `decisoes/registro.md`, `rotinas/registro.md`); if the folder doesn’t have them, the files are created.

**Can I expose the API to the internet?** Not directly. Put it behind a proxy with HTTPS, use `CEREBRO_TOKEN`, and consider whether you really need to: the Telegram bot and n8n handle most cases without opening a port.

**Does the bot respond to free text with AI?** Only if you set `RESPONDER_CMD` (for example, `claude -p`, running in the brain’s folder). Without it, free text returns search results. The kit does not call any model on its own.

**What if the wiki doesn’t exist yet?** `/buscar` and `/contexto` work with whatever is available. `exportar-wiki` warns you if `wiki/` is missing.

**How do I know a routine ran?** `POST /rotina/execucao` (or `/rotina <id> ok` in the bot) appends a line to `rotinas/registro.md`. That’s the evidence the kit’s `/auditar` looks for.

**Windows?** The API, bot, and importers run on any system with Node 20+. `voz/voz.sh` requires bash (WSL or Git Bash).

## Credits and license

Built on [astra-2cerebro](https://github.com/inematds/astra-2cerebro), the Markdown second brain kit for Claude Code and Codex. This project reuses the kit’s folder structure and file conventions; nothing else.

MIT. Copyright (c) 2026 inematds.
