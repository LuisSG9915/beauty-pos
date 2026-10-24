---
trigger: glob
globs: src/db/**/*.ts,src/modules/**/*.ts,src/app/**/actions.ts,src/app/**/queries.ts,src/lib/**/*.ts
---

# Datos: CockroachDB + Workers (rendimiento es feature)

- Cada round-trip a CockroachDB remoto cuesta ~50–150ms; **fusionar consultas** con subselects `jsonb`/`jsonb_agg` antes que encadenar awaits. Patrones vigentes: `resolveSessionContext` (usuario + organizaciones + permisos por org + acceso en 1 query), `resolveAccessSafe`/`accessFromContextRow`, la consulta única de agenda en `src/app/admin/agenda/page.tsx` y `cargarAlertas` (un SELECT con subselects escalares por permiso).
- El Worker corre con `placement.region = "aws:us-east-2"` (junto a CockroachDB) y la sesión viaja en cookie firmada (`session.cookieCache` en `src/lib/auth/server.ts`, maxAge 300s): `getSession` no toca la BD. Las queries paralelas abren conexiones frías (~60ms de handshake c/u) — fusionar gana más que paralelizar.
- Paralelizar con `Promise.all` lo que no tenga dependencia. No esperar un resultado si otro await puede ir junto.
- Índices: la agenda filtra por `activo`; preferir índices parciales (`WHERE activo`) a full. Evaluar RU antes de `STORING` en columnas que cambian seguido (p. ej. `estado`).
- Esquema: `pnpm db:generate` → `pnpm db:migrate`; verificar `pnpm db:check`.
- KV (`src/lib/kv-cache.ts`): solo para datos fríos de lectura frecuente con invalidación clara. Datos de sesión/operación caliente NUNCA en KV. Toda escritura sobre tabla cacheada debe invalidar su clave.
- Los pools de `pg` son por request (WeakMap + `after()`). Prohibido guardar `getDatabase()`/clientes en globals o singletons; para cachear algo ligado al request usar `getRequestScope()`.
- Server actions: validar con zod + `checkPermission`; idempotencia con `claves_idempotencia` en cobros; auditoría con `auditEvent`.
- Diagnóstico de consultas: reiniciar dev con `DB_LOG_QUERIES=1`.

<!-- Generado por scripts/sync-reglas.ts desde .windsurf/rules; no editar a mano. -->
