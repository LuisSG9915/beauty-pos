# 83 — `test:flows` siempre llega al resumen y clasifica por qué falló

**Prioridad:** P1 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 3

**Objetivo\***
Cuando `pnpm test:flows` falla por causas transitorias (timeout de espera,
"Failed query" contra la base remota, saturación del dev server), la suite
ya no muere a media corrida: cada sección captura su propio error, el
resumen siempre se imprime y queda un artefacto JSON con duración y clase
de fallo por paso (`timeout` | `failed-query` | `afirmacion`) para
diagnosticar la causa dominante con datos, no por corrrida aislada.

**Fuera de alcance\***
Arreglar la causa raíz (eso exige primero saber cuál es: este es el paso de
medición). No se toca la app (`src/`), ni `pnpm dev`, ni la base, ni
`scripts/lib/e2e.ts` (login). Reintentos de acciones de servidor quedan
prohibidos dentro del arnés: reintentar un submit puede duplicar ventas.

## Contexto verificado\*

- `readme/README.md` §11 paso 4 — "en las últimas corridas la suite murió
  en pasos distintos por timeouts y 'Failed query' contra la base remota;
  conviene revisar si es saturación del dev server o de CockroachDB".
- `readme/estados/hecho/79-pos-inicio-cobrar-sencillo-limpio.md` —
  desviaciones con los modos reales: timeout en "Entrada de inventario",
  "tarjeta de paquete no hallada", `/admin/reportes` con `413` +
  `Failed query`, `Failed query` en `/admin/inventario` (4 corridas,
  fallos distintos cada vez).
- `scripts/flows-e2e.ts:21-26` — `results`/`record(step, ok, detail)` ya
  imprimen `PASS`/`FAIL` por paso.
- `scripts/flows-e2e.ts:487` — **un solo `try` envuelve TODA la suite**;
  el `catch` en línea 1847 graba "Flujo interrumpido" y salta al resumen:
  un error sin capturar en la sección N deja sin correr las N+1…31.
- `scripts/flows-e2e.ts:1852-1861` — el resumen existe y `consoleErrors`
  ya se acumulan; **no se persiste nada** ni hay duración por paso.
- `scripts/lib/report.ts:26-31` — `writeArtifact(nombre, data)` ya escribe
  `.artifacts/<nombre>-<ts>.json`.
- `scripts/lib/db.ts:9-17` — `withDb` abre un `Client` por llamada (sin
  reintento); lo usa el arnés para lecturas de diagnóstico y `cleanup`.
- `src/instrumentation.ts` — "Failed query" proviene del error de Drizzle
  en el servidor (dev), no del arnés: el paso que espera texto en esa
  página muere por timeout — la clase visible del fallo es engañosa si no
  se distingue.

## Diseño decidido

- **Aislamiento por sección** sin reestructurar `main()`: dividir el
  `try` único en bloques `try/catch` por sección (las marcadas con
  comentarios `// ── … ──`), donde el `catch` graba
  `record("Sección <nombre> interrumpida", false, clase)` y **continúa**
  con la siguiente sección. Si una sección depende de otra (p. ej. la cita
  creada en Agenda la cobra POS), se marca la dependiente como
  `omitida` en vez de reintentarla.
- **`clasificarError(error)`** (helper local del archivo): mensaje
  contiene `Failed query` → `failed-query`; `TimeoutError`/esperas
  `waitFor*` → `timeout`; otro → `afirmacion`. Además, antes de grabar un
  `timeout`, mirar `document.body.innerText` una vez: si la página muestra
  "Failed query" u "Ocurrió un error", reclasificar como `failed-query`
  (el timeout era síntoma, no causa).
- **Duración por paso**: `record` guarda `ms` desde el paso anterior
  (o `performance.now()` explícito por sección); el resumen y el artefacto
  la incluyen — una sección 3× más lenta que su mediana es la pista de
  saturación.
- **Artefacto**: al final, `writeArtifact("flows-e2e", { inicio, results,
  consoleErrors })` — igual convención que los otros checks.
- **`withDb` con un solo reintento** en error de conexión (no de consulta):
  la apertura del socket sí es segura de reintentar; el query no.

## Pasos

1. `scripts/flows-e2e.ts` — `clasificarError`, duración por paso en
   `record`, `try/catch` por sección con continuación, chequeo de texto
   de página antes de reclasificar `timeout`.
