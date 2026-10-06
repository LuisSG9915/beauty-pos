# Plan 12 — Qué comprar (reabastecimiento) y "buena compra"

**Modelo:** SWE-2 MAX (fórmulas, casos de prueba y prompt cerrados aquí — **no
cambiar fórmulas ni umbrales sin revisión**)
**Depende de:** 10 para "en camino" (si 10 no está, `enCamino = 0` y nota en UI);
08 para `src/lib/ia/` (la explicación IA es opcional).
**Dolor:** "Reporte para saber qué mercancía comprar para X días con información
de las ventas" + "posible buena compra para poder vender".

## Principio

Los **números** salen de una fórmula determinista y testeada. La IA solo
**redacta** un resumen a partir de esos números, nunca calcula cantidades.

## Fuente de datos (verificada)

`movimientos_inventario` ya registra cada salida real por sucursal:
`applyInventoryMovement` (`modules/inventory/service.ts`) guarda en `cantidad` el
**delta con signo** (`venta` y `consumo` negativos, `devolucion` positivo). Los
insumos de servicios ya se descuentan como `consumo` al cobrar
(`pos/actions.ts`), así que productos e insumos se miden igual.

```
salidasNetas(p, s, W) = greatest(0, − Σ cantidad)
   sobre movimientos con tipo in ('venta','consumo','devolucion')
   de la sucursal s, producto p, created_at ≥ ahora − W días
```
(`entrada`, `salida` manual y `ajuste` NO cuentan como demanda.)

## Fórmulas cerradas (`src/modules/reportes/reabastecimiento.ts`, funciones puras)

Entradas por producto: `stock`, `stockMinimo`, `costo`, `precioVenta`, `tipo`,
`creadoHaceDias`, `salidas30`, `salidas90`, `enCamino`; parámetro `N` (días a
cubrir, 7–60, default 14).

```
dias30 = min(30, max(7, creadoHaceDias))
dias90 = min(90, max(7, creadoHaceDias))
v30 = salidas30 / dias30
v90 = salidas90 / dias90
v   = 0.6·v30 + 0.4·v90                       // unidades por día
tendencia = v90 = 0 ? (v30 > 0 ? "nuevo" : "sin_ventas")
          : v30/v90 > 1.25 ? "subiendo" : v30/v90 < 0.75 ? "bajando" : "estable"
cobertura = v > 0 ? stock / v : null          // días
sugerido  = max(0, ceil(v·N + stockMinimo − stock − enCamino))
prioridad = stock ≤ 0 && v > 0          → "agotado"
          : cobertura !== null && cobertura < 7 → "urgente"
          : cobertura !== null && cobertura < N → "pronto"
          : sugerido > 0                 → "minimo"     // solo por stock mínimo
          : "ok"
costoSugerido = sugerido · costo
```
Redondeo: `ceil` a entero (las unidades del catálogo son piezas en la práctica;
insumos a granel quedan sobre-redondeados a la unidad siguiente — aceptable y
documentado en la UI: "Cantidades redondeadas hacia arriba").

**Buena compra** (solo `tipo in ('producto','ambos')`, `precioVenta > 0`, `v > 0`):
```
margenUnitario = precioVenta − costo
utilidadMensual = v · 30 · margenUnitario
margenPct = margenUnitario / precioVenta
score = utilidadMensual                     // ordenar desc, top 10
```
Excluir si `margenUnitario ≤ 0`. Texto determinista por fila:
`"Se vende ~{round(v·30)} al mes y deja {fmt(margenUnitario)} por pieza (≈ {fmt(utilidadMensual)} al mes)."`

**Capital detenido** (lista aparte, top 10): `salidas90 = 0 && stock > 0`,
ordenar por `stock · costo` desc. Texto: `"Sin ventas en 90 días; tienes {fmt(stock·costo)} detenidos."`

### Casos de prueba obligatorios (`reabastecimiento.test.ts`)

