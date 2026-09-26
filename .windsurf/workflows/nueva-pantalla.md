---
description: Checklist para crear una pantalla nueva del panel admin siguiendo las convenciones de Melena
---

# /nueva-pantalla

Al crear una ruta `src/app/admin/<seccion>/`:

1. `page.tsx`: `export const dynamic = "force-dynamic"`; `getAdminContext(params)` para org/sucursal/timeZone; `requireAccessPermission(context.access, "<modulo>.ver")` antes de consultar datos.
2. `loading.tsx`: skeleton con `LoadingState` (ver `/admin/agenda/loading.tsx`).
3. Consultas: `Promise.all` para las independientes; fusionar con `jsonb` si hay cadena >2; nada de awaits secuenciales sin necesidad.
4. UI: `AdminPageHeader` + `AdminCard`; vocabulario de `src/lib/glosario.ts`; tipografía ≥ `text-op-xs`; tokens semánticos (no colores crudos); estados con `StatusBadge` o la fuente compartida del módulo.
5. Acción primaria con `data-action-clave="1"` y `data-action-id` semántico en acciones (telemetría).
6. Navegación: registrar el item en `src/components/admin-nav.tsx` (sección correcta, permiso, `capacidad` si aplica).
7. Verificar con `/verificar`: typecheck, lint, test, usability si es ruta operativa.
