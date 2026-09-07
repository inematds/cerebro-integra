# cerebro-integra

**Kit de integração do segundo cérebro.** Liga uma pasta de Markdown criada pelo [astra-2cerebro](https://github.com/inematds/astra-2cerebro) aos sistemas que você já tem: um bot de Telegram, um site ou app (API HTTP local), bancos e catálogos (importadores), automações (n8n) e voz.

Node.js 20 ou superior. **Zero dependências npm.** Tudo em português do Brasil.

## O problema

O segundo cérebro funciona muito bem dentro do terminal: você abre o Claude Code ou o Codex na pasta, e o agente lê `contexto/`, `wiki/`, `decisoes/` e responde com o que sabe de você.

Só que a vida não acontece no terminal. A pergunta chega pelo Telegram, no ônibus. O site da sua empresa precisa mostrar o catálogo que está na wiki. O banco de dados gera registros novos toda noite que deveriam virar notas em `fontes/`. Uma automação no n8n quer consultar suas prioridades antes de decidir o que fazer. Você quer perguntar em voz alta e ouvir a resposta.

Sem uma ponte, cada uma dessas integrações vira um script improvisado que lê arquivos direto, sem controle de segurança e sem respeitar as convenções do cérebro (nomes de arquivo, frontmatter, registros). O **cerebro-integra** é essa ponte, uma vez só, do jeito certo.

## Mapa dos adaptadores

```
                    ┌──────────────────────────────────────┐
                    │        seu segundo cérebro            │
                    │  contexto/  wiki/  fontes/  decisoes/ │
                    │  projetos/  conexoes.md  rotinas/     │
                    └──────────────────┬───────────────────┘
                                       │
                            ┌──────────┴──────────┐
                            │   lib/cerebro.mjs   │  ← núcleo: localizar, buscar,
                            │  (leitura segura +  │    ler com bloqueio de traversal,
                            │   escrita anexada)  │    gravar fonte, decisão, execução
                            └──────────┬──────────┘
          ┌──────────────┬─────────────┼─────────────┬──────────────┐
          │              │             │             │              │
   ┌──────┴──────┐ ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐ ┌──────┴──────┐
   │ api/        │ │ telegram/ │ │importadores│ │ n8n/      │ │ voz/        │
   │ servidor    │ │ bot       │ │ json, csv, │ │ fluxo-    │ │ voz.sh      │
   │ HTTP JSON   │ │ long poll │ │ pasta,     │ │ exemplo   │ │ STT→API→TTS │
   │ 127.0.0.1   │ │ comandos  │ │ exportar   │ │ webhook   │ │ por env     │
   └──────┬──────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬──────┘
          │              │             │             │              │
     site / app      Telegram     banco / CSV /     n8n / Make    microfone /
     / painel                     planilha / pasta                 caixa de som
```

| Adaptador | Arquivo | O que faz |
|---|---|---|
| API HTTP local | `api/servidor.mjs` | Expõe o cérebro em JSON (`/buscar`, `/contexto`, `/prioridades`, `/pagina`, `/projetos`, `/conexoes`, e escrita opcional em `/decisao`, `/fonte`, `/rotina/execucao`). |
| Bot de Telegram | `telegram/bot.mjs` | `/buscar`, `/prioridades`, `/contexto`, `/decisao`, `/fonte`, `/rotina`; texto livre responde via `RESPONDER_CMD` ou busca. |
| Importar JSON | `importadores/importar-json.mjs` | Catálogo ou registros → uma nota por item em `fontes/`, com mapa de campos. Idempotente. |
| Importar CSV | `importadores/importar-csv.mjs` | O mesmo para planilhas, com parser próprio (aspas, `;`, BOM, CRLF). |
| Importar pasta | `importadores/importar-pasta.mjs` | Copia `.md`/`.txt` de uma pasta externa com prefixo de data e log. |
| Exportar wiki | `importadores/exportar-wiki.mjs` | `wiki/` → um JSON com páginas, frontmatter, links e diagnóstico. |
| n8n | `n8n/fluxo-exemplo.json` | Workflow pronto: webhook → `/buscar` → resposta. |
| Voz | `voz/voz.sh` | STT configurável → cérebro → TTS configurável. Modo `--texto` para testar sem áudio. |

## 📖 Guia de uso

Guia completo (landing + passo a passo): **https://inematds.github.io/cerebro-integra/guia/**

## Instalação em 1 minuto

```bash
git clone https://github.com/inematds/cerebro-integra.git
cd cerebro-integra
cp .env.exemplo .env          # edite CEREBRO_DIR apontando para o seu cérebro
npm test                      # opcional: confere que tudo funciona aqui
npm run api                   # sobe a API em http://127.0.0.1:4650
```

Sem `npm install`: não há dependências. Detalhes, systemd e instruções para o agente em [INSTALAR.md](INSTALAR.md).

## Um exemplo por adaptador

**API.** Busca em todas as notas:

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

**Telegram.** Com `TELEGRAM_TOKEN` e `TELEGRAM_CHATS` no `.env`:

```bash
npm run bot
```

No chat: `/prioridades` lista o trimestre; `/decisao Usar API local | O site consulta a API | Evita duplicar dados` registra em `decisoes/registro.md`; encaminhar qualquer mensagem grava uma nota em `fontes/`.

**Importar JSON.** Catálogo com mapa de campos:

```bash
node importadores/importar-json.mjs catalogo.json --config mapa.json
# criados: 340 · pulados (já existiam): 0
node importadores/importar-json.mjs catalogo.json --config mapa.json
# criados: 0 · pulados (já existiam): 340      ← rodar de novo não duplica
```

**Importar CSV.** `node importadores/importar-csv.mjs produtos.csv --config mapa.json`

**Importar pasta.** `node importadores/importar-pasta.mjs ~/Documentos/notas --prefixo notas`

**Exportar wiki.** `node importadores/exportar-wiki.mjs --saida wiki.json` gera um JSON que seu site ou sua busca consomem.

**n8n.** Importe `n8n/fluxo-exemplo.json`, defina `CEREBRO_API` e `CEREBRO_TOKEN` no ambiente do n8n, e chame o webhook com `{"q": "prioridades"}`.

**Voz.** Sem microfone, para testar a ponte:

```bash
TTS_CMD='espeak-ng -v pt-br --stdin' voz/voz.sh --texto "o que sabemos sobre o catálogo"
```

## Segurança

O cérebro tem dados pessoais. O kit é conservador por padrão:

- **Loopback.** A API escuta só em `127.0.0.1`. Expor para fora exige `CEREBRO_HOST` explícito, e mesmo assim recomenda-se um proxy com HTTPS.
- **Token.** Com `CEREBRO_TOKEN` definido, toda rota (menos `/saude`) exige `Authorization: Bearer <token>`, comparado em tempo constante.
- **Escrita opt-in.** `POST` na API e os comandos de escrita do bot só funcionam com `CEREBRO_ESCRITA=1`. Mesmo ligada, a escrita é sempre *anexar*: fonte existente nunca é sobrescrita, registros só ganham linhas.
- **Chats permitidos.** O bot só responde aos IDs em `TELEGRAM_CHATS`. Sem a lista, ele não sobe. Mensagens de outros chats são ignoradas em silêncio.
- **Sem traversal.** `/pagina` só lê `.md`/`.txt` dentro da raiz do cérebro; `..`, caminhos absolutos, codificados e links simbólicos para fora são bloqueados.
- **Nunca segredos.** O token do Telegram é removido de qualquer mensagem de erro ou log. O `.env` está no `.gitignore`. O fluxo n8n usa `$env.CEREBRO_TOKEN`, nunca um valor literal.
- **CORS desligado.** Só com `CEREBRO_CORS=<origem>`.

Mais em [docs/seguranca.md](docs/seguranca.md).

## Documentação

- [INSTALAR.md](INSTALAR.md): clone, `.env`, API e bot como serviço (systemd), instruções para o agente.
- [docs/arquitetura.md](docs/arquitetura.md): como as peças se encaixam e por quê.
- [docs/api.md](docs/api.md): cada rota com requisição e resposta.
- [docs/telegram.md](docs/telegram.md): BotFather, chat id, comandos, `RESPONDER_CMD`.
- [docs/importadores.md](docs/importadores.md): mapa de campos, exemplos JSON/CSV, idempotência.
- [docs/n8n.md](docs/n8n.md), [docs/voz.md](docs/voz.md), [docs/seguranca.md](docs/seguranca.md).
- [docs/receitas.md](docs/receitas.md): três receitas completas (bot existente, site, banco → wiki toda noite).
- [CHANGELOG.md](CHANGELOG.md).

## Testes

```bash
npm test
```

Resultado em 2026-09-07 (Node 24.13.0, Linux):

```
ℹ tests 73
ℹ suites 17
ℹ pass 73
ℹ fail 0
```

O que cobrem: núcleo (busca sem acento, leitura com bloqueio de traversal por `..`, absoluto, codificado e symlink, fonte idempotente, decisão no formato do kit, execução de rotina inserida no topo da tabela), API (todas as rotas em porta livre, 401 sem token, 403 sem `CEREBRO_ESCRITA`, 400 em JSON inválido, CORS), importadores JSON e CSV (arquivos esperados numa cópia temporária da fixture, sem duplicar na segunda rodada, parser CSV com aspas/BOM/CRLF/`;`), pasta (prefixo de data, log, sem duplicar), exportar-wiki (páginas, links, frontmatter, links quebrados e órfãs), bot (parser de comandos e handler completo sem rede, cliente Telegram com `fetch` falso, ocultação de token), n8n (JSON válido, conexões coerentes, token só por env) e voz (`bash -n`, `--texto` contra a API em processo com `TTS_CMD=cat`, `RESPONDER_CMD`).

## Perguntas frequentes

**Preciso do astra-2cerebro instalado?** Precisa de uma pasta com a estrutura dele (ao menos `AGENTS.md` ou `CLAUDE.md`, `contexto/`, `fontes/`). `test/fixture/` é um cérebro mínimo de exemplo que você pode copiar para experimentar.

**Funciona com Obsidian ou outra pasta de Markdown?** Funciona para busca e leitura. A escrita segue as convenções do kit (`fontes/AAAA-MM-DD-slug.md`, `decisoes/registro.md`, `rotinas/registro.md`); se a pasta não as tiver, os arquivos são criados.

**Posso expor a API na internet?** Não diretamente. Coloque atrás de um proxy com HTTPS, use `CEREBRO_TOKEN`, e pense se realmente precisa: o bot de Telegram e o n8n resolvem a maioria dos casos sem abrir porta.

**O bot responde texto livre com IA?** Só se você definir `RESPONDER_CMD` (por exemplo `claude -p`, rodando na pasta do cérebro). Sem isso, texto livre devolve os resultados da busca. O kit não chama nenhum modelo por conta própria.

**E se a wiki ainda não existe?** `/buscar` e `/contexto` funcionam com o que houver. `exportar-wiki` avisa que falta `wiki/`.

**Como sei que uma rotina rodou?** `POST /rotina/execucao` (ou `/rotina <id> ok` no bot) anexa uma linha em `rotinas/registro.md`. É a evidência que o `/auditar` do kit procura.

**Windows?** A API, o bot e os importadores rodam em qualquer sistema com Node 20+. `voz/voz.sh` precisa de bash (WSL ou Git Bash).

## Créditos e licença

Construído sobre o [astra-2cerebro](https://github.com/inematds/astra-2cerebro), o kit de segundo cérebro em Markdown para Claude Code e Codex. Este projeto reaproveita a estrutura de pastas e as convenções de arquivo do kit; nada mais.

MIT. Copyright (c) 2026 inematds.