| # | Entradas | Esperado |
|---|---|---|
| 1 | stock 10, min 2, s30 30, s90 60, creado 400 d, enCamino 0, N 14 | v30 = 1, v90 = 0.6667, v = 0.8667, cobertura ≈ 11.54, sugerido **5**, prioridad "pronto", tendencia "subiendo" (1/0.6667 = 1.5) |
| 2 | igual que 1 con enCamino 5 | sugerido **0**, prioridad "pronto" |
| 3 | stock 0, min 0, s30 3, s90 9, creado 400 d, N 14 | v = 0.6·0.1 + 0.4·0.1 = 0.1, sugerido **2** (ceil 1.4), prioridad "agotado" |
| 4 | stock 4, min 5, s30 0, s90 0, N 14 | v = 0, cobertura null, sugerido **1**, prioridad "minimo", tendencia "sin_ventas" |
| 5 | creado 10 d, s30 10, s90 10, stock 20, min 0, N 14 | dias30 = dias90 = 10, v = 1, cobertura 20, sugerido **0**, "ok", tendencia "estable" |
| 6 | creado 3 d, s30 7, s90 7 | dias = 7 (piso), v = 1 |
| 7 | buena compra: precio 250, costo 130, v 0.2667 | margen 120, utilidadMensual ≈ 960 |
| 8 | buena compra con costo ≥ precio | excluido |
| 9 | N fuera de rango (3 o 90) | se acota a 7 / 60 |

## Consulta (una sola, fusionada)

`src/modules/reportes/reabastecimiento-queries.ts` — un `db.execute(sql\`…\`)` por
sucursal que devuelve por producto activo: datos de catálogo, `stock` (left join
`inventario_stock`, null → 0), `salidas30`, `salidas90` con
`sum(...) filter (where created_at >= …)` agrupado desde `movimientos_inventario`
(subconsulta agregada única con `where created_at >= now() − 90 days`), y
`enCamino` = Σ `detalle_compras.cantidad` de compras `borrador|por_verificar`
de esa sucursal con `producto_id` (solo si la tabla existe — si el plan 10 no está
aplicado, omitir la subconsulta). El índice
`movimientos_inventario_sucursal_producto_idx` ya existe; agregar índice
`(sucursal_id, created_at)` si `test:perf` lo pide.

Los cálculos se hacen en TypeScript con las funciones puras (testeables), no en SQL.

## Pantalla `/admin/inventario/reabastecer`

Permiso `inventario.ver`; botón de inventario "Qué comprar" (`data-action-id="inventario.reabastecer.abrir"`).

- Control "Comprar para [7 | 14 | 30 | personalizado] días" (query `?dias=`).
- KPIs: productos agotados, urgentes, costo total sugerido.
- **Tabla "Qué comprar"** (prioridad ≠ ok, orden: agotado, urgente, pronto, minimo;
  luego cobertura asc): producto, stock, vende/día (1 decimal), tendencia (icono),
  días que alcanza, en camino, **sugerido (input editable)**, costo.
  Checkbox por fila + botón primario `data-action-clave="1"`
  **"Crear compra con lo seleccionado"** → crea compra `borrador` (plan 10) sin foto,
  con líneas `origen=manual`, `costoUnitario = productos.costo`, y navega a su detalle.
  (Requiere `compras.editar`; sin plan 10 o sin permiso → botón "Copiar lista" que
  copia texto plano al portapapeles.)
- `BarChart` (de `components/charts.tsx`) "Días que alcanza" para los 15 más urgentes.
- **Pestaña "Buena compra"**: top 10 por utilidad mensual con el texto determinista.
- **Pestaña "Mercancía detenida"**: capital detenido.
- **Resumen IA (opcional)**: tarjeta "Resumen" con botón "Generar resumen" (no
  automático, para no gastar cuota). Oculta si no hay binding `AI`.

## Resumen IA (texto exacto)

Modelo: `@cf/meta/llama-3.1-8b-instruct-fp8` vía `ejecutarTextoJson` (plan 08),
`consumirCuotaIa(…, "texto")`. Caché KV con `kvReadThrough`:
clave `reabasto:v1:{orgId}:{sucursalId}:{N}:{hash8 del JSON de entrada}`, TTL 21600 s.

Entrada: JSON con máx. 10 filas de "Qué comprar" `{nombre, stock, vendePorDia, diasQueAlcanza, sugerido, prioridad, tendencia}`,
máx. 5 de "Buena compra" `{nombre, utilidadMensual, margenPct}` y máx. 5 de
"Detenida" `{nombre, capitalDetenido}`, más `{dias: N, moneda: "MXN"}`.

