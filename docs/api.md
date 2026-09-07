# API HTTP local

`api/servidor.mjs` expõe o cérebro em JSON. Padrões: `http://127.0.0.1:4650`, sem token, sem escrita, sem CORS.

```bash
npm run api
# ou
CEREBRO_DIR=/meu/cerebro CEREBRO_TOKEN=abc CEREBRO_ESCRITA=1 node api/servidor.mjs
```

## Convenções

- Todas as respostas são `application/json; charset=utf-8`, com `Cache-Control: no-store`.
- Erros têm a forma `{ "erro": "mensagem" }` e o status HTTP apropriado.
- Com `CEREBRO_TOKEN` definido, toda rota **exceto `/saude`** exige `Authorization: Bearer <token>`. Sem ele: `401`.
- `POST` exige `CEREBRO_ESCRITA=1`. Sem: `403`. Corpo JSON até 1 MB; inválido: `400`. Sucesso: `201`.
- `OPTIONS` só responde `204` com `CEREBRO_CORS`; senão `403`.
- Caminhos são sempre relativos à raiz do cérebro, com barra normal.

Nos exemplos abaixo, `$T` é o token e a API está na porta padrão.

---

## GET /saude

Estado do serviço. Aberta mesmo com token (para monitoramento).

```bash
curl http://127.0.0.1:4650/saude
```

```json
{
  "ok": true,
  "versao": "1.0.0",
  "cerebro": "meu-cerebro",
  "escrita": false,
  "tokenExigido": true,
  "rotas": ["GET /saude", "GET /contexto", "GET /prioridades", "GET /buscar?q=&limite=", "GET /pagina?caminho=", "GET /projetos", "GET /conexoes", "GET /rotinas", "POST /decisao", "POST /fonte", "POST /rotina/execucao"]
}
```

## GET /contexto

`contexto/sobre-mim.md`, `contexto/sobre-o-trabalho.md`, `contexto/prioridades.md` (sem frontmatter) e a seção "Mapa de rotas" do manual. Campo ausente vem `null`.

```bash
curl -H "Authorization: Bearer $T" http://127.0.0.1:4650/contexto
```

```json
{
  "sobreMim": "# Sobre mim\nSou consultor e trabalho no [[projeto-alfa]] com a [[empresa-x]].",
  "sobreOTrabalho": "# Sobre o trabalho\n\nConsultoria para pequenas empresas. ...",
  "prioridades": "# Prioridades do trimestre\n\n1. **Entregar a fase 2 do [[projeto-alfa]]** ...",
  "mapaDeRotas": "Se precisar de... → olhe em...\n\n- Quem sou, o que faço, para quem → `contexto/sobre-mim.md` ..."
}
```

## GET /prioridades

Texto e itens da lista (numerada ou com marcador) que vêm antes de qualquer seção "Não é prioridade".

```bash
curl -H "Authorization: Bearer $T" http://127.0.0.1:4650/prioridades
```

```json
{
  "texto": "# Prioridades do trimestre\n\n1. **Entregar a fase 2 ...",
  "itens": [
    "Entregar a fase 2 do [[projeto-alfa]] até o fim do trimestre.",
    "Organizar o catálogo de produtos da [[empresa-x]] em uma base consultável.",
    "Reduzir o tempo de resposta a clientes para menos de um dia útil."
  ],
  "atualizado": "2026-09-01"
}
```

## GET /buscar?q=&limite=&pasta=

Busca em todos os `.md`/`.txt` do cérebro. Termos sem acento e sem caixa; **todos** os termos precisam aparecer. `limite` padrão 10, máximo 100. `pasta` restringe (ex.: `wiki`, `fontes`).

```bash
curl -H "Authorization: Bearer $T" 'http://127.0.0.1:4650/buscar?q=catalogo%20fase%202&limite=2'
```

```json
{
  "consulta": "catalogo fase 2",
  "total": 2,
  "resultados": [
    {
      "caminho": "fontes/2026-08-18-reuniao-kickoff-fase-2.md",
      "titulo": "Reunião de kickoff da fase 2",
      "pontos": 19,
      "trecho": "fase 2 do Projeto Alfa começa em setembro e cobre o catálogo de produtos. - O catálogo hoje vive em uma planilha com 340 itens"
    },
    {
      "caminho": "wiki/conceitos/projeto-alfa.md",
      "titulo": "Projeto Alfa",
      "pontos": 12,
      "trecho": "..."
    }
  ]
}
```

Sem `q`: `400 { "erro": "Informe ?q= com os termos." }`.

## GET /pagina?caminho=

Lê um arquivo `.md` ou `.txt` pelo caminho relativo.

```bash
curl -H "Authorization: Bearer $T" 'http://127.0.0.1:4650/pagina?caminho=wiki/entidades/empresa-x.md'
```

```json
{
  "caminho": "wiki/entidades/empresa-x.md",
  "titulo": "Empresa X",
  "frontmatter": { "tipo": "entidade", "atualizado": "2026-08-20" },
  "conteudo": "---\ntipo: entidade\natualizado: 2026-08-20\n---\n# Empresa X\nCliente principal. Ver [[projeto-alfa]] e [[segundo-cerebro]].\n"
}
```

