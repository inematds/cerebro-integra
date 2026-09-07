# Como usar o seu segundo cérebro

Guia rápido. O README completo do kit está em https://github.com/inematds/astra-2cerebro.

## Os 4 pilares

| Pilar | Pergunta | Onde vive |
|---|---|---|
| Contexto | O agente sabe quem eu sou e o que importa agora? | `contexto/`, `referencias/`, `wiki/` |
| Conexões | O agente alcança meus dados vivos? | `conexoes.md`, MCPs, `scripts/` |
| Capacidades | Uma frase dispara um fluxo que entrega algo? | `.claude/skills/`, `.agents/skills/` |
| Cadência | Coisas acontecem sem eu pedir, com registro? | `rotinas/` |

Ordem: Contexto → Conexões → Capacidades → Cadência. Não automatize o que ainda não funciona manualmente.

## O ciclo

```
/iniciar → usar uma semana → /auditar → /evoluir → construir → /auditar → ...
```

## Comandos

No Claude Code use `/comando`. No Codex use `$comando`.

| Comando | Para quê |
|---|---|
| `/iniciar` | Dia 1. Sete perguntas. Cria o contexto inicial |
| `/entrevista <tema>` | Tirar algo da cabeça e salvar em `entrevistas/` |
| `/wiki` | Transformar `fontes/` em páginas interligadas em `wiki/` |
| `/vincular <alvo> "<quando usar>"` | Tornar algo achável pelo manual |
| `/auditar` | Nota dos 4 pilares com evidências. Relatório em `auditorias/` |
| `/evoluir` | Fechar uma lacuna da auditoria |
| `/rotina` | Criar uma rotina recorrente com registro |
| `/cerebro-3d` | Ver o conhecimento como um globo 3D |

## Primeiros 14 dias

1. **Dia 1:** `/iniciar`. Depois pergunte "quem sou eu e no que devo focar esta semana?".
2. **Dia 2:** escolha uma ferramenta de `conexoes.md` e peça ao agente para conectá-la.
3. **Dias 3 a 6:** use de verdade. Traga perguntas e decisões reais. Peça para registrar decisões.
4. **Dia 7:** `/auditar`. Leia o relatório. Escolha uma lacuna.
5. **Dia 8:** `/evoluir`. Construa a melhoria.
6. **Dia 14:** `/auditar` de novo. Compare com `auditorias/historico.md`.

## Alimentando o cérebro

- Faça `/entrevista` sobre prioridades, equipe, clientes, produtos, processos, metas do ano. Vinte minutos por sessão.
- Jogue transcrições, exportações e documentos em `fontes/` e rode `/wiki`.
- Peça "registre essa decisão" sempre que decidir algo.

## Regras de ouro

- Contexto estável em `contexto/` e `wiki/`. Dado que muda todo dia vem das conexões, não de arquivo copiado.
- Nunca apague: mova para `arquivo/`.
- Este cérebro contém dados pessoais. Repositório privado, sempre.
