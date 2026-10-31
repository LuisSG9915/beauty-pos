# 27 — Tarjetas móviles con semáforo de stock y ocultación de costos por permiso de rol

**Prioridad:** P1 · **Depende de:** — ·
**Tiempo estimado:** 40 min · **Archivos previstos:** 4

**Objetivo\***
En `/admin/productos` y `/admin/inventario`, las tarjetas móviles muestran de
un vistazo **Nombre, Precio y Stock con semáforo de color** (🟢 Disponible,
🟡 Bajo, 🔴 Agotado), mientras que los datos financieros sensibles (`Costo`,
`Margen`, `Valor en stock`, `Valor del inventario` y costos en el panel de
edición `?edit=`) se ocultan desde el servidor para cualquier rol que no tenga
el permiso `reportes.financieros`.

**Fuera de alcance\***
- No romper `<VistaAdaptativa>` (prohibido renderizar tabla y tarjetas al
  mismo tiempo con CSS).
- No agregar consultas SQL adicionales en `productos/page.tsx` ni en
  `inventario/page.tsx` (mantener 1 sola consulta de datos con CTE).
- No modificar esquemas en `src/db/schema/*`.

## Contrato de contexto

- **Archivos permitidos para lectura (máximo 5):**
  1. `src/app/admin/productos/page.tsx`
  2. `src/app/admin/productos/product-form.tsx`
  3. `src/app/admin/productos/actions.ts`
  4. `src/app/admin/inventario/page.tsx`
  5. `src/components/admin/registro-lista.tsx`
- **Archivos que NO debes abrir:** `src/modules/pos/*`, `src/app/admin/agenda/*`, `drizzle/*`.

## Contexto verificado\*

- `src/app/admin/productos/page.tsx:117-178` — El CTE `productos_pagina`
  proyecta `p.costo` y `p.precio_venta`, pero no incluye `p.stock_minimo`,
  necesario para calcular el semáforo de stock en cada producto.
- `src/app/admin/productos/page.tsx:269-360, 466-516` — Muestra `Costo` y
  `Margen` a cualquier usuario con `catalogos.ver` (en escritorio solo los
  oculta por viewport con `hideBelow: "lg"` en `297` y `317`; en móvil los
  imprime siempre en `RegistroCard` en `495-499`). Además, cuando viene
  `?edit=`, empaqueta `costo` y `ultimas_compras` (`191, 203-225, 250,
  258-263`) sin verificar permisos financieros.
- `src/app/admin/productos/product-form.tsx:480, 523-540` — Muestra siempre el
  campo `Costo (MXN)` y la lista `Últimas compras` con costo unitario.
- `src/app/admin/productos/actions.ts:77, 84-86` — En `saveProduct`, al
  actualizar un producto (`if (input.id)`), escribe `costo: input.costo || "0"`
  dentro del `.set(...)`, lo que sobrescribiría el costo con `"0"` si el
  formulario de un usuario sin permiso financiero omite el campo.
- `src/app/admin/inventario/page.tsx:43-47, 260-264, 330-340, 480-504,
  541-562` — Muestra `Valor en stock`, `Valor del inventario`, `Movido en 30
  días` y `Valor por categoría` sin evaluar
  `hasPermission(context.access, "reportes.financieros")`.

## Diseño decidido

1. **Permiso canónico en servidor:**
   - Evaluar
     `const puedeVerFinanzas = hasPermission(context.access, "reportes.financieros");`
     tanto en `src/app/admin/productos/page.tsx` como en
     `src/app/admin/inventario/page.tsx`.
2. **Semáforo de stock con indicador de color y texto accesible:**
   - `stock <= 0` → `<StatusBadge tone="destructive">🔴 Agotado (0)</StatusBadge>`
   - `stock > 0 && stock <= minimo` → `<StatusBadge tone="warning">🟡 Bajo ({formatQuantity(stock)})</StatusBadge>`
   - `stock > minimo` → `<StatusBadge tone="success">🟢 {formatQuantity(stock)} disp.</StatusBadge>`
