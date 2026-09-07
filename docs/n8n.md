# n8n

`n8n/fluxo-exemplo.json` é um workflow pronto: **webhook → GET /buscar na API do cérebro → resposta JSON**. Serve de molde para qualquer automação que precise consultar o cérebro.

## Importar

1. Suba a API do cérebro (`npm run api`) em uma máquina que o n8n alcance. Se o n8n roda em Docker na mesma máquina, use `http://host.docker.internal:4650` (ou o IP da máquina) e `CEREBRO_HOST=0.0.0.0` **só se** tiver `CEREBRO_TOKEN` e a rede for confiável. Ver [seguranca.md](seguranca.md).
2. No n8n, defina as variáveis de ambiente do processo (`docker-compose`, `.env` do n8n ou o painel de variáveis):

```
CEREBRO_API=http://host.docker.internal:4650
CEREBRO_TOKEN=<o mesmo do .env do cerebro-integra>
```

3. Workflows → Import from file → `n8n/fluxo-exemplo.json`.
4. Ative o workflow. A URL do webhook aparece no nó "Webhook" (`.../webhook/cerebro-buscar`).

## Testar

```bash
curl -X POST https://seu-n8n/webhook/cerebro-buscar \
  -H 'Content-Type: application/json' \
  -d '{"q": "catálogo", "limite": 3}'
```

Resposta:

```json
{
  "consulta": "catálogo",
  "total": 3,
  "itens": [
    { "titulo": "Reunião de kickoff da fase 2", "caminho": "fontes/2026-08-18-reuniao-kickoff-fase-2.md", "trecho": "..." }
  ]
}
```

## Os nós

| Nó | Tipo | Faz |
|---|---|---|
| Webhook | `n8n-nodes-base.webhook` v2 | POST em `/cerebro-buscar`, responde pelo nó de resposta |
| Buscar no cérebro | `n8n-nodes-base.httpRequest` v4.2 | `GET {{$env.CEREBRO_API}}/buscar?q=...&limite=...` com `Authorization: Bearer {{$env.CEREBRO_TOKEN}}` |
| Formatar resposta | `n8n-nodes-base.code` v2 | Reduz a resposta a `{ consulta, total, itens[] }` |
| Responder | `n8n-nodes-base.respondToWebhook` v1.1 | Devolve o JSON a quem chamou |

O token vem sempre de `$env`, nunca de um valor colado no workflow. Assim o JSON pode ser versionado e compartilhado.

## Variações

**Consultar prioridades antes de agir.** Troque a URL por `{{$env.CEREBRO_API}}/prioridades` e use `$json.itens` em um nó IF para decidir o próximo passo.

**Registrar decisão a partir de um formulário.** Nó HTTP Request com método POST, URL `{{$env.CEREBRO_API}}/decisao`, corpo JSON `{ "titulo": "{{$json.titulo}}", "decisao": "{{$json.decisao}}", "porque": "{{$json.porque}}" }`. A API precisa estar com `CEREBRO_ESCRITA=1`.

**Alimentar `fontes/` com e-mails ou formulários.** POST em `/fonte` com `titulo` e `corpo`. A API não duplica se o mesmo título chegar duas vezes no mesmo dia.

**Rotina noturna com evidência.** Schedule Trigger → Execute Command (`node importadores/importar-json.mjs ...`) → HTTP Request POST `/rotina/execucao` com `{ "id": "importar-catalogo", "resultado": "ok", "saida": "{{$json.stdout}}" }`. Receita completa em [receitas.md](receitas.md).

**Make, Zapier, Pipedream.** O mesmo contrato HTTP funciona: um módulo HTTP com o cabeçalho `Authorization: Bearer` e as rotas de [api.md](api.md).
