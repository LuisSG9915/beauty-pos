# Plan 15 — La Ficha Viva y Recetario Químico (Melena Ritual: Fase 1)

**Modelo recomendado:** SWE-2 MAX  
**Estado:** Hecho  
**Fecha:** 2026-10-08  

## Dolor que resuelve
- Los estilistas no tenían un recetario químico estructurado y anotaban en texto plano o cuadernos.
- No existía vinculación entre las mezclas aplicadas al cliente y el inventario real del salón.
- En la vista móvil "Mi Día", el profesional no tenía acceso para ver la última fórmula del cliente ni para capturar la de la cita actual desde la silla.
- No se distinguía entre foto de "Antes" (estado inicial) y foto de "Después" (resultado peinado).

## Implementación realizada

1. **Esquema de Base de Datos y Migración (`drizzle/0054_reflective_guardsmen.sql`)**:
   - Se agregaron las columnas `insumos: jsonb` y `fotos_detalle: jsonb` a la tabla `clientes_fichas_tecnicas`.
   - Se crearon los tipos `FichaInsumo` y `FichaFotoDetalle` preservando compatibilidad retroactiva completa en `formula` (resumen formateado) y `fotos` (array de llaves R2).

2. **Módulo de Lógica de Fórmulas e Insumos (`src/modules/expedientes/formulas.ts` & `.test.ts`)**:
   - `formatearResumenFormula`: genera la síntesis legible de insumos (ej. *"Igora Royal 7.1 (40 g) [1:1] + Peróxido 20v (40 ml)"*).
   - `obtenerConsumosInventario`: filtra insumos con `descontarStock === true` y `productoId` asignado.
   - Validación robusta con Zod (`fichaInsumoSchema`, `fichaFotoDetalleSchema`).
   - Suite de pruebas unitarias al 100% en verde.

3. **Acciones de Servidor y Descuento de Inventario (`src/app/admin/client-actions.ts`)**:
   - `saveFichaTecnica`: procesa insumos, fotos duales, genera el resumen automático y aplica los consumos de inventario mediante `applyInventoryMovement(db, { tipo: "consumo", ... })` en la sucursal activa o asociada a la cita.
   - `getHistorialFormulasCliente`: consulta las fórmulas previas de un cliente para visualización y replicación rápida.
   - `getCatalogoInsumos`: provee el catálogo de productos activos de la organización para autocompletado en el recetario.

4. **Componentes Visuales y Ergonómicos**:
   - `AntesDespuesFotosField` (`src/components/media-image-field.tsx`): ranuras duales dedicadas para capturar foto "Antes" y "Después", con compresión WebP en cliente y subida directa a R2.
   - `RecetarioEditor` (`src/components/recetario-editor.tsx`): panel interactivo para el estilista con autocompletado de catálogo, steppers de incremento rápido (+10g, +20g, +30g), selector de proporciones (`1:1`, `1:1.5`, `1:2`), presets de tiempo de pose (`20m`, `30m`, `35m`, `45m`), resumen dinámico y banner para "Replicar fórmula anterior" en 1 clic.
   - `FichaForm` (`src/app/admin/clientes/ficha-form.tsx`): integrado para cambiar dinámicamente entre recetario químico guiado (para color/tratamiento) y notas convencionales (para alergias/expediente).
   - `cita-side-panel.tsx` (`src/app/admin/agenda`): sección mejorada para consultar el historial y registrar la fórmula con `sucursalId` resuelta.
   - `mi-dia-board.tsx` (`src/app/admin/mi-dia`): botón táctil de primera clase (≥44px) **"Ficha & Fórmula"** en cada cita asignada al estilista, abriendo el diálogo/modal completo desde el móvil.
   - `clientes/[id]/page.tsx`: renderizado enriquecido de insumos con chips visuales y etiquetas de rol sobre las fotos (Antes / Después).

## Verificación
- `pnpm typecheck`: 0 errores.
- `pnpm lint`: 0 errores, 0 advertencias.
- `pnpm test`: 511 tests pasados (100% de la suite).
- `pnpm db:check`: 100% consistente con la base de datos.
