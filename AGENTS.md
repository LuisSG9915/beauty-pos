# Notas del proyecto

## Base de datos y despliegue

- `src/db/client.ts` usa el binding `HYPERDRIVE` cuando existe y cae a `DATABASE_URL`. **`wrangler.jsonc` aún no declara el binding**: en Cloudflare hay que crear la instancia (`wrangler hyperdrive create beauty-pos --connection-string=…`) y agregar `"hyperdrive": { "binding": "HYPERDRIVE", "id": "<id>" }` al config antes de medir latencia real en Workers.
- Migraciones: `pnpm db:generate` → `pnpm db:migrate`. Consistencia: `pnpm db:check`.
- Catálogo de planes: `pnpm plans:seed` (idempotente, sincroniza `src/modules/billing/capacidades.ts`). Permisos/roles en organizaciones existentes: `pnpm tsx scripts/seed-access.ts`.
- Diagnóstico de consultas: reiniciar el server con `DB_LOG_QUERIES=1`.

## Benchmark de rendimiento

`pnpm tsx scripts/perf-bench.ts` mide TTFB/FCP/load de las rutas admin y navegación cliente con Puppeteer. Requiere `SMOKE_BASE_URL` y una cookie de sesión válida (`scripts/session-cookie.ts` la genera para la cuenta E2E).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
