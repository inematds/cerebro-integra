# Importadores e exportador

Quatro scripts em `importadores/`. Os três importadores gravam em `fontes/` (o material bruto do cérebro), seguindo o nome `AAAA-MM-DD-slug.md`. Depois, o `/wiki` do kit transforma essas fontes em páginas interligadas. O exportador faz o caminho inverso: `wiki/` → JSON.

Todos aceitam `--cerebro DIR` (ou `CEREBRO_DIR` no `.env`) e `--simular` (calcula e lista, não grava).

## Princípios

- **Uma nota por item.** Cada produto, registro, linha ou arquivo vira um `.md` próprio, com frontmatter.
- **Idempotência.** O nome do arquivo é determinístico (data + slug de um campo estável). Se já existe, o item é pulado. Rodar duas vezes, ou toda noite, não duplica.
- **Data estável.** Item sem data usa `dataPadrao` do mapa ou a data de modificação do arquivo de origem. Nunca "hoje" implícito.
- **Nunca sobrescrever.** O importador não edita o que já está em `fontes/`. Para reimportar um item, apague a nota antes.

## Mapa de campos (`--config`)

Arquivo JSON que diz de onde vem cada parte da nota. Caminhos com ponto (`a.b.c`) funcionam.

```json
{
  "titulo": "nome",
  "data": "criado_em",
  "corpo": ["descricao", "observacoes"],
  "tags": "categorias",
  "url": "link",
  "id": "sku",
  "prefixo": "catalogo",
  "extras": ["preco", "estoque"],
  "origem": "catalogo da loja",
  "dataPadrao": "2026-01-01"
}
```

| Chave | Tipo | Efeito |
|---|---|---|
| `titulo` | campo | Título da nota (`# ...`). Se ausente, tenta `titulo`, `title`, `nome`, `name`. |
| `data` | campo | Data da nota. Aceita `AAAA-MM-DD`, ISO com hora, `DD/MM/AAAA`. |
| `corpo` | campo, lista ou modelo | Campo simples: o valor. Lista: uma seção `## campo` por item. Modelo `"{a} e {b}"`: preenchido. Ausente: todos os campos restantes viram `- **campo:** valor`. |
| `tags` | campo | String `"a, b"` ou lista → `tags:` no frontmatter. |
| `url` | campo | `url:` no frontmatter. |
| `id` | campo | Usado no nome do arquivo (`<prefixo>-<id>`). Sem `id`, usa o slug do título. |
| `prefixo` | texto | Prefixo do slug. Útil para separar origens (`catalogo-`, `clientes-`). |
| `extras` | lista | Campos copiados para o frontmatter como estão. |
| `origem` | texto | `origem:` no frontmatter (padrão `importador`). |
| `dataPadrao` | data | Para itens sem data. |

## importar-json

```bash
node importadores/importar-json.mjs catalogo.json --config mapas/catalogo.json
```

Aceita um array ou um objeto com `items`, `itens`, `dados`, `data`, `registros`, `results` ou `resultados`.

Entrada:

```json
{
  "items": [
    { "sku": "CN-01", "nome": "Caneca Azul", "criado_em": "2026-05-01", "descricao": "Cerâmica esmaltada.", "categorias": "casa, presente", "link": "https://exemplo.test/cn-01", "preco": "39,90" }
  ]
}
```

Saída `fontes/2026-05-01-catalogo-cn-01.md`:

```markdown
---
tipo: fonte
data: 2026-05-01
origem: importador
id: CN-01
url: https://exemplo.test/cn-01
tags:
  - casa
  - presente
preco: 39,90
---
# Caneca Azul

## descricao

Cerâmica esmaltada.
```

Terminal:

```
criados: 1 · pulados (já existiam): 0
  + fontes/2026-05-01-catalogo-cn-01.md
```

Segunda execução: `criados: 0 · pulados (já existiam): 1`.

## importar-csv

```bash
node importadores/importar-csv.mjs produtos.csv --config mapas/catalogo.json [--separador ";"]
```

A primeira linha é o cabeçalho; os nomes das colunas são os campos do mapa. O parser trata aspas duplas, `""` como escape, vírgula dentro de aspas, CRLF e BOM. O separador é detectado entre `,` e `;` pela primeira linha; `--separador` força.

```csv
sku,nome,criado_em,descricao,categorias
CN-01,"Caneca ""Azul""",2026-05-01,"Cerâmica, 300 ml","casa, presente"
PR-02,Prato,2026-05-02,Simples,cozinha
```

Gera `fontes/2026-05-01-catalogo-cn-01.md` e `fontes/2026-05-02-catalogo-pr-02.md`.

Exportações de planilha (Google Sheets, LibreOffice, Excel → CSV UTF-8) funcionam direto.

## importar-pasta

```bash
node importadores/importar-pasta.mjs ~/Documentos/notas --prefixo notas [--recursivo]
```

Copia `.md` e `.txt` de uma pasta externa para `fontes/`:

- Nome: `AAAA-MM-DD-<prefixo>-<slug-do-nome>.md`. Se o nome já começa com data (`2026-03-03-ata.md`), ela é respeitada; senão, usa a data de modificação do arquivo.
- `.txt` (ou `.md` sem título `#`) ganha frontmatter e um título a partir do nome.
- Cada execução anexa uma linha em `fontes/importacoes.log`:

```
2026-09-07 23:00 | origem: /home/usuario/Documentos/notas | criados: 3 | pulados: 0
```

Bom para: exportações de apps de notas, transcrições que caem em uma pasta, documentos compartilhados.

## exportar-wiki

```bash
node importadores/exportar-wiki.mjs --saida wiki.json [--sem-corpo]
```

Lê `wiki/` (ignora `README.md`, `index.md`, `log.md`) e gera:

```json
{
  "geradoEm": "2026-09-07T12:00:00.000Z",
  "cerebro": "meu-cerebro",
  "total": 4,
  "paginas": [
    {
      "slug": "empresa-x",
      "caminho": "wiki/entidades/empresa-x.md",
      "categoria": "entidades",
      "titulo": "Empresa X",
      "tipo": "entidade",
      "atualizado": "2026-08-20",
      "fontes": [],
      "frontmatter": { "tipo": "entidade", "atualizado": "2026-08-20" },
      "links": ["projeto-alfa", "segundo-cerebro"],
      "resumo": "Cliente principal. Ver projeto-alfa e segundo-cerebro.",
      "corpo": "# Empresa X\nCliente principal. ..."
    }
  ],
  "links": [ { "de": "empresa-x", "para": "projeto-alfa" } ],
  "diagnostico": { "linksQuebrados": [], "paginasOrfas": ["reuniao-kickoff-fase-2"] }
}
```

Usos: indexar em uma busca (Meilisearch, Typesense, Lunr), gerar um site estático, desenhar o grafo, alimentar um painel. `--sem-corpo` deixa só metadados e links.

## Agendar

Cron toda noite, com registro na rotina do cérebro: receita 3 em [receitas.md](receitas.md).
