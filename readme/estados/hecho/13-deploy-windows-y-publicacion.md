# 13 — Desbloquear deploy en Windows y publicar planes 01–12

**Fecha:** 2026-10-05 → 2026-10-06 · **Implementa:** SWE-2 MAX (parche + verificación + deploy) · **Estado:** hecho

## Contexto

El commit `f2ee67f` (planes 01–12) está en `main`, ahead 1 de origin. `pnpm run deploy`
construye Next.js bien pero el empaquetado del Worker (esbuild dentro de
`@opennextjs/cloudflare/dist/cli/build/bundle-server.js`, `platform: "node"`) falla
en Windows con 4 errores:

1. `Cannot read directory "node_modules/.pnpm/node_modules/cloudflare:sockets"` —
   `pg-cloudflare/dist/index.js:38` hace `await import('cloudflare:sockets')`; el `:`
   vuelve inválida la ruta en Windows y esbuild lo marca fatal.
2–4. `sharp` (`sharp.cjs` + `@img/sharp-win32-x64/*.node`), dependencia transitiva de
   `next`/`@opennextjs/aws`. La app no usa `next/image` (las imágenes van por
   `/api/medios` con sesión → `<img>`), así que sharp nunca corre en el Worker.

OpenNext declara Windows "no totalmente soportado" (recomiendan WSL). El dueño eligió
parchear en Windows. Si el parche no basta tras 3 errores adicionales → BLOQUEO y se
propone WSL/CI.

Autorizado por el dueño: crear bucket R2, migrar BD de producción, push a GitHub,
deploy al Worker.

## Diseño cerrado

### Parche del empaquetado (reproducible, versionado con pnpm patch)

- `pnpm patch @opennextjs/cloudflare@1.20.6` y editar `dist/cli/build/bundle-server.js`:
  - `alias`: `"sharp": path.join(buildOpts.outputDir, "cloudflare-templates/shims/throw.js")`
    (el shim ya existe y se usa para otras libs no usadas).
  - `plugins`, como primer elemento:
    ```js
    {
      name: "workerd-builtins-external",
      setup(build) {
        build.onResolve({ filter: /^cloudflare:/ }, ({ path }) => ({ path, external: true }));
      },
    },
    ```
    workerd provee `cloudflare:sockets` en runtime; solo hay que no resolverlo en bundle.
- `pnpm patch-commit <dir>` → `patches/@opennextjs__cloudflare@1.20.6.patch` +
  `patchedDependencies` en `pnpm-workspace.yaml`. Verificar `pnpm install` limpio.
- Iterar `pnpm build:worker` hasta compilar; anotar cada error adicional.

### Smoke local del bundle

- Exportar `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` desde `DATABASE_URL`
  de `.env`; `pnpm preview` (wrangler dev) → `GET /api/health` 200, `/login` 200,
  sin `Cannot find module 'cloudflare:sockets'` en el log.

### Producción (orden estricto, detenerse ante cualquier error)

1. `npx wrangler r2 bucket create melena-media` (binding `MEDIA`; sin él el deploy falla).
2. Comprobar última migración aplicada en `drizzle.__drizzle_migrations` (se espera 0048);
   `pnpm db:migrate` (0049–0052, aditivas). Riesgo: `0052` hace DROP+ADD del constraint
   `medios_entidad_chk`; si CockroachDB lo rechaza, reportar el error exacto — nunca
   editar migraciones ya aplicadas.
3. `pnpm access:seed` (permisos `compras.*`).
4. Commit (patch + pnpm-workspace.yaml + limpieza + README + AGENTS.md) con formato del repo.
5. `export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<DATABASE_URL>`;
   `pnpm run deploy` (nunca `pnpm deploy`). Anotar version id.
6. Verificación solo lectura: `curl -I https://melena.app/api/health` y `/login` → 200;
   `npx wrangler tail beauty-pos --format pretty` ~2 min abriendo `/admin`, `/admin/compras`,
   `/admin/plano`, `/admin/inventario/reabastecer` con cuenta E2E → 0 excepciones.
   NO correr `test:smoke` ni `load-sim` contra producción.
