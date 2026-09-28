# cerebro-integra

**🇧🇷 [Português](README.md) · 🇺🇸 [English](README.en.md) · 🇪🇸 [Español](README.es.md)**

**Kit de integración del segundo cerebro.** Conecta una carpeta de Markdown creada por [astra-2cerebro](https://github.com/inematds/astra-2cerebro) con los sistemas que ya tienes: un bot de Telegram, un sitio o una app (API HTTP local), bases de datos y catálogos (importadores), automatizaciones (n8n) y voz.

Node.js 20 o superior. **Cero dependencias npm.** Todo en portugués de Brasil.

## El problema

El segundo cerebro funciona muy bien desde la terminal: abres Claude Code o Codex en la carpeta, y el agente lee `contexto/`, `wiki/`, `decisoes/` y responde con lo que sabe de ti.

Pero la vida no ocurre en la terminal. La pregunta llega por Telegram, en el autobús. El sitio de tu empresa necesita mostrar el catálogo de la wiki. La base de datos genera registros nuevos cada noche que deberían convertirse en notas en `fontes/`. Una automatización en n8n quiere consultar tus prioridades antes de decidir qué hacer. Quieres preguntar en voz alta y escuchar la respuesta.

Sin un puente, cada una de estas integraciones se convierte en un script improvisado que lee archivos directamente, sin controles de seguridad y sin respetar las convenciones del cerebro (nombres de archivo, frontmatter, registros). **cerebro-integra** es ese puente, bien hecho y disponible para todas esas conexiones.

## Mapa de adaptadores

```
                    ┌──────────────────────────────────────┐
                    │         tu segundo cerebro           │
                    │  contexto/  wiki/  fontes/  decisoes/ │
                    │  projetos/  conexoes.md  rotinas/     │
                    └──────────────────┬───────────────────┘
                                       │
                            ┌──────────┴──────────┐
                            │   lib/cerebro.mjs   │  ← núcleo: localizar, buscar,
                            │  (lectura segura +  │    leer con bloqueo de traversal,
                            │   escritura anexa) │    guardar fuente, decisión y ejecución
                            └──────────┬──────────┘
          ┌──────────────┬─────────────┼─────────────┬──────────────┐
          │              │             │             │              │
   ┌──────┴──────┐ ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐ ┌──────┴──────┐
   │ api/        │ │ telegram/ │ │importadores│ │ n8n/      │ │ voz/        │
   │ servidor    │ │ bot       │ │ json, csv, │ │ flujo-    │ │ voz.sh      │
   │ HTTP JSON   │ │ long poll │ │ carpeta,   │ │ ejemplo   │ │ STT→API→TTS │
   │ 127.0.0.1   │ │ comandos  │ │ exportar   │ │ webhook   │ │ por env     │
   └──────┬──────┘ └─────┴─────┘ └─────┴─────┘ └─────┴─────┘ └──────┬──────┘
          │              │             │             │              │
     sitio / app     Telegram     banco / CSV /     n8n / Make    micrófono /
     / panel                      hoja de cálculo /                altavoz
                                  carpeta
```

| Adaptador | Archivo | Qué hace |
|---|---|---|
| API HTTP local | `api/servidor.mjs` | Expone el cerebro en JSON (`/buscar`, `/contexto`, `/prioridades`, `/pagina`, `/projetos`, `/conexoes`, y escritura opcional en `/decisao`, `/fonte`, `/rotina/execucao`). |
| Bot de Telegram | `telegram/bot.mjs` | `/buscar`, `/prioridades`, `/contexto`, `/decisao`, `/fonte`, `/rotina`; el texto libre responde mediante `RESPONDER_CMD` o una búsqueda. |
| Importar JSON | `importadores/importar-json.mjs` | Catálogo o registros → una nota por elemento en `fontes/`, con mapeo de campos. Idempotente. |
| Importar CSV | `importadores/importar-csv.mjs` | Lo mismo para hojas de cálculo, con parser propio (comillas, `;`, BOM, CRLF). |
| Importar carpeta | `importadores/importar-pasta.mjs` | Copia `.md`/`.txt` de una carpeta externa con prefijo de fecha y registro. |
| Exportar wiki | `importadores/exportar-wiki.mjs` | `wiki/` → un JSON con páginas, frontmatter, enlaces y diagnóstico. |
| n8n | `n8n/fluxo-exemplo.json` | Workflow listo: webhook → `/buscar` → respuesta. |
| Voz | `voz/voz.sh` | STT configurable → cerebro → TTS configurable. Modo `--texto` para probar sin audio. |

## 📖 Guía de uso

Guía completa (landing + paso a paso): **https://inematds.github.io/cerebro-integra/guia/es/**

## Instalación en 1 minuto

```bash
git clone https://github.com/inematds/cerebro-integra.git
cd cerebro-integra
cp .env.exemplo .env          # edite CEREBRO_DIR apontando para o seu cérebro
npm test                      # opcional: confere que tudo funciona aqui
npm run api                   # sobe a API em http://127.0.0.1:4650
```

Sin `npm install`: no hay dependencias. Detalles, systemd e instrucciones para el agente en [INSTALAR.md](INSTALAR.md).

## Un ejemplo por adaptador

**API.** Busca en todas las notas:

```bash
curl 'http://127.0.0.1:4650/buscar?q=catalogo&limite=3'
```

```json
{
  "consulta": "catalogo",
  "total": 3,
  "resultados": [
    { "caminho": "fontes/2026-08-18-reuniao-kickoff-fase-2.md", "titulo": "Reunião de kickoff da fase 2", "pontos": 4, "trecho": "..." }
  ]
}
```

**Telegram.** Con `TELEGRAM_TOKEN` y `TELEGRAM_CHATS` en `.env`:

```bash
npm run bot
```

En el chat: `/prioridades` muestra el trimestre; `/decisao Usar API local | O site consulta a API | Evita duplicar dados` registra en `decisoes/registro.md`; reenviar cualquier mensaje guarda una nota en `fontes/`.

**Importar JSON.** Catálogo con mapeo de campos:

```bash
node importadores/importar-json.mjs catalogo.json --config mapa.json
# criados: 340 · pulados (já existiam): 0
node importadores/importar-json.mjs catalogo.json --config mapa.json
# criados: 0 · pulados (já existiam): 340      ← rodar de novo não duplica
```

**Importar CSV.** `node importadores/importar-csv.mjs produtos.csv --config mapa.json`

**Importar carpeta.** `node importadores/importar-pasta.mjs ~/Documentos/notas --prefixo notas`

**Exportar wiki.** `node importadores/exportar-wiki.mjs --saida wiki.json` genera un JSON que tu sitio o tu buscador pueden consumir.

**n8n.** Importa `n8n/fluxo-exemplo.json`, define `CEREBRO_API` y `CEREBRO_TOKEN` en el entorno de n8n y llama al webhook con `{"q": "prioridades"}`.

**Voz.** Sin micrófono, para probar el puente:

```bash
TTS_CMD='espeak-ng -v pt-br --stdin' voz/voz.sh --texto "o que sabemos sobre o catálogo"
```

## Seguridad

El cerebro contiene datos personales. El kit adopta valores conservadores de forma predeterminada:

- **Loopback.** La API escucha solo en `127.0.0.1`. Para exponerla, se requiere definir explícitamente `CEREBRO_HOST`; aun así, se recomienda usar un proxy con HTTPS.
- **Token.** Si defines `CEREBRO_TOKEN`, todas las rutas (excepto `/saude`) requieren `Authorization: Bearer <token>`, comparado en tiempo constante.
- **Escritura opt-in.** `POST` en la API y los comandos de escritura del bot solo funcionan con `CEREBRO_ESCRITA=1`. Incluso cuando está habilitada, la escritura siempre es *anexar*: nunca se sobrescribe una fuente existente; a los registros solo se les agregan líneas.
- **Chats permitidos.** El bot solo responde a los ID de `TELEGRAM_CHATS`. Sin la lista, no se inicia. Los mensajes de otros chats se ignoran en silencio.
- **Sin traversal.** `/pagina` solo lee `.md`/`.txt` dentro de la raíz del cerebro; `..`, rutas absolutas, codificadas y enlaces simbólicos hacia fuera están bloqueados.
- **Nunca secretos.** El token de Telegram se elimina de cualquier mensaje de error o registro. `.env` está en `.gitignore`. El workflow de n8n usa `$env.CEREBRO_TOKEN`, nunca un valor literal.
- **CORS desactivado.** Solo se habilita con `CEREBRO_CORS=<origem>`.

Más información en [docs/seguranca.md](docs/seguranca.md).

## Documentación

- [INSTALAR.md](INSTALAR.md): clonación, `.env`, API y bot como servicio (systemd), instrucciones para el agente.
- [docs/arquitetura.md](docs/arquitetura.md): cómo encajan las piezas y por qué.
- [docs/api.md](docs/api.md): cada ruta con solicitud y respuesta.
- [docs/telegram.md](docs/telegram.md): BotFather, ID del chat, comandos, `RESPONDER_CMD`.
- [docs/importadores.md](docs/importadores.md): mapeo de campos, ejemplos JSON/CSV, idempotencia.
- [docs/n8n.md](docs/n8n.md), [docs/voz.md](docs/voz.md), [docs/seguranca.md](docs/seguranca.md).
- [docs/receitas.md](docs/receitas.md): tres recetas completas (bot existente, sitio, base de datos → wiki cada noche).
- [CHANGELOG.md](CHANGELOG.md).

## Pruebas

```bash
npm test
```

Resultado en 2026-09-07 (Node 24.13.0, Linux):

```
ℹ tests 73
ℹ suites 17
ℹ pass 73
ℹ fail 0
```

Qué cubren: núcleo (búsqueda sin acentos, lectura con bloqueo de traversal por `..`, rutas absolutas y codificadas, y symlink, fuente idempotente, decisión en el formato del kit, ejecución de rutina insertada al principio de la tabla), API (todas las rutas en un puerto libre, 401 sin token, 403 sin `CEREBRO_ESCRITA`, 400 con JSON no válido, CORS), importadores JSON y CSV (archivos esperados en una copia temporal de la fixture, sin duplicados en la segunda ejecución, parser CSV con comillas/BOM/CRLF/`;`), carpeta (prefijo de fecha, registro, sin duplicados), exportar-wiki (páginas, enlaces, frontmatter, enlaces rotos y páginas huérfanas), bot (parser de comandos y handler completo sin red, cliente de Telegram con `fetch` falso, ocultación del token), n8n (JSON válido, conexiones coherentes, token solo por env) y voz (`bash -n`, `--texto` contra la API en un proceso con `TTS_CMD=cat`, `RESPONDER_CMD`).

## Preguntas frecuentes

**¿Necesito tener astra-2cerebro instalado?** Necesitas una carpeta con su estructura (al menos `AGENTS.md` o `CLAUDE.md`, `contexto/`, `fontes/`). `test/fixture/` es un cerebro mínimo de ejemplo que puedes copiar para probar.

**¿Funciona con Obsidian u otra carpeta de Markdown?** Funciona para buscar y leer. La escritura sigue las convenciones del kit (`fontes/AAAA-MM-DD-slug.md`, `decisoes/registro.md`, `rotinas/registro.md`); si la carpeta no las tiene, los archivos se crean.

**¿Puedo exponer la API en internet?** No directamente. Colócala detrás de un proxy con HTTPS, usa `CEREBRO_TOKEN` y piensa si realmente lo necesitas: el bot de Telegram y n8n resuelven la mayoría de los casos sin abrir un puerto.

**¿El bot responde a texto libre con IA?** Solo si defines `RESPONDER_CMD` (por ejemplo, `claude -p`, ejecutado en la carpeta del cerebro). Sin eso, el texto libre devuelve resultados de búsqueda. El kit no llama a ningún modelo por su cuenta.

**¿Qué pasa si la wiki todavía no existe?** `/buscar` y `/contexto` funcionan con lo que haya. `exportar-wiki` avisa que falta `wiki/`.

**¿Cómo sé si se ejecutó una rutina?** `POST /rotina/execucao` (o `/rotina <id> ok` en el bot) agrega una línea en `rotinas/registro.md`. Esa es la evidencia que busca `/auditar` del kit.

**¿Windows?** La API, el bot y los importadores funcionan en cualquier sistema con Node 20+. `voz/voz.sh` necesita bash (WSL o Git Bash).

## Créditos y licencia

Construido sobre [astra-2cerebro](https://github.com/inematds/astra-2cerebro), el kit de segundo cerebro en Markdown para Claude Code y Codex. Este proyecto reutiliza la estructura de carpetas y las convenciones de archivos del kit; nada más.

MIT. Copyright (c) 2026 inematds.
