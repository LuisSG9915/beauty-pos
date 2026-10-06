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

- **Inventario: solo "Valor en stock"**. "Ubicación" (plan 11) y "En tránsito"
  (compras `por_verificar`, plan 10) no aplican: el esquema no tiene tabla de
  compras ni campo de ubicación en `inventario_stock`. Se añadió Valor
  (`stock × costo`) en tabla y tarjetas móviles.
- **`citas.inicio` → `citas.fecha_hora`**: la columna real se llama
  `fecha_hora`. "Última visita" es `max(fecha_hora)` de citas pasadas no
  canceladas/`no_asistio` (las futuras no cuentan como visita); "Citas
  próximas" cuenta `pendiente|confirmada|en_proceso` con `fecha_hora >= now()`.
- **`detalle_ventas` no existe como tabla única**: hay 4 tablas de líneas.
  "Veces vendido" (servicios) suma `detalle_ventas_servicios.cantidad` de
  ventas `completada` de 30 días; "Artículos" (ventas) suma las 4 tablas
  (servicios + productos + paquetes + membresías) como subselects escalares
  en la misma consulta — sin N+1.
- **"SKU" → "Clave"**: el proyecto ya usa "Clave" en todos los catálogos
  (servicios, categorías, impuestos, medios de pago, membresías, paquetes,
  promociones); solo productos/inventario decían "SKU". Unificado a "Clave" en
  encabezados de tabla, el campo del formulario de producto y los placeholders
  de búsqueda (productos, movimiento de inventario, selector del POS).
  `glosario.ts` documenta `clave` y `vendedor`.
- **`hideBelow` se usa para `lg`/`xl`, no para móvil**: en 390px la tabla ya
  cede a las tarjetas (`RegistroList` + tabla `hidden md:block`), que es el
  patrón vigente; `hideBelow` oculta columnas secundarias entre `md` y
  escritorio amplio (p. ej. Categoría `xl`, Tipo/Costo/Margen `lg`).
- **Clientes: columna Acciones condicionada a `clientes.editar`** — la tabla
  de escritorio mostraba "Editar" sin importar permiso (las tarjetas móviles
  ya lo ocultaban); ahora ambas vistas son consistentes. No se tocó la
  autorización del servidor.
- **`formatQuantity` nuevo en `src/lib/format.ts`** (máx. 3 decimales sin
  ceros de relleno) para "Stock total" de productos; moneda/fechas siguen con
  `formatCurrency`/`formatDate`/`formatTime`/`formatDateTime`.
- **"—" acotado**: Margen muestra "—" solo cuando precio ≤ 0 (división
  indefinida); en tarjetas móviles los campos nuevos solo aparecen cuando hay
  dato (categoría, margen, última visita, total gastado).
- **Agenda vista lista: sin cambios** — ya usa `estadoVistaDeCita`,
  `ESTADO_VISTA_LABEL` y `EstadoVistaBadge` de `src/modules/agenda/estados.ts`
  (`list-view.tsx`). Verificado.
- **Usuarios no estaba en la tabla del plan** — sin columnas nuevas.
- **Verificación parcial**: `pnpm typecheck`/`lint`/`test` en verde;
  `pnpm test:usability`/`test:perf` no corrieron en este entorno (sin `.env`,
  sin Chrome/Puppeteer) — aplican en el entorno del usuario con `pnpm dev`.