3. **Tarjetas móviles y compuerta completa en `/admin/productos`:**
   - Agregar `p.stock_minimo::text as "stockMinimo"` al CTE `productos_pagina`
     y al `jsonb_build_object` de `productos/page.tsx` (0 consultas extra).
   - En `RegistroCard` (`productos/page.tsx`), mostrar como `badge` el semáforo
     de stock y en `campos` mostrar primero `Precio` (en negrita `font-bold
     tabular-nums text-primary`), luego `Categoría`, y **solo si
     `puedeVerFinanzas === true`**, `Costo` y `Margen`.
   - En `columns` de `DataTable`, excluir las columnas `costo` y `margen`
     cuando `!puedeVerFinanzas`.
   - En el flujo `?edit=`: si `!puedeVerFinanzas`, fijar `costo: "0"` en
     `editingData`, fijar `ultimasCompras = []`, y pasar
     `puedeVerFinanzas={puedeVerFinanzas}` a `<ProductForm>`.
   - En `ProductForm`, recibir `puedeVerFinanzas = true`: cuando sea `false`,
     no renderizar el `<Field>` de `Costo (MXN)` (`480`) ni el bloque `Últimas
     compras` (`523-540`).
   - En `src/app/admin/productos/actions.ts` (`saveProduct`), verificar
     `const puedeVerFinanzas = hasPermission(access, "reportes.financieros");`.
     Al editar (`if (input.id)`), incluir `costo` en el `.set(...)` únicamente
     cuando `puedeVerFinanzas && input.costo !== undefined`.
4. **Tarjetas móviles y compuerta en `/admin/inventario`:**
   - Actualizar `stockTone` (`líneas 43-47`) para devolver
     `{ label: "🔴 Agotado" | "🟡 Bajo" | "🟢 Disponible", tone }`.
   - En `stockCards` (`240-292`) y `stockColumns` (`303-385`), ocultar la
     fila/columna `Valor en stock` cuando `!puedeVerFinanzas`.
   - En el panel superior (`480-563`), ocultar los `StatCard` de `Valor del
     inventario` y `Movido en 30 días`, así como la tarjeta `Valor por
     categoría`, cuando `!puedeVerFinanzas`.

## Pasos

1. **`src/app/admin/productos/actions.ts`** — Importar `hasPermission` desde
   `@/lib/auth/authorization` y proteger el campo `costo` en `saveProduct`
   para que en ediciones (`input.id`) no se sobrescriba si el usuario no tiene
   `reportes.financieros` o no envió `costo`.
   - Verificación inmediata: `pnpm typecheck`
2. **`src/app/admin/productos/product-form.tsx`** — Añadir prop opcional
   `puedeVerFinanzas?: boolean` (default `true`) y condicionar el renderizado
   del campo `Costo (MXN)` y de `Últimas compras`.
   - Verificación inmediata: `pnpm typecheck`
3. **`src/app/admin/productos/page.tsx`** — Proyectar `stockMinimo` en el CTE
   existente; evaluar `puedeVerFinanzas`; aplicar el semáforo `🔴/🟡/🟢` en
   `RegistroCard` y en la columna `stock`; filtrar `Costo`, `Margen` y los
   datos de `?edit=` según `puedeVerFinanzas`.
   - Verificación inmediata: `pnpm typecheck`
4. **`src/app/admin/inventario/page.tsx`** — Evaluar `puedeVerFinanzas`,
   actualizar `stockTone` con los indicadores `🔴/🟡/🟢`, y ocultar `Valor en
   stock`, `Valor del inventario`, `Movido en 30 días` y `Valor por categoría`
   cuando `!puedeVerFinanzas`.
   - Verificación inmediata: `pnpm typecheck && pnpm lint && pnpm test`

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] `pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/productos` → 0 errores.
- [ ] `pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/inventario` → 0 errores.
- [ ] Un usuario sin `reportes.financieros` no recibe `Costo`, `Margen`,
      `Valor en stock` ni `Últimas compras` ni en el listado ni al abrir
      `?edit=` en `/admin/productos`.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/productos
pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/inventario
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 40 min (una sesión) |
| Archivos tocados | 4 archivos de producción |
| Contexto | ≤ 160k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El CTE de `productos/page.tsx` o `inventario/page.tsx` difiere del "Contexto
  verificado".
- Algún cambio incrementa el número de consultas SQL por encima de 2 por
  página.
- Se intenta duplicar DOM con `hidden md:block` fuera de `<VistaAdaptativa>`.

## Reporte (al terminar)

```
Misión: 27 — Tarjetas móviles con semáforo de stock y ocultación de costos por permiso de rol
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability /admin/productos y /admin/inventario 0 errores
Antes → después: Costos visibles para todo rol con catalogos.ver → Costos/márgenes/valores restringidos en servidor a reportes.financieros + semáforo 🔴/🟡/🟢
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Ninguna.
