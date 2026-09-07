# Receitas

Três integrações completas, do zero ao registro no cérebro. Todas usam nomes de exemplo (`meu-cerebro`, `Empresa X`, `catalogo.json`); troque pelos seus.

Pré-requisito comum: kit clonado, `.env` com `CEREBRO_DIR` e `CEREBRO_TOKEN`, `npm test` verde.

---

## Receita 1: meu bot existente passa a responder com o cérebro

**Situação.** Você já tem um bot de Telegram (avisos, alertas, qualquer coisa) em outro código, e quer que ele responda perguntas usando o segundo cérebro sem reescrever nada.

**Estratégia.** O bot existente continua dono do chat. Quando chega uma pergunta, ele chama a API local do cérebro e devolve a resposta. O `telegram/bot.mjs` do kit fica de exemplo, ou pode rodar em paralelo em outro bot.

### Passo 1: subir a API com token

`.env`:

```
CEREBRO_DIR=/home/usuario/meu-cerebro
CEREBRO_TOKEN=6f1d...   # openssl rand -hex 24
CEREBRO_ESCRITA=0
```

```bash
npm run api
curl http://127.0.0.1:4650/saude    # {"ok":true,...}
```

Como serviço: seção systemd do [INSTALAR.md](../INSTALAR.md).

### Passo 2: no seu bot, um handler que consulta a API

Exemplo em Node (qualquer biblioteca de bot; aqui só a parte que importa):

```js
const API = 'http://127.0.0.1:4650';
const AUTH = { Authorization: `Bearer ${process.env.CEREBRO_TOKEN}` };

async function responderComCerebro(pergunta) {
  const r = await fetch(`${API}/buscar?q=${encodeURIComponent(pergunta)}&limite=3`, { headers: AUTH });
  const { resultados } = await r.json();
  if (!resultados.length) return `Não achei nada sobre "${pergunta}".`;
  return resultados.map((x, i) => `${i + 1}. ${x.titulo}\n${x.trecho}`).join('\n\n');
}

// no seu handler de mensagem:
if (texto.startsWith('/cerebro ')) {
  await enviar(chatId, await responderComCerebro(texto.slice(9)));
}
```

Em Python:

```python
import os, requests
API = "http://127.0.0.1:4650"
AUTH = {"Authorization": f"Bearer {os.environ['CEREBRO_TOKEN']}"}

def responder_com_cerebro(pergunta: str) -> str:
    r = requests.get(f"{API}/buscar", params={"q": pergunta, "limite": 3}, headers=AUTH, timeout=5).json()
    if not r["resultados"]:
        return f'Não achei nada sobre "{pergunta}".'
    return "\n\n".join(f"{i+1}. {x['titulo']}\n{x['trecho']}" for i, x in enumerate(r["resultados"]))
```

### Passo 3 (opcional): resposta com IA

Se quiser que o bot responda em prosa, e não com trechos, chame o agente na pasta do cérebro:

```js
import { spawn } from 'node:child_process';
function perguntarAoAgente(pergunta) {
  return new Promise((resolve) => {
    const p = spawn('claude', ['-p'], { cwd: process.env.CEREBRO_DIR });
    let saida = ''; p.stdout.on('data', (c) => { saida += c; });
    p.on('close', () => resolve(saida.trim()));
    p.stdin.end(pergunta);
  });
}
```

É exatamente o que `RESPONDER_CMD` faz no bot do kit (`telegram/bot.mjs`, função `responderComComando`), se preferir copiar de lá.

### Passo 4: prioridades e contexto

Dois atalhos úteis no seu bot: `GET /prioridades` → `itens[]` para um comando `/prioridades`; `GET /contexto` para um `/quem-sou`.

### Passo 5: registrar a conexão no cérebro

Em `conexoes.md`, linha do domínio "Comunicação":

```
| 4 | Comunicação | Telegram (meu bot) + cerebro-integra API | script | token no .env | 2026-09-07 |
```

E rode `/vincular referencias/telegram-api.md "quando precisar mandar ou responder pelo bot"` no agente do kit, apontando para um guia curto com o que o handler faz.

**Resultado.** O bot que já existia responde `/cerebro <pergunta>` com o que está nas notas. Nada do cérebro foi alterado; só uma linha em `conexoes.md`.

---

## Receita 2: meu site consulta o cérebro

**Situação.** Um site (loja, portfólio, base de conhecimento) precisa mostrar conteúdo que vive na wiki do cérebro: fichas de produto, páginas de conceito, uma busca.

**Estratégia.** Duas variantes. **(A) estática:** exportar a wiki para JSON e publicar junto com o site; zero exposição da API. **(B) dinâmica:** o backend do site consulta a API em tempo real.

