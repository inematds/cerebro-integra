# Instalar o cerebro-integra

## Requisitos

- Node.js 20 ou superior (`node --version`).
- Um cérebro criado pelo [astra-2cerebro](https://github.com/inematds/astra-2cerebro), ou qualquer pasta com `AGENTS.md`/`CLAUDE.md`, `contexto/` e `fontes/`.
- Para o bot: um token do BotFather e o ID do seu chat ([docs/telegram.md](docs/telegram.md)).
- Para a voz: bash, `curl` (ou só Node) e os comandos de STT/TTS que você escolher.

Nenhum `npm install`: o kit não tem dependências.

## 1. Clonar

```bash
git clone https://github.com/inematds/cerebro-integra.git
cd cerebro-integra
```

Se preferir, copie a pasta para dentro do próprio cérebro (por exemplo `meu-cerebro/apps/cerebro-integra`). Os scripts localizam o cérebro subindo a partir da pasta atual quando `CEREBRO_DIR` não está definido.

## 2. Configurar o `.env`

```bash
cp .env.exemplo .env
```

Edite pelo menos:

```
CEREBRO_DIR=/caminho/para/meu-cerebro
```

Todos os scripts leem o `.env` **da pasta atual** ao iniciar, sem sobrescrever variáveis que já existem no ambiente. Alternativa sem arquivo: `node --env-file=.env api/servidor.mjs`.

Variáveis principais:

| Variável | Usada por | Padrão | Significado |
|---|---|---|---|
| `CEREBRO_DIR` | todos | pasta atual | raiz do cérebro |
| `CEREBRO_PORTA` | API | `4650` | porta da API |
| `CEREBRO_HOST` | API | `127.0.0.1` | só mude se souber o que faz |
| `CEREBRO_TOKEN` | API, voz | vazio | exige `Authorization: Bearer` |
| `CEREBRO_ESCRITA` | API, bot | `0` | `1` liga POST e comandos de escrita |
| `CEREBRO_CORS` | API | vazio | origem permitida (ou `*`) |
| `TELEGRAM_TOKEN` | bot | | token do BotFather |
| `TELEGRAM_CHATS` | bot | | IDs permitidos, separados por vírgula |
| `RESPONDER_CMD` | bot, voz | vazio | comando que responde texto livre |
| `STT_CMD`, `TTS_CMD`, `GRAVAR_CMD`, `CEREBRO_API` | voz | | ver [docs/voz.md](docs/voz.md) |

Gere um token forte: `openssl rand -hex 24`.

## 3. Conferir

```bash
npm test
```

Se tudo passar, o ambiente está pronto. Os testes usam uma cópia de `test/fixture/` e nunca tocam no seu cérebro.

## 4. Subir a API

```bash
npm run api
# [api] cérebro: /caminho/para/meu-cerebro
# [api] escutando em http://127.0.0.1:4650
# [api] token: exigido · escrita: desligada · cors: desligado
```

Teste: `curl http://127.0.0.1:4650/saude`.

Com escrita: `CEREBRO_ESCRITA=1 npm run api`.

## 5. Subir o bot

```bash
npm run bot
# [bot] @seu_bot · cérebro: /caminho/para/meu-cerebro
# [bot] chats permitidos: 1 · escrita: desligada · responder: busca
```

Mande `/start` no chat. Se nada acontecer, confira se o ID do chat está em `TELEGRAM_CHATS`.

## 6. Como serviço (systemd, Linux)

Um serviço por processo. Substitua `usuario` e os caminhos.

`~/.config/systemd/user/cerebro-api.service`:

```ini
[Unit]
Description=cerebro-integra API
After=network.target

[Service]
WorkingDirectory=/home/usuario/cerebro-integra
EnvironmentFile=/home/usuario/cerebro-integra/.env
ExecStart=/usr/bin/node api/servidor.mjs
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

`~/.config/systemd/user/cerebro-bot.service`:

```ini
[Unit]
Description=cerebro-integra bot de Telegram
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/home/usuario/cerebro-integra
EnvironmentFile=/home/usuario/cerebro-integra/.env
ExecStart=/usr/bin/node telegram/bot.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
```

Ativar:

```bash
systemctl --user daemon-reload
systemctl --user enable --now cerebro-api cerebro-bot
systemctl --user status cerebro-api
journalctl --user -u cerebro-bot -f
loginctl enable-linger $USER     # para os serviços subirem sem sessão aberta
```

O `EnvironmentFile` aceita o mesmo formato do `.env` (sem `export`, sem aspas obrigatórias).

## 7. Importações agendadas (cron)

```cron
# toda noite às 23h: catálogo → fontes/, e registra a execução na rotina
0 23 * * * cd /home/usuario/cerebro-integra && node importadores/importar-json.mjs /dados/catalogo.json --config mapas/catalogo.json >> /home/usuario/logs/importar.log 2>&1
```

A receita completa com registro em `rotinas/registro.md` está em [docs/receitas.md](docs/receitas.md).

## Atualizar

```bash
git pull
npm test
systemctl --user restart cerebro-api cerebro-bot
```

## Desinstalar

Pare os serviços, remova a pasta. O cérebro não é alterado pela instalação: o kit só grava em `fontes/`, `decisoes/registro.md` e `rotinas/registro.md`, e só quando você pede.

---

## Instruções para o agente

Se você é um agente (Claude Code, Codex ou similar) instalando este kit para o usuário, siga esta sequência sem pular etapas. Não peça confirmação para o que já está decidido aqui.

1. **Localize o cérebro.** Procure uma pasta com `AGENTS.md` ou `CLAUDE.md` e a seção `## Mapa de rotas`. Se não existir, pare e diga ao usuário que precisa instalar o astra-2cerebro primeiro (https://github.com/inematds/astra-2cerebro). Não crie um cérebro por conta própria.
2. **Confira o Node.** `node --version` deve ser 20 ou superior. Se não for, informe e pare.
3. **Clone** em uma pasta irmã do cérebro (ou em `apps/cerebro-integra` dentro dele): `git clone https://github.com/inematds/cerebro-integra.git`.
4. **Crie o `.env`** a partir de `.env.exemplo`. Preencha `CEREBRO_DIR` com o caminho absoluto do cérebro. Gere `CEREBRO_TOKEN` com `openssl rand -hex 24`. Deixe `CEREBRO_ESCRITA=0` até o usuário pedir escrita. Nunca imprima o conteúdo do `.env` na conversa.
5. **Rode `npm test`** e confirme `fail 0`. Se falhar, mostre só as linhas de erro, não o log inteiro.
6. **Suba a API** em segundo plano (`npm run api`) e confirme `GET /saude` respondendo `{"ok": true}`.
7. **Registre a conexão no cérebro.** Adicione uma linha em `conexoes.md` na tabela de sistemas, domínio "Conhecimento / arquivos" ou "Comunicação", ferramenta `cerebro-integra (API local)`, mecanismo `script`, autenticação `token no .env`, e a data de hoje em "Última leitura OK". Crie `referencias/cerebro-integra-api.md` com as rotas (copie a tabela de `docs/api.md`) e o comando para subir. Use o `/vincular` do kit se estiver disponível para adicionar a rota no manual.
8. **Só se o usuário pedir o bot:** peça o token do BotFather e o ID do chat (explique como obter conforme `docs/telegram.md`), preencha `TELEGRAM_TOKEN` e `TELEGRAM_CHATS`, suba com `npm run bot` e peça ao usuário para mandar `/start`.
9. **Só se o usuário pedir importação:** escreva o mapa de campos em um arquivo `mapas/<nome>.json` (formato em `docs/importadores.md`), rode com `--simular` primeiro, mostre a lista de arquivos que seriam criados, e só então rode de verdade. Depois, se for recorrente, crie a rotina com o `/rotina` do kit e agende o cron com `POST /rotina/execucao` ao final (receita 3 em `docs/receitas.md`).
10. **Relate** em três linhas: onde está o kit, o que está rodando (API, bot), e o que ficou registrado no cérebro. Não repita a documentação.

Regras invioláveis: não edite arquivos do cérebro fora de `conexoes.md`, `referencias/` e do manual (rota); não ligue `CEREBRO_ESCRITA=1` nem `CEREBRO_HOST` sem pedido explícito; não versione `.env`; não exponha tokens em logs, commits ou mensagens.