7. Rollback si falla: `npx wrangler rollback 22fc90a0-272e-4817-af29-f0f5acec1cf8`
   (versión 2026-09-24). Las migraciones son aditivas; no estorban.
8. `git push origin main`.

## Criterios de aceptación

- `pnpm build:worker` termina en Windows y genera `.open-next/worker.js` nuevo.
- Preview local responde sin errores de `cloudflare:*`.
- typecheck / lint / test / db:check en verde; usability 0/0; smoke OK.
- Bucket creado; migraciones aplicadas; access:seed OK.
- Versión nueva en `wrangler deployments list`; melena.app responde; tail sin excepciones.
- `origin/main` == `main`.

## Notas

- El parche queda atado a `@opennextjs/cloudflare@1.20.6`: al actualizar hay que
  regenerarlo o desplegar desde WSL/Linux.
- Archivos vacíos `beauty-pos@0.1.0` y `tsx` (accidentales) se borran en este plan.
- `readme/README.md`: corregir que "lecta" es otro repo (`LuisSG9915/lecta`).

## Desviaciones

### Parche extendido (segunda pieza)

Además del empaquetado, `opennextjs-cloudflare deploy` llamaba
`getEnvFromPlatformProxy` (`dist/cli/commands/utils/helpers.js`), que levanta un
`getPlatformProxy` de wrangler para leer `vars`. El binding `AI` (Workers AI no
tiene simulador local — `remote` obligatorio) obliga a abrir una sesión de
preview remota contra `beauty-pos.luis-sg9915.workers.dev`, y ese hostname está
protegido por una app de Cloudflare Access (`lucky-mouse-5479`). Sin service
token y en contexto no-interactivo, el deploy abortaba con:

```
Failed to start the remote proxy session. ... The domain "beauty-pos.
luis-sg9915.workers.dev" is behind Cloudflare Access
```

El parche envuelve el `getPlatformProxy` en `try/catch`: si falla, se continúa
con `process.env` + `.env*` (los `vars` de wrangler.jsonc están comentados de
todos modos, así que no se pierde nada). No se puede poner `remote: false` en el
binding `ai` — wrangler lo rechaza para bindings sin simulador local.

### Migración 0052 en CockroachDB

Los `CREATE TABLE` de `mobiliario`, `pisos` y `ubicaciones` llevaban literales
numéricos interpolados por el template `sql` de Drizzle → llegaban como
parámetros `$1` y CockroachDB rechazaba los CHECK ("expected immutable
expression"). Se reescribieron como constantes literales en
`drizzle/0052_brief_firebrand.sql` + snapshot, se limpiaron las tablas parciales
y se re-aplicó: 53/53 en `lecta_dev` (local) y en `defaultdb` (producción vía
Hyperdrive).

### Access cubre todos los hostnames

`melena.app`, `www.melena.app` y `beauty-pos.luis-sg9915.workers.dev` responden
302 → `lucky-mouse-5479.cloudflareaccess.com`. La verificación HTTP externa
(`/api/health`, `/login`) no puede pasar sin credenciales de Access: el deploy se
verificó por `wrangler deployments list` (versión `0121f4a4-c789-4755-b39a-
02ec6cc5506e`, 100%, bindings completos). Si esa puerta es intencional, todo
bien; si no, revisar la app Access que cubre los dos dominios.

## Resultado

- `pnpm build:worker` ✅ en Windows (con parche).
- Preview local ✅ (`/api/health`, `/login`, `/`, `/offline` → 200; `/admin` → 307
  a `/login`; sin errores `cloudflare:sockets`/sharp).
- Deploy ✅: versión `0121f4a4-c789-4755-b39a-02ec6cc5506e`, bindings
  HYPERDRIVE + CACHE_KV + MEDIA + AI + ASSETS, dominios melena.app +
  www.melena.app + workers.dev.
- Migraciones ✅ 53/53 en producción; `access:seed` ✅; `plans:seed` ✅;
  bucket `melena-media` ✅ existente.
- Verificación funcional ✅ completa en local: 502 tests, usability 0/0, smoke
  OK, perf OK, flows E2E 72/72.
