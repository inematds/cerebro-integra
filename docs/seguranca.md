# Segurança

O cérebro guarda quem você é, o que decide, com quem trabalha. Este kit é a porta para fora dele; então a porta vem trancada por padrão e cada abertura é explícita.

## Modelo de ameaça

| Risco | Proteção |
|---|---|
| Alguém na rede local lê seu cérebro pela API | Escuta só em `127.0.0.1`. `CEREBRO_HOST` precisa ser definido de propósito. |
| Alguém com acesso à porta lê sem autorização | `CEREBRO_TOKEN`: `Authorization: Bearer`, comparação em tempo constante. Só `/saude` fica aberta. |
| Um cliente mal-intencionado lê arquivos fora do cérebro (`../../.ssh/id_rsa`) | `resolverCaminhoSeguro`: rejeita absoluto, `..`, `%2e%2e`, e resolve symlinks (`realpath`) exigindo que o destino esteja dentro da raiz. Só `.md` e `.txt`. |
| Um cliente sobrescreve ou apaga notas | Escrita desligada por padrão (`CEREBRO_ESCRITA=1` para ligar). Mesmo ligada, só anexa: `gravarFonte` usa `flag: 'wx'` (falha se existe), decisões e execuções são adicionadas, nunca editadas. Não há rota de apagar nem de editar. |
| Corpo gigante derruba o processo | POST limitado a 1 MB (`413`). |
| Um site qualquer chama a API pelo seu navegador | CORS desligado. `CEREBRO_CORS=<origem>` libera uma origem; `*` só em desenvolvimento. |
| Um desconhecido conversa com o bot | `TELEGRAM_CHATS` obrigatório; chats fora da lista são ignorados **em silêncio** (o bot não confirma que existe). Sem a lista, o bot se recusa a subir. |
| O token do Telegram vaza em log ou erro | `ocultarToken` passa por toda mensagem de erro; a URL da Bot API (que contém o token) nunca é impressa. |
| `.env` vai parar no git | `.gitignore` já exclui `.env` e `.env.*` (menos `.env.exemplo`). |
| Token colado dentro do workflow n8n | O exemplo usa `$env.CEREBRO_TOKEN`; o teste do repositório falha se aparecer um `Bearer <literal>`. |
| `RESPONDER_CMD` executa o que a mensagem manda | A pergunta vai por **stdin**, não por argumento de shell; o comando é fixo (do `.env`). Ainda assim, o comando tem os seus poderes: use um agente em modo somente leitura quando o bot estiver em grupo. |

## O que o kit nunca faz

- Não lê nem imprime o `.env`.
- Não edita `wiki/`, `contexto/`, `AGENTS.md`/`CLAUDE.md`. Só grava em `fontes/`, `decisoes/registro.md` e `rotinas/registro.md`, e só quando a escrita está ligada.
- Não chama nenhum modelo de linguagem nem serviço externo por conta própria. As únicas conexões de saída são a Bot API do Telegram (quando o bot está ligado) e o que você configurar em `RESPONDER_CMD`/`STT_CMD`/`TTS_CMD`.
- Não sobrescreve arquivo existente.

## Recomendações por cenário

**Só eu, na minha máquina.** Padrões. Sem token é aceitável porque só processos locais alcançam `127.0.0.1`, mas um token custa nada: `openssl rand -hex 24`.

**API para um site ou app que roda em outro servidor.** Não abra a porta direto. Opções, da melhor para a pior:

1. Túnel SSH ou VPN (WireGuard, Tailscale) e API continua em loopback.
2. Proxy reverso com HTTPS (Caddy, nginx) na frente, `CEREBRO_HOST=127.0.0.1` e o proxy na mesma máquina, token obrigatório.
3. `CEREBRO_HOST=0.0.0.0` com token, só em rede privada.

**Site no navegador chamando a API.** O token não pode ir para o navegador. Chame a API do seu backend, ou gere uma cópia pública (`exportar-wiki.mjs --sem-corpo`) e sirva o JSON estático.

**Bot em grupo.** `CEREBRO_ESCRITA=0` a menos que confie em todos os membros: qualquer um do grupo pode `/fonte` e `/decisao`. Com `RESPONDER_CMD`, use um agente sem permissão de escrita.

**Importadores em cron.** Rodam como o seu usuário, com acesso à pasta. Use `--simular` na primeira vez e confira a lista.

## Checklist antes de expor qualquer coisa

- [ ] `CEREBRO_TOKEN` definido e forte.
- [ ] `CEREBRO_ESCRITA` só onde precisa.
- [ ] `CEREBRO_HOST` continua `127.0.0.1` (ou há proxy/túnel).
- [ ] `TELEGRAM_CHATS` só com IDs que você reconhece.
- [ ] `.env` fora do git (`git status` não mostra).
- [ ] Cérebro versionado? Repositório **privado**.

## Relatar um problema

Abra uma issue em https://github.com/inematds/cerebro-integra sem incluir tokens, caminhos pessoais nem conteúdo do cérebro.
