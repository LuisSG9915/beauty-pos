# 30 — Diálogo modal rojo único para confirmaciones destructivas con monto y consecuencia

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** 40 min · **Archivos previstos:** 5

**Objetivo\***
Reemplazar los formularios destructivos inline y dispares (cancelar venta
cobrada en POS, revertir gasto en Gastos y cancelar comprobante en
Comprobantes) por un único patrón de diálogo modal rojo (`AlertDialog`
destructivo) cuyo título indique la **acción y el monto/folio exacto** (ej.
`"¿Cancelar venta de $350.00?"`) y cuya descripción explique en lenguaje llano
la **consecuencia exacta** (qué ocurre con el dinero en caja, el stock y las
comisiones).

**Fuera de alcance\***
- No cambiar las Server Actions (`cancelarVentaCobrada`,
  `revertirGastoAction`, `cancelarFactura`).
- No borrar registros físicamente (`DELETE`), manteniendo el modelo de
  movimientos compensatorios auditables.

## Contrato de contexto

- **Archivos permitidos para lectura (máximo 5):**
  1. `src/components/ui/alert-dialog.tsx`
  2. `src/app/admin/pos/venta-ticket.tsx`
  3. `src/app/admin/gastos/revertir-gasto-form.tsx`
  4. `src/app/admin/gastos/page.tsx`
  5. `src/app/admin/facturacion/cancelar-form.tsx`
- **Archivos que NO debes abrir:** `src/db/*`, `src/modules/pos/service.ts`, `drizzle/*`.

## Contexto verificado\*

- `src/components/ui/alert-dialog.tsx:85, 104, 128-179` — `AlertDialogCancel`
  y `AlertDialogAction` usan `min-h-10` (40 px < 44 px). Además,
  `AlertDialogAction` es `AlertDialogPrimitive.Close`: si se usa como botón de
  envío de un `<form>`, desmonta el popup inmediatamente al hacer clic y
  cancela el `submit` antes de validar campos `required` o ejecutar la Server
  Action.
- `src/app/admin/pos/venta-ticket.tsx:1173-1179, 1320-1401` —
  `CancelarVentaButton` recibe `{ onChanged, organizationId, ventaId }` (sin
  `total` ni `currency`) y al abrirse despliega un `<form>` inline dentro de
  la tarjeta verde de venta cobrada (`líneas 1359-1400`).
- `src/app/admin/gastos/revertir-gasto-form.tsx:15-44` y
  `src/app/admin/gastos/page.tsx:291-295, 343-347` — `RevertirGastoForm` usa
  un `<details>` inline de `w-56` y solo recibe `{ organizationId, gastoId,
  concepto }` (no recibe `importeFormateado` ni `cajaVinculada`, datos que
  `gastos/page.tsx` ya tiene en `fmt(gasto.importe)` y `gasto.cajaVinculada`).
- `src/app/admin/facturacion/cancelar-form.tsx:13-54` —
  `CancelarFacturaForm` renderiza el `<Select name="motivo">` y el botón
  `"Cancelar comprobante"` directamente inline sin diálogo de confirmación
  previa.

## Diseño decidido

1. **Ajuste táctil y visual en `src/components/ui/alert-dialog.tsx`:**
   - Cambiar `min-h-10` a `min-h-11` (44 px) en `AlertDialogCancel`
     (`línea 85`) y `AlertDialogAction` (`línea 104`).
   - En `AlertDialogContent`, aceptar una prop opcional `destructive?: boolean`
     que añada `border-destructive/40` al borde del modal cuando sea `true`.
2. **Patrón estándar de `<form>` dentro de `AlertDialog` para acciones con
   motivo:**
   - Para acciones destructivas que requieren inputs (`motivo` /
     `uuidSustitucion`), usar
     `<AlertDialog open={abierto} onOpenChange={setAbierto}>`:
     - `<AlertDialogTrigger>` envuelve un botón disparador con `min-h-11` y
       texto claro (`"Cancelar venta…"`, `"Revertir gasto…"`, `"Cancelar
       comprobante…"`).
     - Dentro de `<AlertDialogContent destructive>`, colocar
       `<form action={formAction} className="space-y-4">`:
       - Encabezado rojo: `<AlertDialogHeader>` con
         `<AlertDialogTitle className="text-destructive">` indicando **acción
         + monto/folio** y `<AlertDialogDescription>` explicando la
         **consecuencia exacta**.
       - Campos del formulario (`<Input name="motivo" required />` o `<Select
         name="motivo">`) + `<ActionFeedback state={state} />`.
       - En `<AlertDialogFooter>`, colocar
         `<AlertDialogCancel disabled={pending} type="button">No, volver</AlertDialogCancel>`
         y
         `<Button className="min-h-11" disabled={pending} type="submit" variant="destructive">{pending ? ... : ...}</Button>`.
       - Un `useEffect` observa `state.success`: cuando pasa a `true`, cierra
         el diálogo (`setAbierto(false)`).