Erros: `403` para caminho fora do cérebro (`..`, absoluto, symlink) ou extensão não permitida; `404` se não existe.

## GET /projetos

Um item por `projetos/<nome>/README.md`. `estado` é extraído de uma linha `Estado: ...` quando existe.

```bash
curl -H "Authorization: Bearer $T" http://127.0.0.1:4650/projetos
```

```json
{
  "projetos": [
    { "nome": "projeto-alfa", "titulo": "Projeto Alfa", "estado": "em andamento", "atualizado": null, "caminho": "projetos/projeto-alfa/README.md" }
  ]
}
```

## GET /conexoes

A tabela de `conexoes.md` como objetos (chaves derivadas do cabeçalho, sem acento).

```bash
curl -H "Authorization: Bearer $T" http://127.0.0.1:4650/conexoes
```

```json
{
  "conexoes": [
    { "_": "1", "dominio": "Receita / finanças", "ferramenta": "_preenchido por /iniciar_", "mecanismo": "não conectado", "autenticacao": "—", "ultima_leitura_ok": "—" }
  ]
}
```

## GET /rotinas

Rotinas ativas de `rotinas/registro.md`.

```json
{ "rotinas": [ { "id": "importar-catalogo", "nome": "Importar catálogo para fontes/", "gatilho": "toda noite às 23h", "mecanismo": "agendado" } ] }
```

---

## POST /decisao

Anexa uma entrada em `decisoes/registro.md` no formato do kit. Obrigatórios: `titulo`, `decisao`. Opcionais: `porque`, `alternativas`, `responsavel`, `data` (AAAA-MM-DD; padrão hoje).

```bash
curl -X POST -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  http://127.0.0.1:4650/decisao \
  -d '{"titulo":"Usar a API local no site","decisao":"O site consulta /buscar em vez de ler a planilha.","porque":"Uma fonte só.","responsavel":"consultor"}'
```

```json
{ "ok": true, "caminho": "decisoes/registro.md", "data": "2026-09-07", "titulo": "Usar a API local no site" }
```

Gera:

```markdown
## 2026-09-07: Usar a API local no site

**Decisão:** O site consulta /buscar em vez de ler a planilha.

**Por quê:** Uma fonte só.

**Alternativas consideradas:** não informadas.

**Responsável:** consultor
```

Faltando campo: `400 { "erro": "Decisão precisa de \"titulo\" e \"decisao\"." }`.

## POST /fonte

Cria `fontes/AAAA-MM-DD-<slug>.md`. Obrigatório: `titulo`. Opcionais: `corpo`, `data`, `slug`, `frontmatter` (objeto com campos extras). **Nunca sobrescreve**: se o arquivo já existe, `criado: false`.

```bash
curl -X POST -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  http://127.0.0.1:4650/fonte \
  -d '{"titulo":"Ligação com fornecedor","corpo":"Prazo de entrega passa para 10 dias.","frontmatter":{"origem":"telefone"}}'
```

```json
{ "ok": true, "criado": true, "caminho": "fontes/2026-09-07-ligacao-com-fornecedor.md" }
```

Arquivo gerado:

```markdown
---
tipo: fonte
data: 2026-09-07
origem: telefone
---
# Ligação com fornecedor

Prazo de entrega passa para 10 dias.
```

Segunda chamada igual: `201 { "ok": true, "criado": false, "caminho": "..." }`.

## POST /rotina/execucao

Insere uma linha no topo da tabela "Registro de execuções" em `rotinas/registro.md`. Obrigatórios: `id`, `resultado` (`ok`, `falhou` ou texto). Opcionais: `saida`, `observacao`, `dataHora` (padrão agora, `AAAA-MM-DD HH:MM`).

```bash
curl -X POST -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  http://127.0.0.1:4650/rotina/execucao \
  -d '{"id":"importar-catalogo","resultado":"ok","saida":"12 notas novas"}'
```

```json
{ "ok": true, "caminho": "rotinas/registro.md", "dataHora": "2026-09-07 23:00", "id": "importar-catalogo", "rotinaConhecida": true }
```

`rotinaConhecida: false` avisa que o `id` não está na tabela de rotinas ativas (a linha é registrada mesmo assim).

---

## Códigos de erro

| Status | Quando |
|---|---|
| 400 | parâmetro ou campo obrigatório faltando; JSON inválido |
| 401 | token exigido e ausente/incorreto |
| 403 | escrita desligada; caminho fora do cérebro; CORS desligado em `OPTIONS` |
| 404 | rota desconhecida (a resposta lista as rotas); página inexistente |
| 405 | método não suportado |
| 413 | corpo maior que 1 MB |
| 500 | erro inesperado (a mensagem vem em `erro`) |

## Uso a partir de JavaScript

```js
const API = 'http://127.0.0.1:4650';
const cabecalhos = { Authorization: `Bearer ${process.env.CEREBRO_TOKEN}` };

const { resultados } = await fetch(`${API}/buscar?q=${encodeURIComponent('catálogo')}`, { headers: cabecalhos }).then((r) => r.json());
```

Uso no navegador exige `CEREBRO_CORS` com a origem do site. Não coloque o token em código que vai ao navegador: chame a API do seu backend.
