# 29 — Redirección automática a "Mi día" y avisos sin ruido comercial para roles operativos

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** 30 min · **Archivos previstos:** 5 (4 prod + 1 prueba)

**Objetivo\***
Cuando una estilista o profesional con rol operativo entra a `/admin`, el
servidor la redirige directamente a `/admin/mi-dia` (citas, propinas y
comisiones) sin ejecutar las consultas de onboarding ni alertas de dueña;
además, `SubscriptionBanner` oculta la promoción comercial de planes para el
personal operativo y solo muestra un aviso discreto de escalamiento a la dueña
si la suscripción está vencida o a ≤ 3 días de vencer.

**Fuera de alcance\***
- No modificar los permisos de los roles por defecto en
  `src/lib/auth/defaults.ts` ni crear migraciones SQL.
- No redirigir a `recepcion`, `cajero`, `almacen`, `gerente`, `administrador`
  ni `propietario`.

## Contrato de contexto

- **Archivos permitidos para lectura (máximo 5):**
  1. `src/lib/auth/authorization.ts`
  2. `src/lib/auth/defaults.ts`
  3. `src/app/admin/page.tsx`
  4. `src/components/admin/subscription-banner.tsx`
  5. `src/components/admin/admin-shell.tsx`
- **Archivos que NO debes abrir:** `src/db/schema/*`,
  `src/modules/billing/service.ts`, `drizzle/*`.

## Contexto verificado\*

- `src/lib/auth/defaults.ts:53-134` — Permisos exactos por rol:
  - `especialista` (`109-121`): `["clientes.ver", "clientes.editar",
    "expedientes.alergias_ver", "expedientes.privado", "agenda.ver",
    "agenda.editar", "catalogos.ver", "ventas.ver"]`.
  - `recepcion` (`72-90`): incluye `agenda.ver` pero además tiene
    `ventas.crear`, `facturacion.emitir`, `compras.editar` y
    `compras.recibir`.
  - `cajero` (`91-107`): incluye `agenda.ver` pero además tiene `ventas.crear`,
    `ventas.cobrar`, `caja.ver`, `caja.abrir`, `caja.cerrar`.
  - `almacen` (`122-133`): no tiene `agenda.ver` y tiene `inventario.editar` y
    `compras.editar`.
- `src/app/admin/page.tsx:227-266` — En `AdminPage`, para cualquier usuario no
  administrador de plataforma ejecuta
  `Promise.all([porOrganizacion, estadoYProgreso])` y renderiza
  `MemberDashboard` (con `RenombrarSucursalCard` y `GuiaChecklistCard`), sin
  importar si es `especialista`.
- `src/components/admin/admin-shell.tsx:55, 737-743` — `AdminShell` ya recibe
  `permissionsByOrg?: Record<string, string[]> | null`, pero al renderizar
  `<SubscriptionBanner billingByOrg={billingByOrg} organizations={organizations} />`
  no le pasa `permissionsByOrg`.
- `src/components/admin/subscription-banner.tsx:20-70` — Muestra siempre el
  banner de `trialing` (durante los 14 días) y el enlace `"Ver planes"` hacia
  `/precios` a todos los usuarios sin distinguir rol.

## Diseño decidido

1. **Función pura `esRolOperativoMiDia` en `src/lib/auth/authorization.ts`:**

   ```ts
   const PERMISOS_GESTION_O_MOSTRADOR = [
     "organizaciones.editar",
     "sucursales.editar",
     "usuarios.invitar",
     "roles.editar",
     "caja.ver",
     "caja.abrir",
     "ventas.crear",
     "ventas.cobrar",
     "facturacion.emitir",
     "compras.editar",
     "inventario.editar",
     "reportes.financieros",
   ] as const;

   export function esRolOperativoMiDia(permissions: Iterable<string>): boolean {
     const set = permissions instanceof Set ? permissions : new Set(permissions);
     if (!set.has("agenda.ver")) return false;
     return !PERMISOS_GESTION_O_MOSTRADOR.some((permiso) => set.has(permiso));
   }
   ```

   Esto garantiza matemáticamente que `especialista` → `true`, y `propietario`,
   `administrador`, `gerente`, `recepcion`, `cajero` y `almacen` → `false`.
2. **Redirección temprana en `src/app/admin/page.tsx`:**
   - En `AdminPage`, después de obtener `permisosActivos` y antes de lanzar
     `Promise.all([porOrganizacion, estadoYProgreso])`:
     si `!error && orgPrincipal && sucursalActivaId && esRolOperativoMiDia(permisosActivos)`,
     llamar `redirect(buildAdminHref("/mi-dia", { organizationId: orgPrincipal.id, sucursalId: sucursalActivaId }))`.
   - El guard `!error` evita cualquier bucle si el usuario llegó redirigido a
     `/admin?error=permiso-denegado`.
