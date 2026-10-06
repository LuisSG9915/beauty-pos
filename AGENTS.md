# Notas del proyecto

## Base de datos y despliegue

- `src/db/client.ts` usa el binding `HYPERDRIVE` (instancia `beauty-pos-db`, id `1e6092cc079c4f5c86a5d4bca6ddc7e4`, declarado en `wrangler.jsonc`) y cae a `DATABASE_URL` fuera de Cloudflare. Desplegado como Worker `beauty-pos` con dominio canónico `https://melena.app` (el hostname `*.workers.dev` queda como ruta de rollback).
- Deploy: `pnpm run deploy` (ojo: `pnpm deploy` a secas es el comando propio de pnpm y falla). `opennextjs-cloudflare deploy` exige `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` apuntando a Postgres local — exportarla desde `DATABASE_URL` de `.env` antes de desplegar; el Worker desplegado sigue usando el binding Hyperdrive real.
- Deploy en Windows: `patches/@opennextjs__cloudflare@1.20.6.patch` (registrado en `patchedDependencies` de `pnpm-workspace.yaml`) arregla dos cosas: (1) esbuild rompe con `cloudflare:sockets` y `sharp` al empaquetar; (2) `getEnvFromPlatformProxy` aborta porque el binding `AI` abre una sesión remota a `*.workers.dev`, que está detrás de Cloudflare Access — el parche la envuelve en try/catch. Al actualizar `@opennextjs/cloudflare` hay que regenerar el parche (o desplegar desde WSL/Linux/CI). Detalle en `readme/estados/en-progreso/13-deploy-windows-y-publicacion.md`.
- `pnpm deploy` (opennextjs-cloudflare) evalúa bindings en local: requiere `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` apuntando al `DATABASE_URL` de `.env`, p. ej. `export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$(python3 -c "import re;print(re.search(r'^DATABASE_URL=(.*)$',open('.env').read(),re.M).group(1))")"` antes de `npx opennextjs-cloudflare deploy`.
- **Regla crítica de Workers**: los sockets de `pg` no sobreviven entre invocaciones — nada que capture una conexión puede vivir en un global. `getDatabase()` crea un pool por request (WeakMap sobre el ExecutionContext, cerrado con `after()`); `createAuth` se cachea por request vía `getRequestScope()`. Cualquier caché nueva que toque la BD debe usar `getRequestScope()` igual.
- **Placement**: `wrangler.jsonc` fija `placement.region = "aws:us-east-2"` para correr el Worker junto a CockroachDB (cada RT edge→origen cuesta ~80–100 ms). La sesión viaja en cookie firmada (`session.cookieCache`, 5 min, en `src/lib/auth/server.ts`) — `getSession` no toca la BD; la revocación de sesión tarda hasta 5 min en propagarse.
- **Caché KV** (`CACHE_KV` en `wrangler.jsonc`, helper `src/lib/kv-cache.ts`): read-through para datos fríos. Hoy cachea la suscripción vigente (`suscripcion:{orgId}`, TTL 300 s) y el catálogo de planes (`planes:activos:v1`, TTL 1 h). Toda escritura a `suscripciones`/`planes` debe llamar `invalidarSuscripcionCache`/`invalidarPlanesCache` (`src/modules/billing/queries.ts`); fuera de Workers el binding no existe y todo degrada a lectura directa.
- **Contexto admin en 1 consulta**: `resolveSessionContext(authUsuarioId, orgId?)` (`src/lib/auth/authorization.ts`) devuelve usuario + organizaciones (con `permisos` embebidos por org para el nav) + acceso a la org pedida en un solo `db.execute`; `accessFromContextRow` convierte la fila en `ResolvedAccess`. Las páginas fusionan igual: `agenda/page.tsx` trae staff/servicios/horarios/bloqueos/recursos/citas(+servicios, recursos y alergias por cita)/avisos en 1 query con subselects `jsonb`, y `cargarAlertas` es un SELECT con subselects escalares por permiso. Las consultas paralelas abren conexiones frías al pool (~60 ms de handshake c/u): fusionar gana más que paralelizar.
- Secretos del worker configurados con `wrangler secret put`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `CRON_SECRET`.
- Migraciones: `pnpm db:generate` → `pnpm db:migrate`. Consistencia: `pnpm db:check`.
- Catálogo de planes: `pnpm plans:seed` (idempotente, sincroniza `src/modules/billing/capacidades.ts`). Permisos/roles en organizaciones existentes: `pnpm tsx scripts/seed-access.ts`.
- Diagnóstico de consultas: reiniciar el server con `DB_LOG_QUERIES=1`.

