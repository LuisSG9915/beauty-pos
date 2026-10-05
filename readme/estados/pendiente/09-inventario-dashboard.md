# Plan 09 — Dashboard de inventario con gráficas

**Modelo recomendado:** SWE-2 MAX
**Dolor que resuelve:** "Un apartado de inventario donde se vea el stock de cada
producto, tal vez en gráfico de barras o de pastel."

## Contexto verificado

- `inventario_stock` (stock por sucursal×producto) y `movimientos_inventario`
  (entrada/salida/ajuste, `stock_resultante`, ligado a `venta_id`) en
  `operations.ts`.
- `inventario/page.tsx`: tabla de existencias + movimientos + formulario de
  movimiento. Sin gráficas ni vista multi-sucursal.
- `src/components/charts.tsx` ya tiene `BarChart` SVG propio, server-safe y sin
  dependencias → **extenderlo**, no meter librería.

## Diseño decidido

### Panel de inventario (secciones nuevas arriba de la tabla actual)

1. **KPIs**: valor total del inventario (Σ stock×costo), productos bajo mínimo,
   productos sin stock, valor en movimiento últimos 30 días.
2. **Barras horizontales "Stock vs mínimo"**: top N productos con barra de stock
   y marca del mínimo; color por estado (ok / bajo / sin stock). Agregar
   `HBarChart` a `charts.tsx`.
3. **Pastel "Valor por categoría"**: `PieChart`/donut SVG propio con leyenda;
   valor = stock×costo agrupado por `categoriaId`.
4. **Filtro de sucursal**: "Esta sucursal / Todas" — la vista "Todas" agrupa por
   producto y permite expandir por sucursal.
5. Enlace "Ver en el mapa" por producto cuando exista plan 11 (dejar el punto de
   anclaje).

### Consultas

Una query fusionada por sección o un solo `db.execute` con subselects `jsonb`
(regla del proyecto). Cálculos de valor en SQL (`stock_actual * costo`), no en JS
fila a fila.

## Pasos

1. `charts.tsx`: `HBarChart` (etiqueta izquierda, barra, marca de mínimo) y
   `DonutChart` con leyenda; ambos con `role="img"` + `<title>` por segmento.
2. `inventario/queries.ts` (o donde viva la carga actual): query fusionada con
   KPIs + top stock vs mínimo + valor por categoría, con filtro sucursal.
3. `inventario/page.tsx`: secciones nuevas arriba; tabla existente intacta.
4. Estados vacíos con `EmptyState` ("Sin movimientos en el período").

## Criterios de aceptación

- El panel muestra las 3 gráficas/KPIs sin queries extra por fila.
- Vista "Todas las sucursales" agrupa correctamente.
- 0 dependencias nuevas de gráficas en `package.json`.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:usability`,
`pnpm test:perf` en `/admin/inventario` (query nueva).

## Fuera de alcance

Reabastecimiento predictivo (plan 12), ubicaciones en mapa (plan 11), alertas
automáticas de stock bajo (van con Cron en 12).

## Desviaciones (la llena el implementador)

_Vacío. Anotar aquí cualquier diferencia entre el plan y el código real, y `BLOQUEO:` si algo impide continuar._
