# Notas del proyecto

## Base de datos y despliegue

- `src/db/client.ts` usa el binding `HYPERDRIVE` (instancia `beauty-pos-db`, id `1e6092cc079c4f5c86a5d4bca6ddc7e4`, declarado en `wrangler.jsonc`) y cae a `DATABASE_URL` fuera de Cloudflare. Desplegado en `https://beauty-pos.luis-sg9915.workers.dev`.
- **Regla crítica de Workers**: los sockets de `pg` no sobreviven entre invocaciones — nada que capture una conexión puede vivir en un global. `getDatabase()` crea un pool por request (WeakMap sobre el ExecutionContext, cerrado con `after()`); `createAuth` se cachea por request vía `getRequestScope()`. Cualquier caché nueva que toque la BD debe usar `getRequestScope()` igual.
- Secretos del worker configurados con `wrangler secret put`: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `CRON_SECRET`.
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