3. **Textos obligatorios por componente:**
   - **`CancelarVentaButton` (`src/app/admin/pos/venta-ticket.tsx`):**
     - Recibir `total: string` y `currency: string` desde `VentaTicket`
       (`línea 1174`).
     - Título: `` `¿Cancelar venta de ${formatCurrency(total, { currency })}?` ``
     - Descripción: `"Se registrará la devolución del dinero en la caja, los
       productos regresarán al inventario y se anularán las propinas y
       comisiones de esta venta. Esta acción no se puede deshacer."`
     - Botón de confirmación: `"Sí, cancelar venta"`.
   - **`RevertirGastoForm`
     (`src/app/admin/gastos/revertir-gasto-form.tsx` +
     `src/app/admin/gastos/page.tsx`):**
     - Añadir props opcionales `importeFormateado?: string` y
       `cajaVinculada?: boolean` y pasarlas desde `gastos/page.tsx`
       (`líneas 291 y 343`: `importeFormateado={fmt(gasto.importe)}`,
       `cajaVinculada={gasto.cajaVinculada}`).
     - Título: `` `¿Revertir gasto ${importeFormateado ? `de ${importeFormateado}` : `«${concepto}»`}?` ``
     - Descripción:
       `cajaVinculada ? `El gasto «${concepto}» quedará marcado como revertido y el dinero regresará al efectivo esperado de la caja abierta. Esta acción no se puede deshacer.` : `El gasto «${concepto}» quedará marcado como revertido en los reportes. Esta acción no se puede deshacer.``
     - Botón de confirmación: `"Sí, revertir gasto"`.
   - **`CancelarFacturaForm` (`src/app/admin/facturacion/cancelar-form.tsx`):**
     - Añadir prop opcional `folioLabel?: string`.
     - Reemplazar el formulario inline por un botón disparador `"Cancelar
       comprobante…"` (`min-h-11`) que abre el `AlertDialog` rojo con título
       `` `¿Cancelar comprobante${folioLabel ? ` ${folioLabel}` : ""}?` `` y
       descripción `"El comprobante quedará cancelado y sin validez. El cobro
       de la venta en caja no se cancela."`, manteniendo adentro el
       `<Select name="motivo">` y el input condicional `uuidSustitucion`.

## Pasos

1. **`src/components/ui/alert-dialog.tsx`** — Actualizar `AlertDialogCancel` y
   `AlertDialogAction` a `min-h-11` y añadir la prop opcional
   `destructive?: boolean` en `AlertDialogContent` (`border-destructive/40`).
   - Verificación inmediata: `pnpm typecheck`
2. **`src/app/admin/pos/venta-ticket.tsx`** — Pasar `total={venta.total}` y
   `currency={currency}` a `CancelarVentaButton` (`línea 1174`) y migrar
   `CancelarVentaButton` (`1320-1401`) al patrón `AlertDialog` destructivo con
   monto exacto y consecuencia en caja/stock/comisiones.
   - Verificación inmediata: `pnpm typecheck`
3. **`src/app/admin/gastos/revertir-gasto-form.tsx` y
   `src/app/admin/gastos/page.tsx`** — Migrar `RevertirGastoForm` de
   `<details>` inline a `AlertDialog` destructivo y pasar
   `importeFormateado={fmt(gasto.importe)}` y
   `cajaVinculada={gasto.cajaVinculada}` desde `gastos/page.tsx`.
   - Verificación inmediata: `pnpm typecheck`
4. **`src/app/admin/facturacion/cancelar-form.tsx`** — Envolver el formulario
   de cancelación de comprobante en un `AlertDialog` destructivo disparado por
   el botón `"Cancelar comprobante…"`.
   - Verificación inmediata: `pnpm typecheck && pnpm lint && pnpm test`

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] `pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/gastos,/admin/facturacion`
      → 0 errores y todos los botones ≥ 44 px (`min-h-11`).
- [ ] Al cancelar una venta cobrada, revertir un gasto o cancelar un
      comprobante, se abre siempre el diálogo modal con borde/título rojo
      indicando el monto o concepto y la consecuencia exacta sobre el dinero y
      el inventario, y el campo `motivo` se envía correctamente en el
      `FormData`.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/gastos
pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/facturacion
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 40 min (una sesión) |
| Archivos tocados | 5 archivos de producción |
| Contexto | ≤ 160k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- Si algún formulario dentro de `AlertDialogContent` se cierra antes de enviar
  el `FormData` al hacer submit, verificar que el botón de envío sea
  `<Button type="submit" variant="destructive">` y NO `<AlertDialogAction>`.

## Reporte (al terminar)

```
Misión: 30 — Diálogo modal rojo único para confirmaciones destructivas con monto y consecuencia
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability /admin/gastos y /admin/facturacion 0 errores
Antes → después: 3 formularios inline dispares (<details> y forms abiertos) → 1 patrón único de AlertDialog rojo con monto/concepto y consecuencia explícita
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Ninguna.
