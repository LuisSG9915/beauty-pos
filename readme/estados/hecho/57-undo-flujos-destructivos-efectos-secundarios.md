# 57 — Undo en flujos destructivos con efectos secundarios

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo**
Ofrecer "Deshacer" durante 5 s en los flujos destructivos que hoy son
irreversibles y exigen confirmación: cancelar venta, cancelar comprobante y
revertir gasto. Hoy estos flujos dicen "Esta acción no se puede deshacer" y
el usuario solo puede prevenir con la confirmación; el undo reduce el costo de
un error sin perder la seguridad de la confirmación.

**Fuera de alcance**
No se tocan: catálogos (ya tienen undo vía `ToggleActivo`), cancelación de
citas (ya tiene undo en agenda), migración de esquema, deploy, ni los flujos
de caja (apertura/cierre). Tampoco se cambia el texto de confirmación; el undo
se suma, no reemplaza.

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx` (~1360-1430) — `CancelarVentaDialog` usa
  `cancelarVentaCobrada` (server action) con confirmación; revierte inventario,
  caja, propinas y comisiones. No hay acción inversa.
- `src/app/admin/facturacion/cancelar-form.tsx` — `CancelarFacturaForm` usa
  `cancelarFactura`; cancela un CFDI emitido. No hay re-emisión automática.
- `src/app/admin/gastos/revertir-gasto-form.tsx` — `RevertirGastoForm` usa
  `revertirGastoAction`; marca el gasto como revertido y devuelve el dinero a
  la caja. No hay "deshacer reversión".
- `src/components/ui/toast.tsx` — `useToast().show({ actionProps })` ya soporta
  botón de acción con timeout (usado por `ToggleActivo`).
- `src/app/admin/agenda/agenda-board.tsx` (~518-530) — patrón de referencia:
  `onTransition` captura el estado anterior y muestra toast con "Deshacer".

## Diseño decidido

- Cada flujo captura el identificador y el estado previo antes de ejecutar.
- Tras éxito, muestra toast con `actionProps` "Deshacer" (timeout 5 s) que
  llama a la acción inversa.
- La acción inversa es una nueva server action dedicada por flujo:
  - `reactivarVenta(ventaId)` — revierte la cancelación (solo si no se han
    cobrado nuevas ventas sobre el mismo corte; validar).
  - `reemitirComprobante(comprobanteId)` — re-emite el CFDI cancelado (solo
    si sigue vigente el emisor y la venta).
  - `deshacerReversionGasto(gastoId)` — desmarca el gasto como revertido y
    vuelve a descontar de la caja.
- Si la acción inversa falla (p. ej. corte ya cerrado), el toast muestra
  el error y el registro queda en su estado actual.

## Pasos

1. `src/app/admin/pos/actions.ts` — añadir `reactivarVenta` con validación de
   corte abierto y reversión de inventario/caja/propinas/comisiones.
2. `src/app/admin/pos/venta-ticket.tsx` — en `CancelarVentaDialog`, capturar
   estado previo y mostrar toast "Deshacer" que llama a `reactivarVenta`.
3. `src/app/admin/facturacion/actions.ts` — añadir `reemitirComprobante`.
4. `src/app/admin/facturacion/cancelar-form.tsx` — mostrar toast "Deshacer".
5. `src/app/admin/gastos/actions.ts` — añadir `deshacerReversionGasto`.
6. `src/app/admin/gastos/revertir-gasto-form.tsx` — mostrar toast "Deshacer".
7. Pruebas de integración para cada acción inversa (corte cerrado, stock
   insuficiente, etc.).

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] Cancelar venta → toast "Deshacer" 5 s → al pulsar, la venta vuelve a
  activa y el inventario/caja se restauran.
- [ ] Si el corte ya cerró, "Deshacer" muestra error y la venta queda cancelada.
- [ ] Cancelar comprobante → toast "Deshacer" → re-emite el CFDI.
- [ ] Revertir gasto → toast "Deshacer" → el gasto vuelve a activo.
- [ ] `pnpm test` → pruebas nuevas en verde.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm test:smoke   # toca POS, caja, facturación
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 8 (sin contar pruebas) |
| Contexto | ≤ 200k tokens (~20 % del 1M) |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real contradice el "Contexto verificado".
- Hace falta una dependencia, un secreto, una migración destructiva o un deploy.
- La acción inversa requiere datos que no se persisten (p. ej. snapshot del
  corte al momento de cancelar) y habría que añadir columnas.