**system:**
```
Eres un asesor de compras para un salón de belleza en México. Recibes datos ya calculados y escribes un resumen breve, claro y práctico para la recepcionista. Usa solo los números que recibes, sin recalcular ni inventar productos o cantidades. Español de México, sin tecnicismos.
```
**instruccion:**
```
Con estos datos escribe:
- puntos: de 3 a 5 frases cortas (máx. 160 caracteres cada una) que digan qué comprar primero y por qué, qué producto conviene impulsar por su ganancia y qué mercancía está detenida.
Datos: {JSON}
```
**jsonSchema:**
```json
{ "type": "object", "additionalProperties": false, "required": ["puntos"],
  "properties": { "puntos": { "type": "array", "minItems": 1, "maxItems": 5,
    "items": { "type": "string", "maxLength": 200 } } } }
```
Validación extra: descartar cualquier punto que mencione un número que no aparezca
en el JSON de entrada (regex de números; tolerancia de formato `1,234`/`1234`). Si
quedan 0 puntos → "No se pudo generar el resumen."

## Alerta en el tablero (sin cron)

En `src/modules/alertas/queries.ts`, dentro del bloque `inventario.ver`, añadir la
columna escalar `por_agotarse`: productos activos de las sucursales visibles cuyo
`stock_actual` es menor que sus salidas netas de los últimos 7 días (≈ menos de una
semana de cobertura) y `stock_actual > 0`. Alerta
`{ clave: "por_agotarse", titulo: "Productos por agotarse esta semana", href: "/inventario/reabastecer", tono: "advertencia" }`.
Mantener la regla de UNA consulta con subselects escalares.

## Pasos

1. Funciones puras + 9 casos de prueba (escribir los tests primero).
2. Consulta fusionada + página + acciones (crear compra desde selección).
3. Pestañas buena compra / detenida.
4. Resumen IA + caché + validación de números.
5. Alerta `por_agotarse`.

## Criterios de aceptación

- Los 9 casos pasan; los números en pantalla coinciden con las fórmulas.
- "Crear compra con lo seleccionado" genera un borrador correcto en Compras.
- La página corre con una sola consulta a la BD (más la de alertas del shell).
- Sin IA el reporte funciona completo.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:perf --only=inventario`,
`pnpm test:usability` con `pnpm dev`; `pnpm db:check` si se agrega índice.

## Fuera de alcance

Pronóstico estadístico avanzado/estacionalidad, cron de correos, sugerencias en el POS.

## Desviaciones (la llena el implementador)

- **`enCamino` sale de compras `borrador`/`por_verificar`**, como define la
  sección Consulta: el esquema del plan 10 no tiene estado `en_camino`, así que
  se descuenta lo ya capturado pendiente de recibir (la columna se muestra como
  "En camino").
- **La compra se crea literalmente en `borrador`** con las líneas ya
  emparejadas (`origen='manual'`, `costoUnitario = productos.costo`). Para
  recibirla hay que guardar cualquier línea en su detalle (transición
  `borrador → por_verificar` del plan 10); es un paso manual adicional,
  deliberado: obliga a una persona a revisar el borrador.
- **"Crear compra" manda solo `{productoId, cantidad}`**; descripción, costo e
  importe se toman del catálogo en el servidor (el cliente nunca dicta
  precios).
- **Permiso de lectura:** `inventario.ver` (opción permitida por el plan; no
  existe `reportes.ver` en el modelo actual). La creación de la compra exige
  `compras.editar`; sin él se muestra "Copiar lista".
- **Moneda del resumen IA:** se usa `organizaciones.moneda` del negocio (el
  ejemplo del plan decía `"MXN"` fijo).
- **KPIs "agotados"/"urgentes"** cuentan filas de la lista de compra con esa
  prioridad (consistente con la tabla de abajo); "inversión sugerida" suma
  `costoSugerido` de la misma lista.
- **Caché del resumen:** solo se cachean resultados con ≥1 punto fiel; los
  fallos (cuota agotada, IA caída, 0 puntos tras el filtro de números) no se
  cachean, así que el reintento vuelve a llamar al modelo (y consume cuota).
- **Gráfica:** `BarChart` existente, etiquetas de producto recortadas a 12
  caracteres; la fila "minimo" (cobertura `null`) dibuja barra 0 con detalle
  "sin ventas recientes".
- **Verificación en este entorno:** `pnpm typecheck`, `pnpm lint` y
  `pnpm test` corren verdes; `test:perf`, `test:usability` y el recorrido
  manual no pueden ejecutarse aquí (sin `.env`: falta `DATABASE_URL` y
  `BETTER_AUTH_SECRET`, y no hay Chrome para Puppeteer). No se tocó el esquema
  ni se agregaron índices → `pnpm db:check` no aplica (pendiente si
  `test:perf --only=inventario` pide el índice `(sucursal_id, created_at)`).