### Variante A: JSON estático (recomendada)

```bash
node importadores/exportar-wiki.mjs --saida /caminho/do/site/public/wiki.json
```

`wiki.json` traz `paginas[]` com `slug`, `titulo`, `tipo`, `resumo`, `links[]`, `corpo`. No site:

```html
<input id="q" placeholder="Buscar no catálogo">
<ul id="lista"></ul>
<script type="module">
  const { paginas } = await fetch('/wiki.json').then((r) => r.json());
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  q.oninput = () => {
    const t = norm(q.value);
    lista.innerHTML = paginas
      .filter((p) => norm(p.titulo + ' ' + p.corpo).includes(t))
      .slice(0, 10)
      .map((p) => `<li><strong>${p.titulo}</strong> — ${p.resumo}</li>`)
      .join('');
  };
</script>
```

Só publique o que pode ser público. Filtre por `tipo` ou por uma tag antes de gravar o JSON (um `jq` resolve: `jq '.paginas |= map(select(.frontmatter.publico == "sim"))'`).

Automatize: rode o export no build do site, ou toda noite com cron (receita 3 mostra o padrão de rotina registrada).

### Variante B: backend consulta a API

O backend (Node, Python, PHP, o que for) roda na mesma máquina da API ou alcança ela por túnel. Nunca chame a API direto do navegador com o token.

```js
// rota do seu backend: GET /api/busca?q=
app.get('/api/busca', async (req, res) => {
  const r = await fetch(`http://127.0.0.1:4650/buscar?q=${encodeURIComponent(req.query.q)}&limite=5&pasta=wiki`, {
    headers: { Authorization: `Bearer ${process.env.CEREBRO_TOKEN}` },
  });
  const { resultados } = await r.json();
  res.json(resultados.map(({ caminho, titulo, trecho }) => ({ caminho, titulo, trecho })));
});
```

`pasta=wiki` garante que só a camada interpretada (e não `fontes/`, `contexto/`, `decisoes/`) aparece no site.

Para exibir uma página inteira: `GET /pagina?caminho=wiki/entidades/empresa-x.md` e renderize `conteudo` com o conversor de Markdown que o site já usa.

Se o site e a API estão em máquinas diferentes: túnel SSH (`ssh -L 4650:127.0.0.1:4650 servidor-do-cerebro`) ou proxy com HTTPS. Detalhes em [seguranca.md](seguranca.md).

### Registrar no cérebro

`conexoes.md`, domínio "Conhecimento / arquivos": `| 7 | Conhecimento / arquivos | Site (wiki.json exportado) | exportacao | — | 2026-09-07 |`.

E uma decisão, porque isso muda como a wiki é escrita (o que é público):

```bash
curl -X POST -H "Authorization: Bearer $CEREBRO_TOKEN" -H 'Content-Type: application/json' \
  http://127.0.0.1:4650/decisao \
  -d '{"titulo":"Site lê a wiki exportada","decisao":"O site consome wiki.json gerado toda noite; páginas públicas levam publico: sim no frontmatter.","porque":"Evita expor a API e mantém uma fonte só.","alternativas":"API dinâmica com proxy."}'
```

(precisa de `CEREBRO_ESCRITA=1` na API; ou escreva a entrada à mão.)

**Resultado.** O site mostra o que está na wiki, atualizado a cada export, sem uma segunda cópia do conteúdo para manter.

---

## Receita 3: meu banco alimenta a wiki toda noite, com rotina registrada

**Situação.** Um sistema (loja, CRM, planilha) gera registros que deveriam virar conhecimento no cérebro. Você quer que toda noite os novos registros entrem em `fontes/`, que a execução fique registrada em `rotinas/registro.md` (a evidência que o `/auditar` procura), e que o `/wiki` do kit processe as fontes novas quando você pedir.

**Estratégia.** Exportação do banco → `importar-json` (ou `importar-csv`) → `POST /rotina/execucao`. Tudo em um script de shell chamado pelo cron.

### Passo 1: exportar do banco

Qualquer coisa que gere JSON ou CSV serve. Exemplos:

```bash
# PostgreSQL → JSON
psql "$DATABASE_URL" -At -c "select json_agg(p) from (select sku, nome, descricao, categoria, preco, atualizado_em from produtos where atualizado_em > now() - interval '1 day') p" > /dados/catalogo.json

# SQLite → CSV
sqlite3 -header -csv loja.db "select sku, nome, descricao, categoria, preco, atualizado_em from produtos" > /dados/catalogo.csv

