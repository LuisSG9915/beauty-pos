# Misión 06 — Clientes en móvil (390 px) con `VistaAdaptativa` y 0 violaciones axe

## 1. Metadatos
- **ID:** 06
- **Duración estimada:** 35 minutos
- **Archivos a modificar:** 3 (`src/app/admin/clientes/page.tsx`, `src/app/admin/clientes/[id]/page.tsx`, `src/app/admin/clientes/client-sheet.tsx`)
- **Trazabilidad:** `readme/README.md` §1 Criterio S3 y §4 (Un solo layout por viewport con `VistaAdaptativa`, 0 tablas de 644–760 px en móvil)
- **Dependencias:** Misión 03

## 2. Objetivo
Eliminar la tabla desbordada (644–760 px) y los controles cortados en `/admin/clientes` y `/admin/clientes/[id]` en viewport móvil de 390 px utilizando `VistaAdaptativa` y `RegistroLista`, asegurando objetivos táctiles >= 44 px y 0 violaciones `axe`.

## 3. Fuera de alcance
- No modificar acciones de servidor en `src/app/admin/client-actions.ts`.
- No modificar la ruta de exportación CSV `src/app/admin/clientes/export/route.ts`.
- No superar el límite de `<= 2` consultas SQL por página.

## 4. Contrato de contexto
- **Archivos permitidos para lectura (máximo 4):**
  1. `src/app/admin/clientes/page.tsx`
  2. `src/app/admin/clientes/[id]/page.tsx`
  3. `src/app/admin/clientes/client-sheet.tsx`
  4. `src/components/admin/vista-adaptativa.tsx`
- **Archivos que NO debes abrir:**
  - `src/app/admin/client-actions.ts`
  - `src/modules/expedientes/*`
  - `src/db/*`

## 5. Contexto verificado
- Archivos reales en el árbol del repositorio: `src/app/admin/clientes/page.tsx`, `src/app/admin/clientes/[id]/page.tsx`, `src/app/admin/clientes/client-sheet.tsx`, `src/components/admin/vista-adaptativa.tsx`.
- `BLOQUEO:` Antes de editar, ejecuta `nl -ba src/app/admin/clientes/page.tsx src/app/admin/clientes/\[id\]/page.tsx src/app/admin/clientes/client-sheet.tsx src/components/admin/vista-adaptativa.tsx` para comprobar las líneas exactas y las props de `VistaAdaptativa`.

## 6. Diseño decidido
Se elige respetar la regla no negociable de `AGENTS.md`: un solo layout por viewport mediante `VistaAdaptativa` (nunca ocultar/mostrar con `hidden md:block` dos árboles DOM simultáneos). En `src/app/admin/clientes/page.tsx`, el listado de clientes se envuelve en `VistaAdaptativa`: en escritorio renderiza la tabla actual y en móvil renderiza `RegistroLista` con tarjetas compactas que muestran nombre, teléfono, última visita/etiqueta de retención y enlace/acción con `min-h-11`. Los controles de búsqueda y botones de importar/exportar/nuevo cliente se agrupan con `flex-wrap gap-2 w-full`.

## 7. Pasos
1. **Implementar `VistaAdaptativa` y barra de herramientas responsiva en `src/app/admin/clientes/page.tsx`:**
   - Archivo: `src/app/admin/clientes/page.tsx`
   - Qué cambia: Envolver la barra de búsqueda y acciones de cabecera en `flex flex-col sm:flex-row flex-wrap gap-2 w-full min-w-0`; reemplazar el renderizado directo de la tabla de clientes por `VistaAdaptativa` pasando la vista móvil basada en `RegistroLista` (sin superar 390 px de ancho) y la vista de escritorio con la tabla existente; añadir `aria-label` al input de búsqueda si no tiene `<label>` visible.
   - Verificación inmediata: `pnpm typecheck`
2. **Asegurar contenedor móvil y objetivos táctiles en `src/app/admin/clientes/client-sheet.tsx`:**
   - Archivo: `src/app/admin/clientes/client-sheet.tsx`
   - Qué cambia: Ajustar el disparador y el contenido del sheet para usar `w-full max-w-full sm:max-w-lg` y botones de acción con `min-h-11`.
   - Verificación inmediata: `pnpm typecheck`
3. **Corregir cortes horizontales en `src/app/admin/clientes/[id]/page.tsx`:**
   - Archivo: `src/app/admin/clientes/[id]/page.tsx`
   - Qué cambia: Hacer que las grillas de expediente, historial de citas/ventas y fórmulas usen `grid-cols-1 md:grid-cols-2 min-w-0` y que cualquier listado tabular interno utilice `VistaAdaptativa` o tarjetas apiladas en móvil con controles de `min-h-11`.
   - Verificación inmediata: `pnpm typecheck && pnpm lint`

## 8. Criterios de aceptación y verificación
- Comando 1:
  ```bash
  pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/clientes
  ```
- Salida esperada: 0 cortes, scrollWidth <= 390 y 0 objetivos táctiles < 44px en /admin/clientes.
- Comando 2:
  ```bash
  pnpm tsx scripts/axe-detail.ts --only=/admin/clientes
  ```
- Salida esperada: 0 violaciones axe en /admin/clientes.

## 9. Presupuesto y criterios de parada (BLOQUEO:)
- Presupuesto: 3 archivos; 35 minutos; <= 2 consultas SQL por página.
- Criterios de parada:
  - BLOQUEO: Si se intenta usar CSS hidden md:block / md:hidden duplicando tabla y lista en el DOM al mismo tiempo, detente; está prohibido por la regla de VistaAdaptativa.

## 10. Reporte, desviaciones y bloque de handoff
- Desviaciones permitidas: Ninguna.
- Bloque de handoff (pegar en máximo 10 líneas al terminar):
  - git diff --stat (3 archivos).
  - Salida de pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/clientes.
  - Salida de pnpm tsx scripts/axe-detail.ts --only=/admin/clientes.
  - Tabla Antes/Después de ancho de tabla/vista, objetivos táctiles y violaciones axe en /admin/clientes.
