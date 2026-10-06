# Plan 03 — Alta rápida de productos y servicios (y altas/bajas/ediciones simples)

**Modelo recomendado:** SWE-2 MAX
**Depende de:** 02 (clave/SKU automático)
**Dolor que resuelve:** "Simplificar el proceso de alta de productos y servicios,
así como demás funcionalidades (agenda, altas, bajas, ediciones)."

## Contexto verificado

- `product-form.tsx`: 4 pestañas (`FormTabs`) — general, precios, inventario y una
  pestaña "Proveedores e historial" que es **relleno** ("se habilitarán…").
  Campos obligatorios: SKU, nombre, tipo, costo, precio, stock mínimo.
- `service-form.tsx` similar; hay `comisiones-manager` e `insumos-manager`
  aparte.
- Existe `src/components/admin/form-sheet.tsx` (panel lateral) y `FormTabs`.

## Diseño decidido

### Alta rápida (una pantalla, mínimo de campos)

**Producto:** nombre, precio de venta, categoría (opcional), stock inicial
(opcional, default 0). Defaults del servidor: tipo `producto`, costo 0, stock
mínimo 0, `visiblePos=true`, SKU auto (plan 02), sin código de barras.
Todo lo demás bajo un desplegable "Más opciones" (costo, código de barras,
unidad, descripción, stock mínimo, insumo).

**Servicio:** nombre, duración, precio, categoría. Defaults: `visibleAgenda=true`,
`requiereCabina=false`, clave auto. "Más opciones": descripción, precios por
sucursal.

### Edición y baja

- Edición abre el mismo formulario en `FormSheet` (panel lateral) desde la tabla,
  sin cambiar de página.
- Baja = desactivar (`activo=false`) con `ActionFeedback` + **Deshacer** durante
  5 s en el toast. Confirmación solo si el producto/servicio tiene ventas/citas
  asociadas.
- Eliminar la pestaña "Proveedores e historial" de relleno (vuelve en plan 10
  con contenido real).

### Patrón reutilizable

Extraer `QuickCreateSheet`/`useQuickCreate` si el mismo patrón aplica a clientes
y categorías, pero **no refactorizar todo** — solo productos y servicios en esta
fase.

## Pasos

1. Reescribir `product-form.tsx` a una sección (sin tabs): esenciales + "Más
   opciones" (`<details>` o sección colapsable acorde al diseño actual).
2. `servicios/service-form.tsx` igual.
3. `actions.ts` de ambos: defaults servidor + SKU/clave auto (usa plan 02).
4. Panel lateral de edición en las páginas de lista (`productos/page.tsx`,
   `servicios/page.tsx`) usando `FormSheet` existente.
5. Baja con deshacer: mirar cómo se hace el toggle/soft-delete actual y replicar.

## Criterios de aceptación

- Alta de producto: 3 campos llenados → guardado en 1 clic.
- Alta de servicio: nombre + duración + precio → listo.
- Editar desde la tabla sin salir de la página.
- Desactivar muestra toast con Deshacer funcional.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:usability` (con dev).
Productos alimentan POS → `pnpm test:smoke`.

## Fuera de alcance

Foto de producto (plan 07/08), proveedores reales (plan 10), stock por ubicación
(plan 11).

## Desviaciones (la llena el implementador)

- **Edición en panel lateral ya existía**: `productos/page.tsx` y
  `servicios/page.tsx` ya abrían `FormSheet` con `?edit=<id>` / `?nuevo=1`;
  no requirió cambios estructurales (solo se reemplazó el toggle por fila).
- **Stock inicial (implementación no detallada en el plan)**: al crear con
  `stockInicial > 0` se registra el alta del producto **y** el movimiento
  `entrada` (`applyInventoryMovement`) en la misma transacción — si el
  movimiento falla, el alta se revierte. La `sucursalId` se resuelve con la
  misma regla de `getAdminContext`: cookie `melena_sucursal_{org}` validada
  contra `sucursalesActivasDelAcceso` → primera del alcance. Sin sucursal
  activa devuelve error pidiendo stock 0 + ajuste desde Inventario. El campo
  solo se muestra en alta (en edición el stock se gestiona desde Inventario).
- **Feedback de la baja va por toast, no por `ActionFeedback` inline**: la
  acción vive en filas de la lista (no dentro de un formulario), así que se
  siguió el patrón de `PoliticaCajaToggle` (`useTransition` + `useToast` +
  `router.refresh`); los errores se anuncian con `toast.error`. El Deshacer
  se apoya en `Toast.Action` de base-ui — se extendió `toast.tsx` mínimamente
  (`actionProps` en `ToastInput` + render condicional en `ToastList`).
  La baja se aplica de inmediato; "Deshacer" re-llama la acción con
  `activar=true` dentro de los 5 s del toast.
- **Confirmación extra implementada (costo bajo)**: UNA consulta
  `select exists(...)` solo al ocultar. Producto → `detalle_ventas_productos`
  ⋈ `ventas` activas. Servicio → `detalle_citas_servicios` ⋈ `citas` **O**
  `detalle_ventas_servicios` ⋈ `ventas` (se agregó ventas porque un servicio
  puede venderse en POS sin cita). La acción responde `needsConfirm` sin
  tocar la fila; el cliente abre `ConfirmDialog` y reintenta con
  `confirmado=true`. Se reutilizó `ConfirmDialog` de
  `components/ui/alert-dialog` (no `window.confirm`).
- **Semántica del toggle cambiada**: `toggleProduct`/`toggleService` ahora
  reciben `activar` ("true"/"false" = estado deseado) en lugar de `activo`
  (estado actual que se negaba), para que Deshacer sea determinista. Ambas
  acciones pasaron de `Promise<void>` a devolver `*ActionState`; sus únicos
  usos eran los forms de las páginas, reemplazados por el nuevo componente
  compartido `src/components/admin/toggle-activo.tsx` (`ToggleActivo`).
  `CrudRowActions` (categorías) NO se tocó — solo productos y servicios.
- **"Precios por sucursal" no aplica**: la tabla `precios_servicios` existe
  en el esquema pero no se usa en ninguna parte del código (sin UI ni
  lecturas); el formulario actual no tenía esa sección, así que no se movió.
- **Pestañas de relleno eliminadas**: "Proveedores e historial" (productos)
  e "Insumos y comisiones" (servicios). En servicios se conservó un aviso
  breve en el alta ("después de guardar podrás asignar insumos y comisiones
  editándolo desde la lista") porque `InsumosManager`/`ComisionesManager`
  reales siguen bajo el formulario en edición.
- **SKU/clave manual se conservó** dentro de "Más opciones" solo en edición
  (comportamiento previo: vacío = conservar la actual; alta = auto plan 02).
- **Telemetría añadida**: botón guardar con `data-action-clave="1"` +
  `data-action-id="catalogo.{productos,servicios}.guardar"` y `size="lg"`
  (≥40 px táctil). Toggle con `data-action-id="catalogo.{...}.{ocultar|activar}"`.
- **Defaults servidor**: `tipo`/`costo`/`stockMinimo`/`stockInicial` ahora
  opcionales en zod con default `producto`/`"0"`/`"0"`/`0`; `precioVenta` y
  `nombre` siguen requeridos (servicio: `duracionMinutos` y `precioBase`).
- **Verificación parcial**: `pnpm test:usability` y `pnpm test:smoke` no
  corrieron en este entorno (sin `.env` ni Chrome); aplican en el entorno del
  usuario con `pnpm dev` corriendo.
