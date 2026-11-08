# 54 — Cobro sencillo: punto de venta simplificado

**Prioridad:** P1 · **Depende de:** 52, 53 · **Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
El cobro es sencillo y fácil de usar: buscar o escanear un servicio/producto, agregar líneas al ticket, ver el total y pulsar un solo botón "Cobrar". La complejidad (anticipos, paquetes, membresías, comisiones, descuentos, facturación) se oculta cuando las características correspondientes no están activas.

**Fuera de alcance\***
Offline de venta (`/offline/venta`), facturación electrónica (CFDI), look and feel general (misión 55), deploy.

## Contexto verificado\*

- `src/app/admin/pos/venta-ticket.tsx:1-120` — ticket actual con anticipos, paquetes, membresías, promociones, comisiones, devoluciones: la complejidad a simplificar/ocultar.
- `src/app/admin/pos/cobro-form.tsx:1-60` — formulario de cobro estilo "Fresha" (propina, pago dividido, faltante/cambio): referencia del flujo de pago.
- `src/app/admin/pos/actions.ts` — `crearVentaDirecta`, `cobrarVenta` y mutaciones de líneas: capa de escritura del cobro.
- `src/modules/pos/caracteristicas.ts` (misión 52) — qué características están activas para la organización (decide qué se muestra).

## Diseño decidido (si aplica)

- Vista de cobro simplificada: barra de búsqueda "Buscar o escanear", catálogo de servicios/productos activos, lista de líneas del ticket, subtotal y total, botón primario "Cobrar".
- Si `cobro-caja` no está activa, ocultar medios de pago complejos y mostrar un cobro directo.
- Si `ventas-tienda` no está activa, ocultar productos; si `clientes-marketing` no está activa, ocultar asignación de cliente.
- Botón primario con `data-action-id="pos.cobro.cobrar"` y `data-action-clave="1"`.
- Conservar `venta-ticket.tsx` para el flujo completo cuando se necesite; la vista sencilla es un punto de entrada rápido.

## Pasos

1. `src/app/admin/pos/cobro-sencillo.tsx` (o página) — vista simplificada: buscar/escanehar, agregar líneas, total, botón Cobrar.
2. Ajuste en `src/app/admin/pos/page.tsx` — ofrecer la entrada al cobro sencillo cuando las características lo permitan.
3. Lógica de condicional de visibilidad por característica (caja, productos, cliente) usando `cargarConfiguracionPos`.
4. Pruebas nuevas para el cobro sencillo (agregar línea, calcular total, condiciones de visibilidad).

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm test` → pruebas existentes + nuevas en verde.
- [ ] Recorrido manual: buscar un servicio → agregarlo al ticket → ver total actualizado → pulsar "Cobrar" → venta registrada.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm test:usability  (si toca UI; requiere pnpm dev)
# pnpm test:smoke      (si toca cobro)
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 8 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- Misiones 52 o 53 no verificadas (falta la configuración de características).
- Hace falta una migración, un secreto o una dependencia nueva.

## Reporte (al terminar)

```
Misión: 54 — Cobro sencillo: punto de venta simplificado
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | test:smoke ✔
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<ninguna por definir aún>