3. **Comportamiento de `SubscriptionBanner` por rol (`subscription-banner.tsx`
   + `admin-shell.tsx`):**
   - Pasar `permissionsByOrg={permissionsByOrg}` desde `AdminShell` a
     `SubscriptionBanner`.
   - En `SubscriptionBanner`, calcular
     `const permisos = organizationId && permissionsByOrg ? permissionsByOrg[organizationId] : null;`
     y
     `const puedeAdministrarPlan = permisos === null || permisos.includes("organizaciones.editar") || permisos.includes("sucursales.editar");`.
   - Si `!puedeAdministrarPlan`:
     - Cuando `badge.estado === "trialing"` y `(badge.diasRestantes === null ||
       badge.diasRestantes > 3)`: retornar `null` (0 ruido durante el periodo
       normal de prueba).
     - Cuando `badge.estado === "trialing"` y `badge.diasRestantes !== null &&
       badge.diasRestantes <= 3`: mostrar el aviso sin enlace a `/precios`:
       `"El periodo de prueba del salón vence en {diasRestantes} día(s) —
       recuérdale a la dueña o encargada para evitar pausas."`.
     - Cuando `badge.estado === "vencida"`: mostrar `"La suscripción del salón
       está en pausa (solo lectura) — avísale a la dueña o encargada para
       reactivarla."`, sin el botón `"Ver planes"`.

## Pasos

1. **`src/lib/auth/authorization.ts`** — Exportar
   `esRolOperativoMiDia(permissions: Iterable<string>): boolean`.
   - Verificación inmediata: `pnpm typecheck`
2. **`src/app/admin/page.tsx`** — Importar `redirect` de `next/navigation` y
   `esRolOperativoMiDia` de `@/lib/auth/authorization`, y ejecutar el
   `redirect` a `/mi-dia` antes del `Promise.all` cuando `!error &&
   orgPrincipal && sucursalActivaId && esRolOperativoMiDia(permisosActivos)`.
   - Verificación inmediata: `pnpm typecheck`
3. **`src/components/admin/admin-shell.tsx` y
   `src/components/admin/subscription-banner.tsx`** — Pasar `permissionsByOrg`
   a `SubscriptionBanner` y adaptar el mensaje/CTA cuando
   `!puedeAdministrarPlan` (además de subir `min-h-6` a `min-h-11` en el
   enlace `"Ver planes"` cuando sí se muestra a la dueña).
   - Verificación inmediata: `pnpm typecheck && pnpm lint`
4. **`src/lib/auth/authorization.test.ts`** — Importar `defaultRoles` desde
   `@/lib/auth/defaults` y `esRolOperativoMiDia`, y añadir un bloque
   `describe("esRolOperativoMiDia", ...)` que verifique los 7 roles de
   `defaultRoles` (`especialista` → `true`; `propietario`, `administrador`,
   `gerente`, `recepcion`, `cajero`, `almacen` → `false`, más rol sin
   `agenda.ver` → `false`).
   - Verificación inmediata:
     `pnpm test src/lib/auth/authorization.test.ts --run`

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint` → 0 errores.
- [ ] `pnpm test src/lib/auth/authorization.test.ts --run` → todas las pruebas
      en verde, incluyendo la matriz completa de los 7 roles de
      `defaultRoles`.
- [ ] `recepcion` y `cajero` no son redirigidos a `/admin/mi-dia`;
      `especialista` sí es redirigido a `/admin/mi-dia` salvo cuando viene
      `?error=`.
- [ ] Un usuario `especialista` no ve el botón `"Ver planes"` ni el banner de
      prueba cuando restan > 3 días.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test src/lib/auth/authorization.test.ts --run
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 30 min (una sesión) |
| Archivos tocados | 4 de producción + 1 de prueba |
| Contexto | ≤ 140k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- Si algún test de `src/components/admin-nav.test.ts` o
  `authorization.test.ts` falla por los permisos de `defaultRoles`, detenerse
  y revisar la lista de exclusión.

## Reporte (al terminar)

```
Misión: 29 — Redirección automática a "Mi día" y avisos sin ruido comercial para roles operativos
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test authorization.test.ts ✔
Antes → después: Especialista aterrizaba en /admin viendo checklist y banner de compra → Redirige a /admin/mi-dia en 1 consulta y sin CTA comercial
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Ninguna.
