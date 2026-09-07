# Arquitetura

## A ideia em uma frase

Um núcleo pequeno sabe ler e escrever no cérebro do jeito certo; cada adaptador só traduz um canal (HTTP, Telegram, arquivo, voz) para chamadas desse núcleo.

```
canal externo  ──►  adaptador  ──►  lib/cerebro.mjs  ──►  arquivos .md do cérebro
                    (traduz)        (regras + segurança)
```

Nenhum adaptador toca em arquivo diretamente. Se uma convenção do cérebro mudar (nome de arquivo, formato de tabela), muda em um lugar só.

## Camadas

### 1. Núcleo: `lib/cerebro.mjs`

Funções puras sobre uma `raiz` (caminho absoluto do cérebro). Nenhuma lê `process.env` por conta própria, exceto `localizarCerebro()` sem argumento. Isso é o que permite testar tudo com cópias temporárias da fixture.

| Grupo | Funções | Observações |
|---|---|---|
| Localizar | `localizarCerebro(explicito, {env, cwd})` | argumento → `CEREBRO_DIR` → sobe a partir da pasta atual até achar `AGENTS.md`, `CLAUDE.md`, `conexoes.md` ou `contexto/` |
| Ler | `resolverCaminhoSeguro`, `lerPagina`, `listarArquivos` | só `.md`/`.txt`; bloqueia `..`, absoluto, `%2e%2e`, symlink para fora |
| Buscar | `buscar(raiz, consulta, {limite, pasta})` | termos normalizados (sem acento, sem caixa), todos obrigatórios, pontos por ocorrência + bônus de título e nome |
| Contexto | `lerContexto`, `lerPrioridades`, `lerMapaDeRotas`, `listarProjetos`, `lerConexoes`, `listarRotinas` | leem os arquivos canônicos do kit |
| Escrever | `gravarFonte`, `registrarDecisao`, `registrarExecucao` | sempre anexar; fonte usa `flag: 'wx'` (falha se existir) |
| Ambiente | `carregarEnv`, `versao` | `.env` sem sobrescrever o que já existe |

`lib/importar.mjs` completa o núcleo com o que os importadores compartilham: mapeamento de campos, parser CSV, extração de itens de um JSON, data estável a partir do arquivo de origem.

### 2. Adaptadores

Cada um tem duas partes: uma **função construtora ou handler** (testável, sem rede) e um **ponto de entrada de linha de comando** (lê `.env` e variáveis, chama a função). O guard é `import.meta.url === pathToFileURL(process.argv[1]).href`, então importar o módulo em um teste não sobe nada.

| Adaptador | Parte testável | Ponto de entrada |
|---|---|---|
| API | `criarServidor({raiz, token, escrita, cors})` → `http.Server` | `iniciarPelaLinhaDeComando()` |
| Bot | `interpretarComando(texto)`, `processarMensagem(msg, deps)`, `criarClienteTelegram(token, fetch)` | `iniciarBot()` (polling) |
| Importadores | `importarJson`, `importarCsv`, `importarPasta`, `exportarWiki` | cada arquivo com `--cerebro`, `--config`, `--simular` |
| Voz | shell puro, `--texto` pula STT | `voz/voz.sh` |
| n8n | JSON estático | importar no n8n |

### 3. Canais

O que está do outro lado: navegador, Telegram, cron, n8n, microfone. O kit não os controla; só oferece o contrato.

## Fluxos

### Leitura pela API

```
GET /buscar?q=catalogo
  → token confere? (se CEREBRO_TOKEN)
  → buscar(raiz, 'catalogo')
      → listarArquivos(raiz)          ignora .git, node_modules, apps, .claude, .agents
      → normalizar + pontuar
  → JSON { consulta, total, resultados[] }
```

### Escrita pelo bot

```
mensagem "/decisao A | B | C" no chat 111
  → chat 111 ∈ TELEGRAM_CHATS? senão, ignora em silêncio
  → interpretarComando → { comando: 'decisao', args: 'A | B | C' }
  → escrita ligada? senão, "Escrita desligada"
  → registrarDecisao(raiz, {titulo: A, decisao: B, porque: C, data: data da mensagem})
      → anexa bloco "## AAAA-MM-DD: A" em decisoes/registro.md
  → "Decisão registrada em decisoes/registro.md: ..."
```

### Importação recorrente

```
cron 23h
  → importar-json catalogo.json --config mapa.json
      → extrairItens → mapearItem (título, data estável, slug com id) → gravarFonte
      → item já existente é pulado (idempotente)
  → POST /rotina/execucao { id, resultado, saida }
      → linha no topo de "Registro de execuções" em rotinas/registro.md
```

## Decisões de projeto

**Sem dependências.** `node:http`, `fetch`, `node:fs` e `node:child_process` bastam. Menos superfície de ataque, instalação em segundos, funciona offline.

**Loopback e escrita desligada por padrão.** A configuração insegura precisa ser pedida explicitamente (`CEREBRO_HOST`, `CEREBRO_ESCRITA=1`, `CEREBRO_CORS`). O caminho fácil é o seguro.

**Datas estáveis nos importadores.** Um item sem data recebe a data de modificação do arquivo de origem (ou `dataPadrao` do mapa), nunca "hoje". Senão, rodar amanhã duplicaria tudo.

**Escrita sempre anexada.** O cérebro é do usuário e do agente do kit. O cerebro-integra só adiciona: notas novas em `fontes/`, blocos novos em `decisoes/`, linhas novas em `rotinas/`. Nunca edita a wiki nem o contexto; isso é trabalho do `/wiki` e do `/iniciar`.

**Texto livre não chama modelo por padrão.** Sem `RESPONDER_CMD`, o bot e a voz respondem com a busca. Quem quiser IA na resposta aponta um comando (por exemplo `claude -p`) que roda na pasta do cérebro e já lê o manual do agente.

**Polling, não webhook, no Telegram.** Long polling não precisa de porta aberta nem de HTTPS. Para a maioria das pessoas, é o que funciona em casa, atrás de NAT.

## Estrutura de pastas do repositório

```
cerebro-integra/
├── lib/            cerebro.mjs (núcleo), importar.mjs (comum aos importadores)
├── api/            servidor.mjs
├── telegram/       bot.mjs
├── importadores/   importar-json.mjs, importar-csv.mjs, importar-pasta.mjs, exportar-wiki.mjs
├── n8n/            fluxo-exemplo.json
├── voz/            voz.sh
├── test/           *.test.mjs, ajuda.mjs, fixture/ (cérebro mínimo de exemplo), tmp/ (ignorado)
├── docs/           esta documentação
├── guia/           página landing + guia (GitHub Pages)
├── .env.exemplo, package.json, VERSION, CHANGELOG.md, LICENSE
└── README.md, INSTALAR.md
```
