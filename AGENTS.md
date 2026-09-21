# Notas del proyecto

## Base de datos y despliegue

- `src/db/client.ts` usa el binding `HYPERDRIVE` (instancia `beauty-pos-db`, id `1e6092cc079c4f5c86a5d4bca6ddc7e4`, declarado en `wrangler.jsonc`) y cae a `DATABASE_URL` fuera de Cloudflare. Desplegado como Worker `beauty-pos` con dominio canónico `https://melena.app` (el hostname `*.workers.dev` queda como ruta de rollback).
- Deploy: `pnpm run deploy` (ojo: `pnpm deploy` a secas es el comando propio de pnpm y falla). `opennextjs-cloudflare deploy` exige `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` apuntando a Postgres local — exportarla desde `DATABASE_URL` de `.env` antes de desplegar; el Worker desplegado sigue usando el binding Hyperdrive real.
- `pnpm deploy` (opennextjs-cloudflare) evalúa bindings en local: requiere `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` apuntando al `DATABASE_URL` de `.env`, p. ej. `export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$(python3 -c "import re;print(re.search(r'^DATABASE_URL=(.*)$',open('.env').read(),re.M).group(1))")"` antes de `npx opennextjs-cloudflare deploy`.
- **Regla crítica de Workers**: los sockets de `pg` no sobreviven entre invocaciones — nada que capture una conexión puede vivir en un global. `getDatabase()` crea un pool por request (WeakMap sobre el ExecutionContext, cerrado con `after()`); `createAuth` se cachea por request vía `getRequestScope()`. Cualquier caché nueva que toque la BD debe usar `getRequestScope()` igual.
- Secretos del worker configurados con `wrangler secret put`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `CRON_SECRET`.
- Migraciones: `pnpm db:generate` → `pnpm db:migrate`. Consistencia: `pnpm db:check`.
- Catálogo de planes: `pnpm plans:seed` (idempotente, sincroniza `src/modules/billing/capacidades.ts`). Permisos/roles en organizaciones existentes: `pnpm tsx scripts/seed-access.ts`.
- Diagnóstico de consultas: reiniciar el server con `DB_LOG_QUERIES=1`.

## Benchmark de rendimiento y usabilidad

`pnpm test:perf` (`scripts/perf-bench.ts`) mide TTFB/LCP/CLS de las rutas admin y navegación cliente con Puppeteer, en escritorio (1366px) y móvil (390px). `pnpm test:usability` (`scripts/usability-check.ts`) corre axe WCAG 2.2 AA + heurísticas de acción primaria (`data-action-clave`) + objetivos táctiles ≥24px + rutas por clics. Ambos requieren `pnpm dev` corriendo y la cuenta E2E (`PERF_EMAIL`, default `e2e-salon@test.dev`); `scripts/lib/e2e.ts` hace login regenerando la contraseña de prueba. `scripts/axe-detail.ts` lista los nodos exactos de cada violación.

## Telemetría e incidentes

- Telemetría de producto first-party: `src/lib/telemetry/cliente.ts` (sesión, `sendBeacon`) → `POST /api/telemetria/producto` → tablas `telemetria_*`. Acciones semánticas con `data-action-id` (botones/enlaces) y `data-action-clave="1"` marca la acción primaria de cada pantalla.
- Errores: listeners cliente + boundaries + `instrumentation.ts/onRequestError` → `POST /api/errores` → `incidentes_error` (fingerprint, prioridad P0–P3). Panel solo-plataforma en `/admin/incidentes` y métricas en `/admin/telemetria`.
- Sentry opcional: definir `NEXT_PUBLIC_SENTRY_DSN` activa el SDK de navegador con Replay enmascarado (5% sesiones, 100% con error). Los errores de servidor siguen yendo al pipeline interno.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
