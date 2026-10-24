# Misión 05 — Accesibilidad axe y objetivos táctiles en cobro y facturación del POS

## 1. Metadatos
- **ID:** 05
- **Duración estimada:** 25 minutos
- **Archivos a modificar:** 3 (`src/app/admin/pos/cobro-form.tsx`, `src/app/admin/pos/facturar-panel.tsx`, `src/app/admin/pos/venta-directa-submit.tsx`)
- **Trazabilidad:** `readme/README.md` §1 Criterio S2/S3 y §4 (0 violaciones axe y controles >= 44 px en `/admin/pos` a 390 px)
- **Dependencias:** Misión 04

## 2. Objetivo
Dejar `/admin/pos` con 0 controles cortados, 0 objetivos táctiles menores a 44 px y 0 violaciones `axe` en los formularios de medios de pago (`cobro-form.tsx`), panel de facturación (`facturar-panel.tsx`) y botón de envío de venta (`venta-directa-submit.tsx`).

## 3. Fuera de alcance
- No cambiar las reglas de cobro mixto, anticipos ni timbrado PAC (`src/modules/pos/pagos.ts`, `src/modules/facturacion/pac.ts`).
- No modificar `src/app/admin/pos/printable-ticket.tsx`.

## 4. Contrato de contexto
- **Archivos permitidos para lectura (máximo 4):**
  1. `src/app/admin/pos/cobro-form.tsx`
  2. `src/app/admin/pos/facturar-panel.tsx`
  3. `src/app/admin/pos/venta-directa-submit.tsx`
  4. `scripts/axe-detail.ts`
- **Archivos que NO debes abrir:**
  - `src/modules/facturacion/*`
  - `src/app/admin/pos/offline-actions.ts`
  - `src/db/*`

## 5. Contexto verificado
- Archivos reales en el árbol del repositorio: `src/app/admin/pos/cobro-form.tsx`, `src/app/admin/pos/facturar-panel.tsx`, `src/app/admin/pos/venta-directa-submit.tsx`.
- `BLOQUEO:` Antes de editar, ejecuta `nl -ba src/app/admin/pos/cobro-form.tsx src/app/admin/pos/facturar-panel.tsx src/app/admin/pos/venta-directa-submit.tsx` para comprobar las líneas exactas.

## 6. Diseño decidido
Se elige apilar en 1 columna en móvil (`grid-cols-1 sm:grid-cols-2 gap-3`) los selectores de medio de pago y monto en `cobro-form.tsx`, asegurar que los botones de "Agregar medio de pago" y "Quitar medio de pago" tengan `min-h-11` y `aria-label` explícito, vincular todos los `<input>` y `<select>` con `<label htmlFor>` o `aria-label` tanto en `cobro-form.tsx` como en `facturar-panel.tsx`, y asegurar que `venta-directa-submit.tsx` ocupe `w-full min-h-11` con contraste AA válido.

## 7. Pasos
1. **Corregir layout 390 px, labels y botones en `src/app/admin/pos/cobro-form.tsx`:**
   - Archivo: `src/app/admin/pos/cobro-form.tsx`
   - Qué cambia: Cambiar las filas de medios de pago a `grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 min-w-0`; agregar `aria-label` o `<label htmlFor>` a cada selector de medio de pago y campo de monto; ajustar botones de agregar/eliminar pago y montos rápidos a `min-h-11 min-w-11`.
   - Verificación inmediata: `pnpm typecheck`
2. **Corregir etiquetas y ancho móvil en `src/app/admin/pos/facturar-panel.tsx`:**
   - Archivo: `src/app/admin/pos/facturar-panel.tsx`
   - Qué cambia: Asegurar que los campos de RFC, uso de CFDI y régimen fiscal estén en `grid-cols-1 sm:grid-cols-2 gap-3 min-w-0`, con `<label htmlFor>` asociado y altura mínima `min-h-11` en controles interactivos.
   - Verificación inmediata: `pnpm typecheck`
3. **Asegurar objetivo táctil y accesibilidad en `src/app/admin/pos/venta-directa-submit.tsx`:**
   - Archivo: `src/app/admin/pos/venta-directa-submit.tsx`
   - Qué cambia: Garantizar `w-full min-h-11` en el botón de envío y estado `aria-busy={pending}` legible por lectores de pantalla.
   - Verificación inmediata: `pnpm typecheck && pnpm lint`

## 8. Criterios de aceptación y verificación
- Comando 1:
  ```bash
  pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/pos
  ```
- Salida esperada: 0 cortes, 0 desbordes horizontales y 0 objetivos táctiles < 44px en /admin/pos.
- Comando 2:
  ```bash
  pnpm tsx scripts/axe-detail.ts --only=/admin/pos
  ```
- Salida esperada: 0 violaciones axe en /admin/pos.

## 9. Presupuesto y criterios de parada (BLOQUEO:)
- Presupuesto: 3 archivos; 25 minutos.
- Criterios de parada:
  - BLOQUEO: Si axe-detail.ts --only=/admin/pos reporta una violación originada en src/components/ui/combobox.tsx o src/components/ui/remote-combobox.tsx fuera de los 3 archivos de esta misión, detente y repórtalo con BLOQUEO: indicando el archivo exacto.

## 10. Reporte, desviaciones y bloque de handoff
- Desviaciones permitidas: Ninguna.
- Bloque de handoff (pegar en máximo 10 líneas al terminar):
  - git diff --stat (3 archivos).
  - Salida de pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/pos.
  - Salida de pnpm tsx scripts/axe-detail.ts --only=/admin/pos.
  - Tabla Antes/Después de hallazgos móviles y axe en /admin/pos.
