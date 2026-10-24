---
trigger: always_on
---

# Arquitectura Melena (regla siempre activa)

- Stack: Next.js 16 (App Router) + React 19 + TypeScript + Drizzle ORM + CockroachDB + Cloudflare Workers (OpenNext) + Better Auth + Tailwind 4.
- **Regla crítica de Workers**: los sockets de `pg` NO sobreviven entre invocaciones. Nada que capture una conexión puede vivir en un `global`. `getDatabase()` crea pool por request (WeakMap sobre ExecutionContext, cerrado con `after()`); cualquier caché nueva que toque la BD debe usar `getRequestScope()` de `src/db/client.ts`.
- Deploy: `pnpm run deploy` (nunca `pnpm deploy` a secas). Requiere `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` exportada desde `DATABASE_URL` de `.env`.
- Cache de datos: `src/lib/kv-cache.ts` (`kvReadThrough`/`kvInvalidate`, binding `CACHE_KV`). Fuera de Workers degrada a miss → lee la BD. Toda escritura a tablas cacheadas (`suscripciones`, `planes`) DEBE llamar a su invalidador (`invalidarSuscripcionCache`, `invalidarPlanesCache` en `src/modules/billing/queries.ts`).
- Acceso/autorización: `resolveAccessSafe` resuelve membresía + permisos + sucursales en UNA consulta (subselects `jsonb`). No añadir consultas secuenciales en guards de página; extender la fusionada.
- Server actions: permisos con `checkPermission`/`requirePermission` + `assertBranchScope`; nunca fiarse del cliente.
- Telemetría: acciones semánticas con `data-action-id`; acción primaria de cada pantalla con `data-action-clave="1"`.
- Errores: usar el pipeline interno (`/api/errores` → `incidentes_error`); no inventar otro.

<!-- Generado por scripts/sync-reglas.ts desde .windsurf/rules; no editar a mano. -->
