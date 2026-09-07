# Registro de decisões

Registro cronológico do que foi decidido e por quê. O `/evoluir` escreve aqui a especificação de cada melhoria. Você também pode pedir "registre essa decisão" a qualquer momento.

**Formato de cada entrada:**

```
## AAAA-MM-DD: Título curto

**Decisão:** o que foi decidido.

**Por quê:** o raciocínio, as restrições e o que faria você mudar de ideia.

**Alternativas consideradas:** o que mais estava na mesa.

**Responsável:** quem responde por isso.
```

Seja breve. O "por quê" vale mais que o "o quê".

---

## 2026-08-18: Catálogo passa a viver no segundo cérebro

**Decisão:** o catálogo de produtos da Empresa X será importado para `fontes/` e mantido na wiki; o site e o bot consultam o cérebro.

**Por quê:** a planilha não é pesquisável pelo bot nem pelo site; centralizar evita três cópias divergentes.

**Alternativas consideradas:** manter a planilha como fonte e sincronizar por script; banco de dados próprio.

**Responsável:** consultor.
