# Misión 04 — Adaptación móvil (390 px) del POS: layout, catálogo y ticket

## 1. Metadatos
- **ID:** 04
- **Duración estimada:** 35 minutos
- **Archivos a modificar:** 3 (`src/app/admin/pos/page.tsx`, `src/app/admin/pos/catalogo-selector.tsx`, `src/app/admin/pos/venta-ticket.tsx`)
- **Trazabilidad:** `readme/README.md` §1 Criterio S2/S3 y §4 (POS móvil a 390 px sin controles cortados ni objetivos táctiles < 44 px)
- **Dependencias:** Misión 03

## 2. Objetivo
Eliminar el desborde horizontal, los controles cortados y los botones pequeños (incrementar/decrementar cantidad, eliminar renglón, filtros de categoría) en `/admin/pos` bajo viewport móvil de 390 px en el selector de catálogo y en el ticket de venta.

## 3. Fuera de alcance
- No alterar cálculos de totales, impuestos, descuentos, anticipos, paquetes ni membresías en `src/modules/pos/*`.
- No modificar `src/app/admin/pos/actions.ts`.
- No añadir consultas a la base de datos en `src/app/admin/pos/page.tsx`.

## 4. Contrato de contexto
- **Archivos permitidos para lectura (máximo 4):**
  1. `src/app/admin/pos/page.tsx`
  2. `src/app/admin/pos/catalogo-selector.tsx`
  3. `src/app/admin/pos/venta-ticket.tsx`
  4. `src/lib/glosario.ts`
- **Archivos que NO debes abrir:**
  - `src/app/admin/pos/actions.ts`
  - `src/modules/pos/*`
  - `src/db/*`

## 5. Contexto verificado
- Archivos reales en el árbol del repositorio: `src/app/admin/pos/page.tsx`, `src/app/admin/pos/catalogo-selector.tsx`, `src/app/admin/pos/venta-ticket.tsx`.
- `BLOQUEO:` Antes de editar, ejecuta `nl -ba src/app/admin/pos/page.tsx src/app/admin/pos/catalogo-selector.tsx src/app/admin/pos/venta-ticket.tsx` para comprobar las líneas exactas.

## 6. Diseño decidido
Se elige apilar verticalmente (`grid-cols-1 lg:grid-cols-12 min-w-0`) el catálogo y el ticket en `src/app/admin/pos/page.tsx` para viewports `< 1024px`. En `catalogo-selector.tsx`, las píldoras de filtro de categoría usan `flex-wrap gap-2` (o scroll horizontal contenido con `min-h-11`) y las tarjetas de producto/servicio usan una grilla de 1 columna o 2 columnas compactas con `min-w-0` y botón de agregar de `min-h-11`. En `venta-ticket.tsx`, cada renglón del ticket se muestra como tarjeta apilada en móvil (sin tabla que desborde 390 px) y los botones `-`, `+` y eliminar renglón tienen `min-h-11 min-w-11` (`44x44px`) con `aria-label` explícito ("Disminuir cantidad", "Aumentar cantidad", "Quitar concepto").

## 7. Pasos
1. **Ajustar grilla principal sin desborde en `src/app/admin/pos/page.tsx`:**
   - Archivo: `src/app/admin/pos/page.tsx`
   - Qué cambia: Asegurar que el contenedor raíz de la página y las columnas de catálogo/ticket tengan `min-w-0 max-w-full` y `grid-cols-1 lg:grid-cols-12 gap-4`, evitando anchos mínimos fijos (`min-w-[...]`) que superen `390px`.
   - Verificación inmediata: `pnpm typecheck`
2. **Corregir controles cortados y objetivos táctiles en `src/app/admin/pos/catalogo-selector.tsx`:**
   - Archivo: `src/app/admin/pos/catalogo-selector.tsx`
   - Qué cambia: Hacer que la barra de búsqueda y los filtros de tipo/categoría usen `w-full min-w-0` y botones de filtro con `min-h-11 px-3`; asegurar que cada tarjeta del catálogo tenga `min-w-0`, texto truncado con `truncate` o `line-clamp-2`, y área pulsable `min-h-11`.
   - Verificación inmediata: `pnpm typecheck`
3. **Adaptar renglones y botones `+`/`-`/quitar a 44 px en `src/app/admin/pos/venta-ticket.tsx`:**
   - Archivo: `src/app/admin/pos/venta-ticket.tsx`
   - Qué cambia: Reemplazar cualquier fila horizontal rígida que exceda 390 px por un layout `flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0`; cambiar los botones de cantidad (`-`, `+`) y eliminar a `min-h-11 min-w-11 inline-flex items-center justify-center` con `aria-label` accesible; asociar cada `<select>` de estilista/comisión con su `aria-label` correspondiente.
   - Verificación inmediata: `pnpm typecheck && pnpm lint`

## 8. Criterios de aceptación y verificación
- Comando:
  ```bash
  pnpm typecheck && pnpm lint && pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/pos
  ```
- Salida esperada: En /admin/pos, horizontalOverflow: false (scrollWidth <= 390) en catálogo y ticket.

## 9. Presupuesto y criterios de parada (BLOQUEO:)
- Presupuesto: 3 archivos; 35 minutos.
- Criterios de parada:
  - BLOQUEO: Si cambiar la estructura DOM de venta-ticket.tsx rompe algún selector de scripts/flows-e2e.ts, detente y preserva todos los atributos data-testid, name e id existentes.

## 10. Reporte, desviaciones y bloque de handoff
- Desviaciones permitidas: Ninguna.
- Bloque de handoff (pegar en máximo 10 líneas al terminar):
  - git diff --stat (3 archivos).
  - Salida de pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/pos.
  - Tabla Antes/Después de scrollWidth, controles cortados y touchTargets en /admin/pos.
