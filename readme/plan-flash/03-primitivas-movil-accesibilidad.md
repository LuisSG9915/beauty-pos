# Misión 03 — Objetivos táctiles (>= 44 px) y corrección axe en primitivas compartidas

## 1. Metadatos
- **ID:** 03
- **Duración estimada:** 35 minutos
- **Archivos a modificar:** 4 (`src/components/ui/button.tsx`, `src/components/admin/admin-shell.tsx`, `src/components/admin/admin-nav-tabs.tsx`, `src/components/admin/page-header.tsx`)
- **Trazabilidad:** `readme/README.md` §1 Criterio S3 y §4 (Objetivos táctiles >= 44 px, cero cortes a 390 px, 0 violaciones axe críticas/serias)
- **Dependencias:** Misión 00

## 2. Objetivo
Corregir en la raíz los objetivos táctiles de 18–20 px, los desbordes de cabecera en 390 px y las violaciones `axe` (botones icónicos sin `aria-label`, contraste y landmarks) en los 4 componentes base que envuelven todas las pantallas de `/admin`.

## 3. Fuera de alcance
- No rediseñar la paleta de colores en `src/app/globals.css`.
- No crear nuevos componentes de navegación.
- No tocar pantallas específicas de módulos todavía (se abordan en misiones 04–09).

## 4. Contrato de contexto
- **Archivos permitidos para lectura (máximo 4):**
  1. `src/components/ui/button.tsx`
  2. `src/components/admin/admin-shell.tsx`
  3. `src/components/admin/admin-nav-tabs.tsx`
  4. `src/components/admin/page-header.tsx`
- **Archivos que NO debes abrir:**
  - `src/app/admin/agenda/*`
  - `src/app/admin/plano/*`
  - `src/db/*`

## 5. Contexto verificado
- Archivos reales en el árbol del repositorio: `src/components/ui/button.tsx`, `src/components/admin/admin-shell.tsx`, `src/components/admin/admin-nav-tabs.tsx`, `src/components/admin/page-header.tsx`.
- `BLOQUEO:` Antes de editar, ejecuta `nl -ba src/components/ui/button.tsx src/components/admin/admin-shell.tsx src/components/admin/admin-nav-tabs.tsx src/components/admin/page-header.tsx` para verificar las líneas exactas.

## 6. Diseño decidido
Se elige aplicar pisos táctiles responsivos mediante clases Tailwind en `button.tsx` (`min-h-11` = 44 px en todos los tamaños interactivos en móvil, e `icon` con `min-h-11 min-w-11`), envolver las acciones de `page-header.tsx` con `flex-wrap gap-2 w-full sm:w-auto` para evitar cortes horizontales a 390 px, y asegurar en `admin-shell.tsx` y `admin-nav-tabs.tsx` que ningún contenedor supere `max-w-full overflow-x-hidden` y que todo botón de solo icono tenga `aria-label` explícito en español usando el vocabulario de `src/lib/glosario.ts`.

## 7. Pasos
1. **Asegurar objetivo táctil >= 44 px en `src/components/ui/button.tsx`:**
   - Archivo: `src/components/ui/button.tsx`
   - Qué cambia: Ajustar las variantes de tamaño (`default`, `sm`, `xs`, `icon`) para que en viewport móvil (`max-sm:` o base) tengan como mínimo `min-h-11` (`44px`) y que la variante `icon` tenga `min-h-11 min-w-11` (`44x44px`), eliminando alturas fijas de 18–28 px en móvil.
   - Verificación inmediata: `pnpm typecheck`
2. **Eliminar desborde horizontal y botones de 18–20 px en `src/components/admin/admin-shell.tsx`:**
   - Archivo: `src/components/admin/admin-shell.tsx`
   - Qué cambia: Asegurar `min-w-0 max-w-full overflow-x-hidden` en el contenedor `<main>` de contenido, `min-h-11 min-w-11` en los disparadores del menú móvil / selector de sucursal / selector de tema, y añadir `aria-label` descriptivo a cada control icónico que carezca de texto visible.
   - Verificación inmediata: `pnpm typecheck`
3. **Ajustar pestañas de navegación en `src/components/admin/admin-nav-tabs.tsx`:**
   - Archivo: `src/components/admin/admin-nav-tabs.tsx`
   - Qué cambia: Añadir `overflow-x-auto max-w-full no-scrollbar` al contenedor de pestañas y `min-h-11 shrink-0 px-3 inline-flex items-center` a cada enlace/pestaña para evitar que estiren el ancho del documento más allá de 390 px y cumplan el alto táctil de 44 px.
   - Verificación inmediata: `pnpm typecheck`
4. **Evitar controles cortados en `src/components/admin/page-header.tsx`:**
   - Archivo: `src/components/admin/page-header.tsx`
   - Qué cambia: Cambiar el contenedor principal a `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0` y el contenedor de acciones a `flex flex-wrap items-center gap-2 w-full sm:w-auto` para que los botones de acción primaria nunca se corten a la derecha en 390 px.
   - Verificación inmediata: `pnpm typecheck && pnpm lint && pnpm test src/components --run`

## 8. Criterios de aceptación y verificación
- Comando:
  ```bash
  pnpm typecheck && pnpm lint && pnpm test src/components --run
  ```
- Salida esperada: 0 errores de compilación/lint y todas las pruebas de src/components/admin-nav.test.ts y src/components/admin/data-table.test.tsx en verde.

## 9. Presupuesto y criterios de parada (BLOQUEO:)
- Presupuesto: 4 archivos; 35 minutos.
- Criterios de parada:
  - BLOQUEO: Si src/components/admin-nav.test.ts falla por cambios en etiquetas o estructura de enlaces, detente; conserva los textos exactos esperados por la prueba.

## 10. Reporte, desviaciones y bloque de handoff
- Desviaciones permitidas: Ninguna.
- Bloque de handoff (pegar en máximo 10 líneas al terminar):
  - git diff --stat (los 4 archivos).
  - Salida de pnpm typecheck && pnpm lint && pnpm test src/components --run.
  - Conteo Antes/Después de objetivos táctiles < 44px detectados en la cabecera y navegación móvil.
