# Rotinas

Rotinas ativas e registro de execuções. Criadas por `/rotina`. O `/auditar` usa este arquivo como evidência de cadência: uma rotina só conta se tiver execuções registradas.

## Rotinas ativas

| ID | Nome | Gatilho | Mecanismo | Saída esperada | Como parar | Criada em |
|---|---|---|---|---|---|---|
| importar-catalogo | Importar catálogo para fontes/ | toda noite às 23h | agendado | novas notas em `fontes/` | remover do cron | 2026-08-20 |

**Mecanismos:** `manual` (você roda um comando em dia fixo), `agendado` (cron, agendador do sistema, ou rotina agendada do agente), `evento` (hook, webhook, chegada de arquivo).

## Registro de execuções

Mais recente no topo. Uma linha por execução.

| Data e hora | ID | Resultado | Saída produzida | Observação |
|---|---|---|---|---|