## Benchmark de rendimiento y usabilidad

`pnpm test:perf` (`scripts/perf-bench.ts`) mide TTFB/LCP/CLS de las rutas admin y navegación cliente con Puppeteer, en escritorio (1366px) y móvil (390px). `pnpm test:usability` (`scripts/usability-check.ts`) corre axe WCAG 2.2 AA + heurísticas de acción primaria (`data-action-clave`) + objetivos táctiles ≥24px + rutas por clics. Ambos requieren `pnpm dev` corriendo y la cuenta E2E (`PERF_EMAIL`, default `e2e-salon@test.dev`); `scripts/lib/e2e.ts` hace login regenerando la contraseña de prueba. `scripts/axe-detail.ts` lista los nodos exactos de cada violación (`pnpm test:axe`).

Convenciones de scripts: helpers compartidos en `scripts/lib/` (`browser.ts` viewports/`withBrowser`/`loggedPage`, `dom.ts` click/esperas por texto, `db.ts` `withDb`, `cli.ts` `checkFlags` con `--only`/`--viewport`/`--runs`/`--json`, `report.ts` findings + artefactos `.artifacts/`). Los checks aceptan `--only=<subcadena>` y `--viewport=<nombre>` para iterar rápido. Scripts desechables de depuración van en `scripts/scratch/` (gitignored: `git add -f` para conservar uno).

`pnpm tsx scripts/load-sim.ts` simula carga real con 4 perfiles de negocio (`config` catálogo en vivo con escritor DB `sim_*` + limpieza, `alta` 14 usuarios, `baja` 2, `normal` 6) contra `SMOKE_BASE_URL`. Duración por fase: `LOAD_DURATION_MS` (default 60 s). Imprime latencias p50/p95/p99 por fase y la ventana UTC del run; para CPU/wallTime del Worker correr `npx wrangler tail beauty-pos --format json` en paralelo y parsear `cpuTime`/`wallTime` por evento.

## UI y vocabulario (audiencia no técnica)

- Vocabulario único en `src/lib/glosario.ts` (nunca "walk-in" → "cliente de paso"; nunca "reagendar" → "cambiar fecha"; sin UUIDs visibles). Estados de cita: `src/modules/agenda/estados.ts` (etiqueta + tono + icono compartidos por agenda/mi-día/panel lateral).
- `/admin` arranca en claro por defecto (`src/lib/theme-preference.ts`); tipografía mínima `text-op-xs` (13px); tokens `--cita-*` y pares `bg-*-soft text-*` en `globals.css`.
- Reglas de desarrollo para Windsurf/Cascade en `.windsurf/rules/` (arquitectura, UI de salón, datos, verificación) y workflows en `.windsurf/workflows/` (`/verificar`, `/deploy`, `/nueva-pantalla`).

## Telemetría e incidentes

- Telemetría de producto first-party: `src/lib/telemetry/cliente.ts` (sesión, `sendBeacon`) → `POST /api/telemetria/producto` → tablas `telemetria_*`. Acciones semánticas con `data-action-id` (botones/enlaces) y `data-action-clave="1"` marca la acción primaria de cada pantalla.
- Errores: listeners cliente + boundaries + `instrumentation.ts/onRequestError` → `POST /api/errores` → `incidentes_error` (fingerprint, prioridad P0–P3). Panel solo-plataforma en `/admin/incidentes` y métricas en `/admin/telemetria`.
- Sentry opcional: definir `NEXT_PUBLIC_SENTRY_DSN` activa el SDK de navegador con Replay enmascarado (5% sesiones, 100% con error). Los errores de servidor siguen yendo al pipeline interno.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
