# Plan 04 — Columnas útiles en las tablas de administración

**Modelo recomendado:** GPT 6.1 / SWE-2 (mecánico)
**Dolor que resuelve:** "Las columnas de las tablas me hacen falta información."

## Contexto

Las páginas admin listan en `<table>` con columnas mínimas (p. ej. inventario:
SKU, Producto, Tipo, Stock, Mínimo, Estado). Los datos enriquecedores ya están
en la BD o se calculan barato; no hay esquema nuevo salvo se indique.

## Diseño decidido

Crear `src/components/admin/data-table.tsx`: wrapper de tabla con
- `columns[]` declarativas, `hideBelow="sm|md"` para ocultar en móvil,
- columna de acciones sticky a la derecha,
- densidad compacta y texto `text-op-xs` (mínimo 13px del sistema).

Aplicar a las tablas principales con columnas nuevas:

| Página | Columnas a agregar |
|---|---|
| `productos` | Categoría, Costo, **Margen %** (`(precio-costo)/precio`), Stock total org (suma `inventario_stock`), Visible POS, Estado |
| `servicios` | Categoría, Duración, Precio base, Veces vendido (30 días, subquery `detalle_ventas`), Estado |
| `clientes` | Teléfono, Última visita (max `citas.inicio`), Total gastado (suma `ventas`), Citas próximas |
| `inventario` | Valor en stock (`stock*costo`), Ubicación (cuando exista plan 11), En tránsito (compras `por_verificar`, plan 10) |
| `ventas` | Ya tiene lista; añadir Vendedor y nº de artículos |
| `agenda` (vista lista) | Ya completa; solo revisar que use estados de `estados.ts` |

**Consulta:** seguir la regla del proyecto — fusionar con subselects
`jsonb`/escalares en la query principal de la página, no queries paralelas.
Margen y stock total: una sola query extra con `GROUP BY` o subselect por página.

## Pasos

1. `data-table.tsx` con la API de columnas + test visual mínimo.
2. Migrar `productos/page.tsx` y `servicios/page.tsx` primero (mayor dolor).
3. `clientes`, `inventario`, `ventas`.
4. Glosario: encabezados en español de salón (`glosario.ts`), sin "SKU" en la
   etiqueta visible si el público no lo entiende (usar "Clave" o "Código" según
   glosario — verificar qué término usa el proyecto hoy).

## Criterios de aceptación

- Las tablas muestran las columnas nuevas sin N+1.
- En 390px las columnas secundarias se ocultan y la fila sigue legible.
- Sin filas con `—` en masa (la columna se oculta si el dato es raro).

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:usability` (objetivos
táctiles, acción primaria). Si la query nueva afecta navegación: `pnpm test:perf`
en las páginas tocadas.

## Fuera de alcance

Ordenar/filtrar columnas interactivo (puede ser fase posterior si se pide),
gráficas (plan 09).

## Desviaciones (la llena el implementador)

_Vacío. Anotar aquí cualquier diferencia entre el plan y el código real, y `BLOQUEO:` si algo impide continuar._
