---
description: Dirección visual, composición y criterios de aceptación del frontend de Melena
trigger: glob
globs:
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
  - "src/**/*.css"
---

# Frontend de Melena

Esta regla reúne los contratos visuales y de interacción que debe respetar
cualquier cambio de interfaz, y define cómo componer experiencias coherentes
con el producto.

## Resultado esperado

- Melena debe sentirse cálida, clara, cuidada y operativa. La interfaz debe
  transmitir confianza sin parecer técnica, recargada ni infantil.
- En `/admin`, priorizar rapidez, baja carga mental y tareas evidentes. En las
  páginas públicas puede haber más expresión editorial, pero debe conservarse
  la misma marca, paleta y lenguaje.
- La jerarquía debe surgir de tipografía, espacio y contraste. Evitar adornos,
  animaciones, sombras o colores sin una función clara.
- No rediseñar una pantalla ni cambiar su lenguaje visual fuera del alcance
  solicitado. Conservar patrones sanos existentes.

## Fuentes de verdad y reutilización

- Usar los tokens de `src/app/globals.css`; no introducir colores crudos,
  tipografías nuevas ni variantes visuales aisladas cuando exista un token
  semántico. En fondos suaves, usar siempre su color de texto emparejado.
- El texto operativo no debe bajar de `text-op-xs` (13 px). No usar tamaños
  arbitrarios de 9, 10 u 11 px para hacer caber contenido.
- Usar únicamente el vocabulario de `src/lib/glosario.ts`: nunca mostrar UUIDs,
  estados internos ni jerga como “walk-in”, “reagendar”, “slug” o “token”.
- La presentación de citas vive en `src/modules/agenda/estados.ts`; no duplicar
  etiquetas, iconos, tonos o conversiones de estado en los componentes.
- Reutilizar primero `src/components/ui/` y los patrones de
  `src/components/admin/`, especialmente `AdminPageHeader`, `AdminSection`,
  `AdminCard`, `StatCard`, `FormSheet`, `RegistroList` y `RegistroCard`.
- Antes de crear un componente, buscar uno equivalente. Extraer uno nuevo solo
  cuando represente un patrón estable o elimine duplicación real.
- No agregar otra biblioteca visual ni reemplazar primitivas existentes sin una
  necesidad comprobada y autorización explícita.
- Usar los helpers compartidos de formato, estado y navegación; no duplicar
  mapas, `Intl.*` ni reglas de producto dentro de una pantalla.
- Mantener el arranque claro de `/admin` y el cambio de tema sin destellos; toda
  interfaz nueva debe funcionar también en oscuro.

## Jerarquía y composición

- Cada pantalla debe tener un propósito evidente, un `h1` y una acción primaria
  fácil de encontrar. En admin, usar `AdminPageHeader` en vez de inventar otro
  encabezado.
- Marcar una sola acción primaria con `data-action-clave="1"`, mantenerla cerca
  del primer viewport y darle un `data-action-id` semántico.
- Escribir acciones con verbos cotidianos y específicos: “Crear cita”,
  “Guardar cambios”, “Cobrar” o “Reintentar”; evitar “Aceptar” o “Continuar” sin
  contexto.
- Agrupar contenido relacionado en secciones claras. Usar tarjetas solo cuando
  comuniquen una agrupación real y evitar tarjetas anidadas o cromo duplicado.
- Mantener la densidad operativa: suficiente aire para leer y tocar sin
  desperdiciar espacio ni convertir cada dato en una tarjeta.
- Mostrar primero la información necesaria para decidir o actuar; detalles
  secundarios pueden ir después o bajo revelado progresivo.

## Interacción y formularios

- Toda acción debe dar respuesta inmediata: estado pendiente, éxito o error.
  Evitar envíos duplicados y usar los componentes existentes de feedback.
- Los formularios necesitan etiqueta visible, ayuda cuando sea necesaria y un
  error cercano al campo. El placeholder no sustituye la etiqueta.
- Conservar los datos capturados cuando falle una validación o una petición.
  No cerrar paneles ni borrar formularios antes de confirmar éxito.
- Para altas y ediciones de catálogos, conservar el patrón `FormSheet` y la URL
  como estado cuando ya exista en ese módulo.
- Las acciones destructivas deben explicar la consecuencia y pedir confirmación
  con las primitivas de diálogo existentes.
- Ninguna acción necesaria puede depender solo de hover, color o un icono. Los
  botones de solo icono requieren nombre accesible.

## Adaptación, estados y accesibilidad

- Diseñar y revisar primero el flujo móvil de 390 px y después escritorio de
  1366 px. No permitir desborde horizontal ni controles cortados.
- En teléfono, representar registros mediante `RegistroList` y `RegistroCard`
  cuando una tabla deje de ser legible; no reducir texto para hacerla caber.
- Mantener objetivos táctiles de al menos 24 px y aproximar las acciones
  operativas principales a 44 px o más.
- Cubrir carga, vacío, error, éxito, deshabilitado y contenido largo. Reutilizar
  `LoadingState`, `EmptyState`, `ActionFeedback`, toasts y boundaries existentes.
- Los skeletons deben conservar aproximadamente la estructura final y anunciar
  la carga sin producir saltos innecesarios.
- Mantener foco visible, orden lógico de teclado, HTML semántico, contraste
  WCAG 2.2 AA y soporte para `prefers-reduced-motion`.
- Comunicar estados con texto y, cuando ayude, icono; el color nunca debe ser la
  única señal. Verificar tanto tema claro como oscuro.

## Arquitectura y rendimiento

- Mantener componentes de servidor por defecto. Usar `"use client"` solo donde
  hagan falta estado, eventos o APIs del navegador y limitar su frontera.
- No mover al cliente datos que el servidor ya puede resolver ni duplicar
  solicitudes para reconstruir información incluida en la página.
- Evitar trabajo costoso por fila, efectos para estado derivado y formateadores
  creados durante cada render; usar los helpers compartidos.
- Para cambios de navegación, carga o datos, medir con las herramientas del
  proyecto antes de agregar precarga, memoización o caché.

## Criterios de aceptación

- Revisar la pantalla en móvil y escritorio, con teclado y con contenido largo.
- Ejecutar `pnpm typecheck`, `pnpm lint` y `pnpm test`.
- Para rutas admin modificadas, ejecutar `pnpm test:usability` con `pnpm dev`
  corriendo; debe terminar sin errores ni avisos.
- Ejecutar `pnpm test:perf` cuando el cambio afecte navegación, carga o acceso a
  datos, comparando bajo las mismas condiciones.
- No declarar terminada una interfaz con errores de consola, controles cortados,
  texto fuera del glosario o estados esenciales sin resolver.
