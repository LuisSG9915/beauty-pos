# 54 — Cobro sencillo: punto de venta simplificado

**Prioridad:** P1 · **Depende de:** 52, 53 · **Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
El cobro es sencillo y fácil de usar: barra de "Buscar o escanear", catálogo de servicios/productos, agregar líneas al ticket, ver total y pulsar un solo botón "Cobrar". La complejidad (medios de pago, propina, productos, cliente) se oculta según las características activas de la organización.

**Fuera de alcance\***
Rediseño del ticket completo (`venta-ticket.tsx`), `CobroForm` estilo Fresha, offline de venta, facturación electrónica, deploy. Se conserva `venta-ticket.tsx` para el flujo completo.

## Contexto verificado\*

- `src/app/admin/pos/page.tsx:35-161` — `PosIndex` y `PosPage`: entrada al POS, `VentaDirectaSubmit` crea una venta y redirige a `/pos?ventaId=...`; `VentaTicket` muestra el ticket completo.
- `src/app/admin/pos/cobro-form.tsx:1-494` — `CobroForm` complejo (propina, pago dividido, billetes): se conserva para el flujo completo.
- `src/app/admin/pos/catalogo-selector.tsx:42-315` — `CatalogoSelector`: buscar/escanear, agregar servicios/productos/paquetes/membresías al ticket vía `agregarServicioVenta`/`agregarProductoVenta`.
- `src/app/admin/pos/actions.ts:411-448` — `agregarServicioVenta`, `agregarProductoVenta`: actions de servidor para agregar líneas.
- `src/app/admin/pos/actions.ts:646-...` — `cobrarVenta`: action de servidor que recibe `organizacionId`, `ventaId`, `pagos` (JSON), `propina`, `idempotencia`, `idempotencyKey`.
- `src/modules/pos/ticket.ts:431-726` — `getTicketData(organizacionId, ventaId)`: carga líneas, catálogos, total de una venta.
- `src/modules/pos/caracteristicas.ts` + `queries.ts` (misión 52) — `CARACTERISTICAS_POS`, `cargarConfiguracionPos`: saber qué características están activas.
- `src/lib/admin-context.ts:238-253` — `getAdminContext`: contexto de organización/sucursal.

## Diseño decidido (si aplica)

- Nueva ruta `/admin/pos/sencillo`: punto de entrada rápido al cobro. Si no hay `ventaId`, crea una venta directa y redirige.
- Componente `CobroSencillo`: barra "Buscar o escanear" + `CatalogoSelector` (servicios; productos solo si `ventas-tienda` activa), lista de líneas, subtotal/total, botón primario "Cobrar" con `data-action-id="pos.cobro.cobrar"` y `data-action-clave="1"`.
- Si `cobro-caja` no está activa: cobro directo con efectivo (form oculto que llama a `cobrarVenta` con un pago de efectivo por el total).
- Si `cobro-caja` está activa: redirige al cobro completo (`/pos?ventaId=...`) con `CobroForm`.
- Si `clientes-marketing` no está activa: no se muestra asignación de cliente.

## Pasos

1. `src/app/admin/pos/sencillo/actions.ts` — `crearVentaSencilla`: crea una venta directa y redirige a `/pos/sencillo?ventaId=...`.
2. `src/app/admin/pos/sencillo/page.tsx` — página server: carga contexto, configuración de características, crea venta si falta, carga ticket (`getTicketData`), renderiza `CobroSencillo`.
3. `src/app/admin/pos/sencillo/cobro-sencillo.tsx` — componente cliente: `CatalogoSelector`, líneas, total, botón Cobrar (cobro directo o redirigir a cobro completo).
4. Ajuste en `src/app/admin/pos/page.tsx` — opcional: ofrecer entrada al cobro sencillo desde `PosIndex`.
5. Prueba nueva para `crearVentaSencilla` y flujo de cobro directo.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm test` → pruebas existentes + nuevas en verde.
- [ ] Recorrido manual: entrar a `/pos/sencillo` → agregar un servicio al ticket → ver total → pulsar "Cobrar" → venta registrada (cobro directo si `cobro-caja` inactiva, o redirige a cobro completo si activa).

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm test:usability  (si toca UI; requiere pnpm dev)
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 8 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- Misiones 52 o 53 no verificadas.
- Hace falta una migración, un secreto o una dependencia nueva.

## Reporte (al terminar)

```
Misión: 54 — Cobro sencillo: punto de venta simplificado
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<ninguna por definir aún>
