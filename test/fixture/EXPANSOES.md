# Expansões: o que adicionar conforme o cérebro cresce

O kit começa enxuto de propósito. Adicione estrutura quando a necessidade aparecer, não antes. A regra: o cérebro deve parecer uma empresa pequena e bem organizada, não um porão de acumulador.

## O que já vem (não remova)

| Pasta / arquivo | Para quê |
|---|---|
| `contexto/` | Sobre você, seu trabalho, prioridades. Preenchido por `/iniciar` |
| `referencias/` | Voz, guias de API, procedimentos |
| `decisoes/registro.md` | O que foi decidido e por quê |
| `projetos/` | Um subdiretório por projeto ativo |
| `fontes/` e `wiki/` | Material bruto e as páginas interligadas geradas a partir dele |
| `entrevistas/` | Capturas do `/entrevista` |
| `auditorias/` | Relatórios do `/auditar` e o histórico de notas |
| `rotinas/registro.md` | Rotinas ativas e execuções |
| `arquivo/` | Coisa velha. Mova para cá em vez de apagar |
| `conexoes.md` | Registro de cada sistema que o cérebro alcança |
| `entrevista-inicial.md` | Fonte do `/iniciar`. Edite e rode de novo |
| `AGENTS.md` / `CLAUDE.md` | O manual do agente. O arquivo mais importante |

## O que adicionar depois

| Pasta / arquivo | Adicione quando | Por quê |
|---|---|---|
| `modelos/` | Você se pega copiando o mesmo prompt ou esqueleto de documento | Ponto de partida reutilizável |
| `marca/` | Você gera conteúdo visual (slides, thumbnails, carrosséis) | Logos, paleta, fontes em um lugar só |
| `referencias/procedimentos/` | Um processo é executado por outra pessoa ou repetido toda semana | O agente segue o procedimento em vez de improvisar |
| `referencias/<ferramenta>-api.md` | Você conecta uma API ou MCP nova | Pesquisou uma vez, salvou para sempre |
| `scripts/` | Você escreve Python ou Bash para uma API sem MCP | A segunda conexão da maioria das pessoas é um script |
| `.claude/agents/` | Precisa de um subagente para pesquisa ou redação repetitiva | Roda em modelo mais barato, mantém a sessão principal leve |
| `reunioes/` | Você tem transcrições de reuniões chegando toda semana | Categoria própria no `/cerebro-3d` e na wiki |
| Sub-cérebro (ex.: `youtube/`) | Uma vertical tem dados, planilhas e scripts próprios | Isolamento: manual e skills com escopo próprio |
| Painel local | Você quer agenda, mensagens e métricas em uma tela só | É a evolução natural depois das conexões. Peça ao agente para construir um app local em `apps/` lendo as mesmas conexões |

## Cadências sugeridas

- `decisoes/registro.md`: a cada decisão relevante.
- `conexoes.md` e `referencias/<ferramenta>-api.md`: sempre que conectar algo.
- `/auditar`: semanal enquanto constrói, mensal depois.
- `/entrevista`: uma por semana sobre um tema diferente, nos primeiros dois meses.
- `arquivo/`: limpeza trimestral.
- `AGENTS.md` / `CLAUDE.md`: revisão trimestral da persona e das prioridades.

## O que NÃO adicionar

- **Despejo de e-mails ou mensagens em `referencias/`.** Bruto vai para `fontes/`; a wiki guarda o interpretado.
- **Pasta dentro de pasta dentro de pasta.** Plano com bons nomes vence hierarquia funda. Se precisa de árvore para achar, o problema é de busca, não de organização.
- **`notas/`, `misc/`, `tmp/`, `inbox/`.** Cemitérios. Se é velho, `arquivo/`; se é novo, escreva no lugar certo.
- **Pastas vazias "para o futuro".** Ruído. O cérebro avisa quando for hora.
- **Dois manuais na raiz.** Um `AGENTS.md`/`CLAUDE.md` canônico. Sub-cérebros podem ter o seu, com escopo.

## Como saber se é hora de criar uma pasta

1. É conceitualmente novo ou cabe em algo que já existe?
2. Vou mexer nisso 3 vezes ou mais no próximo mês?
3. Uma skill futura rotearia para cá naturalmente?

Dois "sim" = cria. Um "sim" = espera.
