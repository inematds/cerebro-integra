# Bot de Telegram

`telegram/bot.mjs` conversa com a Bot API por long polling usando só `fetch`. Não precisa de porta aberta, HTTPS nem domínio: roda em casa, atrás de NAT.

## 1. Criar o bot no BotFather

1. No Telegram, abra uma conversa com `@BotFather`.
2. Mande `/newbot`. Ele pede um nome de exibição e um nome de usuário terminado em `bot` (ex.: `meu_cerebro_bot`).
3. Ele responde com o **token** (algo como `123456789:AAF...`). Guarde no `.env` como `TELEGRAM_TOKEN`. Nunca cole em chat, commit ou log.
4. Opcional: `/setcommands` no BotFather e cole a lista abaixo para o menu de comandos aparecer:

```
buscar - busca nas notas do cérebro
prioridades - prioridades do trimestre
contexto - quem sou, trabalho, prioridades
decisao - registra decisão: título | decisão | porquê
fonte - grava uma nota em fontes/
rotina - registra execução: id ok|falhou [obs]
ajuda - lista os comandos
```

## 2. Descobrir o ID do chat

O bot só responde a chats listados em `TELEGRAM_CHATS`. Para saber o seu ID:

- **Jeito rápido:** mande qualquer mensagem para o seu bot novo, depois abra no navegador `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates`. O campo `message.chat.id` é o número. (Feche a aba depois; a URL tem o token.)
- **Jeito sem token na URL:** encaminhe uma mensagem sua para o bot `@userinfobot` ou similar, que responde com o seu ID.
- **Grupos:** adicione o bot ao grupo, mande uma mensagem, e use o `getUpdates`. IDs de grupo são negativos (ex.: `-1001234567890`). Em grupos, desligue o modo de privacidade no BotFather (`/setprivacy` → Disable) se quiser que o bot veja texto livre; comandos com `/` ele vê sempre.

No `.env`:

```
TELEGRAM_TOKEN=123456789:AAF...
TELEGRAM_CHATS=123456789,-1001234567890
```

Sem `TELEGRAM_CHATS`, o bot **não sobe**: é proposital.

## 3. Subir

```bash
npm run bot
# [bot] @meu_cerebro_bot · cérebro: /home/usuario/meu-cerebro
# [bot] chats permitidos: 2 · escrita: desligada · responder: busca
```

Como serviço: ver [../INSTALAR.md](../INSTALAR.md), seção systemd.

## 4. Comandos

| Comando | Exemplo | O que faz |
|---|---|---|
| `/buscar <termos>` | `/buscar catálogo prazo` | Até 5 resultados com título, caminho e trecho. Sem acento, todos os termos obrigatórios. |
| `/prioridades` | | Itens de `contexto/prioridades.md`. |
| `/contexto` | | `sobre-mim`, `sobre-o-trabalho` e `prioridades`, na sequência. |
| `/decisao <título> \| <decisão> \| <porquê>` | `/decisao Usar API \| O site consulta a API \| Uma fonte só` | Anexa em `decisoes/registro.md` com a data da mensagem. Exige escrita. |
| `/fonte <texto>` | `/fonte Ideia: testar o bot com a equipe` | Cria `fontes/AAAA-MM-DD-<slug-da-primeira-linha>.md`. Exige escrita. |
| *(mensagem encaminhada)* | | Qualquer mensagem encaminhada ao bot vira fonte, sem precisar de comando. Exige escrita. |
| `/rotina <id> <ok\|falhou> [obs]` | `/rotina importar-catalogo ok 12 notas` | Linha no topo de "Registro de execuções". Avisa se o `id` não está na tabela de rotinas ativas. Exige escrita. |
| `/ajuda`, `/start`, `/help` | | Lista os comandos. |
| texto livre | `o que decidimos sobre o catálogo?` | Com `RESPONDER_CMD`: a resposta do comando. Sem: resultados da busca. |

Comandos com `@nome_do_bot` (grupos) funcionam. Mensagens de chats não permitidos são ignoradas em silêncio, sem confirmar que o bot existe.

Respostas maiores que 4096 caracteres são divididas em partes.

## 5. Escrita

Por padrão o bot só lê. Para `/decisao`, `/fonte` e `/rotina`:

```
CEREBRO_ESCRITA=1
```

A escrita é sempre anexar. Uma fonte com o mesmo título no mesmo dia não é sobrescrita: o bot avisa "Já existia".

## 6. Texto livre com IA: `RESPONDER_CMD`

Sem `RESPONDER_CMD`, texto livre devolve a busca. Com ele, o bot roda o comando **dentro da pasta do cérebro**, passa a pergunta na entrada padrão e devolve a saída (até 4000 caracteres, 120 s de limite).

```
RESPONDER_CMD=claude -p
```

Como o comando roda na raiz do cérebro, um agente como o Claude Code lê o `CLAUDE.md` (manual, mapa de rotas) automaticamente e responde com o contexto certo. Funciona com qualquer comando que leia stdin e escreva stdout:

```
RESPONDER_CMD=codex exec -
RESPONDER_CMD=./scripts/responder.sh
```

Cuidados: o comando tem os mesmos poderes que você no terminal. Use um agente em modo somente leitura ou com permissões restritas quando o bot estiver em grupo. Se o comando falhar, o bot cai para a busca.

## 7. Como funciona por dentro

- `interpretarComando(texto)` → `{ comando, args }`. Puro.
- `processarMensagem(mensagem, deps)` → texto da resposta ou `null`. Sem rede; recebe `raiz`, `chatsPermitidos`, `escrita`, `responder`. É o que os testes exercitam.
- `criarClienteTelegram(token, fetch)` → `getUpdates`, `sendMessage`, `getMe`. `fetch` injetável.
- `iniciarBot()` → loop de polling com `offset`, `timeout: 30`. Em erro, espera 5 s e tenta de novo.
- `ocultarToken(texto, token)` passa por toda mensagem de erro antes de ir para o log.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Bot não responde nada | seu chat não está em `TELEGRAM_CHATS`; ou outro processo do mesmo bot está fazendo polling (só um por token) |
| "Escrita desligada" | falta `CEREBRO_ESCRITA=1` |
| `Telegram getMe: Unauthorized` | token errado ou revogado |
| Texto livre demora e cai na busca | `RESPONDER_CMD` passou de 120 s ou saiu com erro |