# Planilha do Google (publicada como CSV)
curl -sL 'https://docs.google.com/spreadsheets/d/<id>/export?format=csv' > /dados/catalogo.csv
```

### Passo 2: o mapa de campos

`mapas/catalogo.json`:

```json
{
  "titulo": "nome",
  "data": "atualizado_em",
  "id": "sku",
  "prefixo": "catalogo",
  "corpo": ["descricao"],
  "tags": "categoria",
  "extras": ["preco"],
  "origem": "banco da loja"
}
```

Teste com `--simular` e confira a lista:

```bash
node importadores/importar-json.mjs /dados/catalogo.json --config mapas/catalogo.json --simular
```

### Passo 3: criar a rotina no cérebro

No agente do kit: `/rotina importar o catálogo do banco para fontes/ toda noite às 23h`. Ele adiciona a linha em "Rotinas ativas" com um ID (digamos `importar-catalogo`). Ou adicione à mão:

```
| importar-catalogo | Importar catálogo para fontes/ | toda noite às 23h | agendado | novas notas em `fontes/` | remover do cron | 2026-09-07 |
```

Regra do kit: rode manualmente duas vezes antes de agendar.

### Passo 4: o script da rotina

`rotinas/importar-catalogo.sh` (dentro do repositório do kit ou do cérebro):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /home/usuario/cerebro-integra
set -a; source .env; set +a

API="http://127.0.0.1:${CEREBRO_PORTA:-4650}"
ID="importar-catalogo"

registrar() {  # resultado, saída, observação
  curl -sS -X POST -H "Authorization: Bearer $CEREBRO_TOKEN" -H 'Content-Type: application/json' \
    "$API/rotina/execucao" \
    -d "$(node -e 'console.log(JSON.stringify({id: process.argv[1], resultado: process.argv[2], saida: process.argv[3], observacao: process.argv[4]}))' "$ID" "$1" "$2" "${3:-}")" > /dev/null
}

# 1. exportar do banco
if ! psql "$DATABASE_URL" -At -c "select coalesce(json_agg(p), '[]') from (select sku, nome, descricao, categoria, preco, atualizado_em from produtos) p" > /dados/catalogo.json; then
  registrar falhou "—" "exportação do banco falhou"; exit 1
fi

# 2. importar para fontes/ (idempotente)
SAIDA="$(node importadores/importar-json.mjs /dados/catalogo.json --config mapas/catalogo.json 2>&1 | head -1)" || {
  registrar falhou "—" "$SAIDA"; exit 1; }

# 3. registrar a execução
registrar ok "$SAIDA"
echo "$SAIDA"
```

A API precisa estar no ar com `CEREBRO_ESCRITA=1` para o `POST /rotina/execucao`. Alternativa sem API: o próprio Node.

```bash
node -e '
  import("./lib/cerebro.mjs").then(({ registrarExecucao, localizarCerebro }) =>
    registrarExecucao(localizarCerebro(process.env.CEREBRO_DIR), { id: "importar-catalogo", resultado: process.argv[1], saida: process.argv[2] }))
' ok "$SAIDA"
```

### Passo 5: agendar

```bash
chmod +x rotinas/importar-catalogo.sh
crontab -e
```

```cron
0 23 * * * /home/usuario/cerebro-integra/rotinas/importar-catalogo.sh >> /home/usuario/logs/importar-catalogo.log 2>&1
```

Ou um timer do systemd, ou um nó Schedule no n8n chamando o script por Execute Command.

### Passo 6: a wiki

As fontes novas ficam em `fontes/` esperando. Quando quiser, no agente do kit: `/wiki ingerir fontes/`. O `/wiki` cria ou atualiza as páginas e escreve em `wiki/log.md`. Se preferir automatizar também isso, adicione ao script um passo com `RESPONDER_CMD`-style: `echo "/wiki ingerir fontes/" | claude -p` rodando em `CEREBRO_DIR`; comece manual e só agende depois de ver o resultado duas vezes.

### O que fica registrado

`rotinas/registro.md` depois de três noites:

```
| Data e hora | ID | Resultado | Saída produzida | Observação |
|---|---|---|---|---|
| 2026-09-09 23:00 | importar-catalogo | ok | criados: 2 · pulados (já existiam): 340 | — |
| 2026-09-08 23:00 | importar-catalogo | falhou | — | exportação do banco falhou |
| 2026-09-07 23:00 | importar-catalogo | ok | criados: 340 · pulados (já existiam): 0 | — |
```

É isso que transforma "tenho um cron" em cadência com evidência. O `/auditar` do kit lê essa tabela.

**Resultado.** Toda noite o banco vira notas, sem duplicar, com registro. A wiki cresce a partir delas quando você pede.
