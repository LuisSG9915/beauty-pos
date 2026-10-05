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

_Vacío. Anotar aquí cualquier diferencia entre el plan y el código real, y `BLOQUEO:` si algo impide continuar._
