# Plan 01 — Sucursal persistente y POS sin selector redundante

**Modelo recomendado:** SWE-2 MAX (ejecución directa, diseño cerrado aquí)
**Dolor que resuelve:** "Tengo una sucursal en la que trabajo, pero ventas me pide
elegir sucursal cada vez y no se guarda en memoria; tengo que seleccionar una y
otra vez."

## Contexto verificado

- `src/lib/admin-context.ts` (~línea 149): `requestedSucursalId = firstParam(params.sucursalId)`
  y `branch = find(requestedSucursalId) ?? branches[0]`. Si no hay `?sucursalId`
  en la URL, siempre cae a la primera sucursal. **No hay cookie ni localStorage.**
- `src/app/admin/pos/page.tsx` (~línea 179): el formulario de venta pide la
  sucursal con un `<Select required name="sucursalId">` aunque la página ya
  resolvió `context.sucursalId`. Hay un segundo select "Cambiar sucursal" (~200).
- Navegación entre pantallas: `buildAdminHref(href, { organizationId, sucursalId })`
  ya propaga el query param — por eso "a veces sí se recuerda" (mientras navegas
  por links internos) y se pierde al entrar directo o tras login.
- Selectores actuales viven en `src/components/admin-nav.tsx` /
  `src/components/admin/admin-shell.tsx`.

## Diseño decidido

1. **Cookie `melena_sucursal`** por organización: nombre
   `melena_sucursal_{organizationId}`, `httpOnly`, `sameSite=lax`, `path=/admin`,
   `max-age` 90 días. Se escribe vía server action (no desde JS del cliente, para
   que llegue al primer render del servidor y no haya parpadeo).
2. **`getAdminContext`** resuelve la sucursal en este orden:
   `?sucursalId` válida → cookie válida → `branches[0]`. "Válida" = existe en
   `branches` (respeta el alcance del usuario automáticamente).
3. **Selector de sucursal en el shell** (junto al de organización): al cambiar,
   server action que escribe la cookie y hace `redirect(buildAdminHref(misma
   ruta, { organizationId, sucursalId: nueva }))` para refrescar datos.
4. **POS**: quitar el `<Select required name="sucursalId">` del formulario de
   venta directa y usar `context.sucursalId` del contexto resuelto. Mostrar un
   chip "Vendiendo en {nombre} · Cambiar" que lleva al selector del shell (o
   `?sucursalId=`). La acción `venta-directa-submit`/`cobro` toma la sucursal del
   contexto servidor, no del form.
5. **Una sola sucursal**: no renderizar ningún selector (ni en POS ni en shell);
   solo el nombre como texto.
6. **Seguridad**: la cookie nunca se confía — siempre se valida contra
   `access.branchIds`/`branches` en servidor (ya lo hace `branches.find`).

## Pasos

1. `src/lib/sucursal-cookie.ts` (nuevo): `cookieName(orgId)`, `leerSucursalCookie(orgId)`
   (lee `cookies()`), server action `guardarSucursalPreferida` en
   `src/app/admin/actions.ts` (escribe cookie + redirect). Sin DB.
2. `admin-context.ts`: leer cookie con `cookies()` de `next/headers` (el contexto
   ya es async por request); insertar en la cadena de resolución.
3. Selector en shell: extraer el patrón actual de cambio de sucursal a un
   componente `BranchSelector` que use la server action del paso 1.
4. POS: quitar select del formulario; chip informativo; ajustar
   `pos/actions.ts` para usar `context.sucursalId` + `assertBranchScope`.
5. Buscar otras pantallas que pidan sucursal en formulario y aplicar el mismo
   patrón (revisar `inventario/page.tsx`, `mi-dia`, `caja`).

## Criterios de aceptación

- Con 2+ sucursales: eliges "Sucursal Norte" en POS, recargas, cierras y abres el
  navegador → sigues en "Sucursal Norte" en POS, inventario y agenda.
- El formulario de venta directa ya no pide sucursal.
- Con 1 sola sucursal: cero selectores visibles.
- `?sucursalId=` explícito en URL sigue ganando (links compartidos).

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:usability` (con `pnpm dev`
corriendo). Flujo de cobro: `pnpm test:smoke`.

## Fuera de alcance

Cambios visuales/animaciones (plan 05), reorganización org/sucursal (plan 06).

## Desviaciones (la llena el implementador)

_Vacío. Anotar aquí cualquier diferencia entre el plan y el código real, y `BLOQUEO:` si algo impide continuar._