2. `scripts/flows-e2e.ts` — `writeArtifact` final y resumen con conteo por
   clase de fallo.
3. `scripts/lib/db.ts` — un reintento acotado solo en `client.connect()`.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] 2-3 corridas de `pnpm test:flows` con `pnpm dev` corriendo: el
      resumen siempre llega a imprimirse (cero corridas truncadas) y cada
      corrida genera su `.artifacts/flows-e2e-*.json`.
- [ ] El reporte de la misión nombra la clase de fallo dominante observada
      (`failed-query` vs `timeout` puro vs saturación del dev server) con
      los artefactos como evidencia.
- [ ] Ningún paso se reintenta ni se marca OK por accidente: un error sigue
      contando como FAIL, solo que no tumba las secciones siguientes.

## Verificación

```bash
pnpm typecheck
pnpm dev   # en otra terminal
pnpm test:flows   # ×3 corridas controladas
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 3 |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- Las secciones no pueden aislarse sin mover estado compartido (fixtures
  de `ensureFixtures`, `slots` de `findFreeSlots`) a un alcance distinto:
  se anota y se reduce a las secciones independientes.
- El fallo dominante resulta ser determinista (no transitorio): se
  documenta como bug real y se detiene para que lo tome una misión de
  corrección.
- El cambio excede 3 archivos.

## Reporte (al terminar)

```
Misión: 83 — test:flows diagnóstico y aislamiento por sección
Cambios: scripts/flows-e2e.ts → 12 secciones con try/catch propio, clase de
  fallo (timeout|failed-query|afirmacion|omitida), ms por paso, artefacto
  JSON y dependencias con omisión en cascada; scripts/lib/db.ts → un
  reintento solo en client.connect() (nunca en la query)
Verificación: typecheck ✔ | lint ✔ (0 errores, 4 avisos preexistentes) |
  flows ×2 corridas completas 77/77 + artefactos .artifacts/flows-e2e-*.json
Antes → después: un error transitorio truncaba la suite → resumen siempre
  + clasificación de fallo por paso + JSON por corrida
Desviaciones: la causa raíz de la inestabilidad ya estaba resuelta en
  017b7c0 (idleTimeoutMillis del pool local); esta misión endurece el
  arnés para futuras. 12 secciones en vez de ~30 bloques por marcador:
  se agruparon los pasos secuenciales dependientes. Variables que cruzan
  secciones (runId, ventaWalkinUrl, paqueteNombre, membresiaNombre,
  clienteNombre, servicioNombre) pasaron a `let` del scope externo.
Riesgo abierto: ninguno funcional; el camino de fallo (clasificación,
  omisión) está cubierto por typecheck pero no se ejercitó en vivo —
  solo se verificó el camino feliz en 2 corridas.
```

## Desviaciones (las escribe el implementador)

- **La premisa "causa desconocida" ya no aplicaba**: la causa raíz de los
  fallos transitorios se encontró y corrigió en el commit `017b7c0`
  (`idleTimeoutMillis: 5000` destruía sockets TLS a CockroachDB remoto
  entre pasos). Esta misión quedó como endurecimiento del arnés: si
  aparece una inestabilidad nueva, el resumen siempre imprime, el
  artefacto JSON clasifica el fallo dominante y las secciones
  independientes siguen corriendo.
- **12 secciones, no ~30**: los marcadores `// ──` separan pasos
  secuenciales dependientes (walk-in → devolución → descuento; editar →
  cancelar → reagendar → vistas). Se agruparon en secciones lógicas con
  dependencia explícita (`requiere`) en vez de un try por marcador —
  mismo aislamiento, menos ruido de "omitida" en cascada.
- **Helpers sin mover**: los `const` de helpers (`crearCita`,
  `abrirCobro`, etc.) quedaron en el scope del `try` externo, visibles
  para todos los `try` internos — no fue necesario reestructurar ni
  reindentar el archivo.
- **`ms` por paso**: `record` mide `performance.now()` desde el `record`
  anterior — el primer paso del run incluye el setup del navegador.
- **`porClase`**: cuenta TODOS los fallos (los FAIL de aserción por paso
  sin `clase` propia cuentan como `afirmacion`); las `omitida` se
  reportan aparte y no inflan el conteo de fallos.
