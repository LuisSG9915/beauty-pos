# Análisis — Diseño norhud en el punto de venta (POS)

**Fecha:** 2026-11-08 · **Estado:** análisis cerrado, plan por misiones listo
**Fuente del diseño:** documento del usuario (capturas norhud: pantalla POS + modal "Cobrar")
**Alcance de esta entrega:** solo análisis + plan. No se toca código.

---

## 1. Resumen ejecutivo

El POS actual (`/admin/pos`) ya cubre el flujo completo de venta y cobro: catálogo,
ticket con líneas editables, descuentos/promociones/membresías, anticipos, propina,
pago dividido, comprobante imprimible (80 mm) y un modal de confirmación post-cobro
(`ModalConfirmacionCobro`) con WhatsApp/imprimir/copiar/enlace. Lo que **falta**
respecto al diseño norhud y que el usuario pidió explícitamente son dos cosas:

1. **Enviar el ticket como imagen** (PNG/JPG). Hoy WhatsApp solo envía un mensaje de
   texto (en `TicketActionsBar` y en `ModalConfirmacionCobro` el texto es solo un enlace
   a la venta). No existe generación de imagen del comprobante.
2. **Mostrar las acciones del ticket (imprimir / enviar) durante el flujo de cobro**,
   no solo en el estado "Completada". Hoy `TicketActionsBar` solo se renderiza cuando
   `venta.estado === "completada"` (en `venta-ticket.tsx`).

El diseño norhud además describe un **rediseño visual** del modal de cobro (numpad,
pestañas de medios, chips de montos, cambio destacado, botones "Volver"/"Cobrar")
y de la pantalla POS (top bar con logo/selector de negocio/búsqueda/cuenta, sidebar
izquierdo, encabezado de ticket con pestañas, catálogo rápido). Parte de eso ya
existe en variantes (cobro sencillo, modo trabajador); otra parte es app-shell y
toca muchos archivos.

**Recomendación:** no intentar el rediseño completo en una sesión. Partir en
misiones pequeñas (≤ 8 archivos, ≤ 2 h) y empezar por los dos faltantes concretos,
que son los que el usuario enumeró como "Qué falta". El rediseño visual del modal y
de la pantalla se tratan como misiones posteriores, reutilizando los componentes
ya existentes para no romper la usabilidad medida (`pnpm test:usability`).

---

## 2. Inventario del estado actual

### 2.1 Archivos relevantes (verificados)

| Archivo | Rol actual |
|---|---|
| `src/app/admin/pos/venta-ticket.tsx` (~1176 ln) | Pantalla del ticket: izquierda líneas editables, derecha resumen de cobro. Renderiza `CobroForm` si `editable`, o sección "Venta cobrada con éxito" con `TicketActionsBar` si completada. |
| `src/app/admin/pos/cobro-form.tsx` (~494 ln) | Formulario de cobro: propina (chips Sin/10/15/20/Otro), medios de pago (chips), monto recibido con billetes rápidos (50/100/200/500/1000, Exacto, Borrar), cambio/faltante, CTA "Cobrar". Ya implementa casi todo el flujo norhud **excepto el numpad** y el layout exacto. |
| `src/app/admin/pos/printable-ticket.tsx` (~235 ln) | `TicketActionsBar`: botones Imprimir (`window.print()`) y WhatsApp (texto con negocio/folio/conceptos/total). Bloque HTML `hidden print:block` con formato 80 mm. |
| `src/app/admin/pos/page.tsx` | Carga ticket, renderiza `VentaTicket`. |
| `src/components/admin/pos/modal-confirmacion-cobro.tsx` (~261 ln) | Modal post-cobro (estilo norhud): éxito, WhatsApp con selector de país + teléfono + Enviar, acciones rápidas (imprimir, copiar, enlace, ver venta), CTA "Nueva venta". |
| `src/app/admin/pos/cobrado/[ventaId]/...` | Página que monta el modal post-cobro tras cobrar. |

### 2.2 Lo que ya coincide con norhud

- Propina por atajos (Sin/10/15/20/Otro) ✔
- Medios de pago como chips ✔
- Monto recibido + billetes rápidos + Exacto/Borrar ✔
- Cálculo automático de cambio y faltante ✔
- Botón principal "Cobrar $X" destacado ✔
- Panel derecho del ticket con total grande y desglose plegable ✔
- Anticipos en sección propia ✔
- Comprobante imprimible 80 mm ✔
- Modal post-cobro con WhatsApp por teléfono + imprimir + copiar + enlace + nueva venta ✔

### 2.3 Lo que falta (gap)

| # | Gap | Dónde impacta | Esfuerzo |
|---|---|---|---|
| G1 | **Ticket como imagen (PNG/JPG)** para adjuntar/enviar. No existe generación de imagen. | `printable-ticket.tsx`, `modal-confirmacion-cobro.tsx`, `venta-ticket.tsx` | Medio |
| G2 | **Acciones del ticket (imprimir/enviar) durante el flujo de cobro**, no solo post-cobro. | `venta-ticket.tsx` (estado en_proceso) | Bajo |
| G3 | **Numpad numérico** en el modal de cobro (captura norhud tiene teclado 1-9/./0/borrar a la derecha). | `cobro-form.tsx` | Medio |
| G4 | **Layout exacto del modal norhud**: total arriba-izq + propina arriba-der, recibido con "X" para borrar, chips "Exacto/$500/$1,000", cambio destacado, botones "Volver (Esc)"/"Cobrar (Enter)". | `cobro-form.tsx` | Medio-Alto |
| G5 | **Pantalla POS norhud**: top bar (logo, selector de negocio, búsqueda global Ctrl+K, cuenta), sidebar izquierdo con secciones, encabezado de ticket con pestañas "Servicios"/"Citas de hoy", botones Favoritos/calendario/Ventas/Modo trabajador, búsqueda grande con F2 y cámara. | `page.tsx`, layout admin, nuevos componentes | Alto (app-shell) |
| G6 | **Catálogo rápido** que se despliega al buscar (ej. "Corte $200"). | `catalogo-selector.tsx` | Medio |

G1 y G2 son los que el usuario enumeró como "Qué falta". G3–G6 son el rediseño visual.

---

## 3. Análisis técnico de G1 (ticket como imagen)

### 3.1 Restricción: sin dependencias nuevas

`AGENTS.md` prohíbe dependencias nuevas sin aprobación. No hay `html-to-image`, `dom-to-image` ni `canvas` lib en `package.json`. Por tanto la generación debe hacerse con **APIs nativas del navegador**:

- Renderizar el comprobante en un nodo DOM real (no `display:none`, porque entonces no tiene layout y no se puede rasterizar).
- Usar `SVG <foreignObject>` para serializar el nodo → `Image` → `<canvas>` → `toBlob('image/png')`.

El bloque actual `hidden print:block` usa `display:none` en pantalla, por lo que **no se puede capturar directamente**. Hay que añadir un contenedor "visualmente oculto pero renderizado" (p. ej. `position: absolute; left: -9999px; top: 0; width: 80mm`) que contenga el mismo markup del ticket, y capturarlo.

### 3.2 Flujo propuesto

1. Botón "Descargar imagen" / "Compartir" en `TicketActionsBar` (y en el modal post-cobro).
2. Al pulsar: localizar el nodo del ticket renderizado (ref), serializar a SVG, rasterizar a canvas (escala 2x para nitidez), `toBlob`.
3. Si `navigator.share` y `navigator.canShare({ files: [file] })` → `navigator.share({ files: [file], title, text })` (abre el sheet nativo, incluye WhatsApp). Si no, descargar el PNG con `<a download>`.
4. Mostrar toast de éxito/error.

### 3.3 Riesgos

- **Fuentes/CSS**: el ticket usa Tailwind + variables CSS. El SVG `foreignObject` hereda estilos del documento solo si se inyecta el CSS. Solución: clonar el nodo y envolver en un `<svg>` con un `<style>` que incluya las reglas mínimas (o usar `getComputedStyle` por elemento — costoso). Alternativa más robusta: renderizar el ticket con **estilos inline** en el contenedor de captura (no depender de clases Tailwind). Esto implica duplicar el markup con estilos inline.
- **Imágenes externas / CORS**: no hay imágenes en el ticket (solo texto), así que no hay taint.
- **Tamaño**: 80 mm a 2x ≈ 600×900 px, manejable.
- **Compatibilidad**: `navigator.share` con files está soportado en Safari iOS y Chrome Android; en desktop Chrome también (desde v89). Fallback a descarga.

### 3.4 Decisión de diseño recomendada

Crear un componente dedicado `TicketImagen` (o función `generarTicketPng(ref)`) que:
- Renderice el comprobante con **estilos inline** (reutilizando los datos de `PrintableTicketProps`).
- Exponga un ref y un botón "Compartir/Descargar imagen".
- Use la técnica SVG→canvas.

Esto evita tocar el bloque `print:block` existente y mantiene `window.print()` funcionando.

---

## 4. Análisis técnico de G2 (acciones durante el cobro)

Hoy en `venta-ticket.tsx`:
- Si `editable` → renderiza `CobroForm` (sin `TicketActionsBar`).
- Si completada → renderiza sección "Venta cobrada con éxito" con `TicketActionsBar`.

Para mostrar acciones **durante** el flujo de cobro se puede añadir, encima o debajo del `CobroForm`, un bloque compacto con "Imprimir ticket preliminar" y "Enviar por WhatsApp (texto)" usando los datos actuales del ticket. Como el ticket aún no está cobrado, el comprobante impreso debería marcarse como "PRELIMINAR / NO FISCAL" o simplemente mostrar el resumen.

**Alternativa recomendada y menos invasiva:** mantener `CobroForm` como está y añadir, **dentro** del `CobroForm` o justo encima, un enlace "Ver ticket" que abra el comprobante imprimible en una pestaña/preview. Pero el usuario pidió explícitamente "mostrar TicketActionsBar durante el flujo de pago".

**Decisión recomendada:** añadir en la columna derecha, **encima** del `CobroForm`, un `TicketActionsBar` con una variante `preliminar` (prop nueva `preliminar?: boolean` que cambie el texto a "Imprimir preliminar" y deshabilite WhatsApp-imagen hasta cobrar, o permita WhatsApp de texto). Así se reutiliza el componente y no se duplica markup.

Esto toca: `printable-ticket.tsx` (prop `preliminar`) + `venta-ticket.tsx` (renderizar `TicketActionsBar` cuando editable).

---

## 5. Rediseño visual (G3–G6): alcance y riesgo

- **G3/G4 (modal)**: refactor de `cobro-form.tsx`. Riesgo medio: es el componente más complejo del POS y tiene lógica de acumulación de billetes, idempotencia y efectos. Cualquier cambio de layout debe preservar la lógica. Recomendado hacerlo en una misión dedicada con pruebas de interacción.
- **G5/G6 (pantalla POS)**: toca el shell de admin (top bar, sidebar), que es compartido por todas las páginas admin. **No recomendado** mezclar con el POS: es una iniciativa transversal. Si se quiere "diseño muy similar a norhud", conviene crear un layout POS-específico (no el shell global) para no afectar otras pantallas. Esto es una decisión de producto que debe tomar el dueño.

**Decisión de producto (resuelta 2026-11-08):** el rediseño norhud aplica a **toda la app admin** (top bar + sidebar global). Esto convierte la misión 62 en un **proyecto transversal** que debe partirse en varias misiones y toca el shell compartido por todas las pantallas. Riesgo alto: afecta a todas las páginas admin y a `pnpm test:usability`. Recomendación: cerrar primero 58–61; luego una misión dedicada "shell norhud" que solo cambie el layout sin tocar el contenido de las páginas.

---

## 6. Plan de misiones propuesto

Siguiendo `readme/PLANTILLA-PLAN.md`. Numeración continua desde 58 (la 57 está pendiente y no se toca).

### Misión 58 — POS: enviar el ticket como imagen (PNG)

- **Prioridad:** P1 · **Depende de:** — · **Archivos:** ≤ 6
- **Objetivo:** desde el comprobante cobrado (y opcionalmente preliminar), el cajero puede generar un PNG del ticket y compartirlo por WhatsApp (sheet nativo) o descargarlo.
- **Fuera de alcance:** no se añaden dependencias; no se cambia el bloque `print:block`; no se toca el modal post-cobro más allá de añadir el botón (eso va en la 59).
- **Pasos:**
  1. `src/lib/ticket-imagen.ts` (nuevo) — función `renderTicketToPng(element): Promise<Blob>` usando SVG foreignObject → canvas (escala 2x), con estilos inline.
  2. `src/app/admin/pos/printable-ticket.tsx` — añadir contenedor de captura (renderizado, no `display:none`) con el markup del ticket en estilos inline + ref; añadir botón "Compartir imagen" en `TicketActionsBar`.
  3. Integrar `navigator.share({ files })` con fallback a descarga.
  4. Prueba unitaria del helper (mock de canvas) + verificación manual.
- **Criterios de aceptación:**
  - [ ] `pnpm typecheck` → 0
  - [ ] Botón "Compartir imagen" genera un PNG descargable en Chrome desktop.
  - [ ] En móvil (o con `navigator.share` mockeado) se invoca `share` con un `File` de tipo image/png.
  - [ ] `pnpm test:usability` → 0 errores (el contenedor oculto no debe afectar layout).

### Misión 59 — POS: acciones del ticket durante el flujo de cobro

- **Prioridad:** P1 · **Depende de:** 58 (opcional, para la variante imagen) · **Archivos:** ≤ 4
- **Objetivo:** en estado "en proceso", la columna derecha muestra `TicketActionsBar` (imprimir preliminar + enviar por WhatsApp texto) encima del `CobroForm`.
- **Fuera de alcance:** no se cambia la lógica de cobro; no se añade imagen (solo texto, como hoy).
- **Pasos:**
  1. `printable-ticket.tsx` — prop `preliminar?: boolean` que cambia etiquetas a "Imprimir preliminar" y añade badge "Preliminar" en el bloque imprimible.
  2. `venta-ticket.tsx` — renderizar `<TicketActionsBar preliminar .../>` cuando `editable`, encima de `<CobroForm>`.
- **Criterios de aceptación:**
  - [ ] `pnpm typecheck` → 0
  - [ ] En una venta en proceso se ven los botones Imprimir/WhatsApp arriba del formulario de cobro.
  - [ ] Imprimir muestra "PRELIMINAR" en el comprobante.

### Misión 60 — POS: numpad en el modal de cobro (estilo norhud)

- **Prioridad:** P2 · **Depende de:** — · **Archivos:** ≤ 5
- **Objetivo:** añadir teclado numérico (1-9, ., 0, borrar) al `CobroForm` para capturar el monto recibido sin teclado del sistema, manteniendo la entrada por input.
- **Fuera de alcance:** no se reestructura el layout completo; solo se añade el numpad como bloque adicional (visible en móvil, opcional en desktop).
- **Pasos:**
  1. `cobro-form.tsx` — componente `Numpad` interno que actualiza el monto del pago activo.
  2. Integrar con el estado existente (`updatePago`, `acumuloBilletesPorPago`).
  3. Pruebas de interacción (vitest + testing-library si está disponible; hoy no hay @testing-library en deps → verificar).
- **Criterios de aceptación:**
  - [ ] `pnpm typecheck` → 0
  - [ ] Tocar dígitos del numpad actualiza el campo de monto.
  - [ ] `pnpm test:usability` → 0 errores y objetivos táctiles ≥ 24 px.

### Misión 61 — POS: layout del modal de cobro al estilo norhud (G4)

- **Prioridad:** P2 · **Depende de:** 60 · **Archivos:** ≤ 6
- **Objetivo:** reorganizar `CobroForm` al layout norhud: total arriba-izq + propina arriba-der, recibido con X, chips Exacto/$500/$1,000, cambio destacado, botones "Volver (Esc)"/"Cobrar (Enter)".
- **Fuera de alcance:** no se cambia la lógica de pagos/propina/idempotencia.
- **Criterios de aceptación:** igual que 60 + `pnpm test:perf` sin regresión > 10 %.

### Misión 62a (futura) — Shell admin estilo norhud (top bar + sidebar)

- **Prioridad:** P2 · **Depende de:** 61 · **Archivos:** ≤ 8
- **Objetivo:** reemplazar el shell admin actual por top bar (logo, selector de negocio, búsqueda global Ctrl+K, cuenta) + sidebar izquierdo con secciones norhud, sin tocar el contenido de las páginas.
- **Fuera de alcance:** no se cambia el contenido de ninguna página; no se toca el POS aún.
- **Riesgo:** alto (todas las rutas admin). Ejecutar solo tras cerrar 58–61 y con `pnpm test:usability` en verde.

### Misión 62b (futura) — Pantalla POS estilo norhud (G5/G6)

- **Prioridad:** P2 · **Depende de:** 62a · **Archivos:** ≤ 8
- **Objetivo:** encabezado de ticket con pestañas "Servicios"/"Citas de hoy", botones Favoritos/calendario/Ventas/Modo trabajador, búsqueda grande con F2 y cámara, catálogo rápido desplegable.

### Misión 62c (futura) — Adaptación de pantallas admin al shell norhud

- **Prioridad:** P3 · **Depende de:** 62a · **Archivos:** ≤ 8 por misión
- **Objetivo:** revisar cada pantalla admin bajo el nuevo shell (espaciados, títulos, acciones) para que no se rompa el layout. Una misión por bloque de pantallas.

---

## 7. Riesgos y dependencias

- **Imagen (decisión resuelta 2026-11-08):** se usa SVG→canvas nativo (sin dependencias), como ya plantea la misión 58. Si la calidad del PNG resulta insuficiente en Safari iOS, se reabre la decisión de añadir `html-to-image` (requiere aprobación).
- **Usabilidad medida**: cualquier cambio de layout debe pasar `pnpm test:usability` (axe + objetivos ≥ 24 px + acción primaria). El numpad y los chips deben cumplir tamaños táctiles.
- **Rendimiento**: el contenedor de captura (estilos inline) añade HTML a cada render del ticket. Mantenerlo fuera del flujo de datos (no recalcular). Usar `React.memo` si es necesario.
- **Compatibilidad de `navigator.share` con files**: no soportado en todos los navegadores; el fallback a descarga debe ser obligatorio, no opcional.

## 8. Lo que NO se hace en este plan

- No se rediseña el shell admin (top bar global / sidebar) — es transversal.
- No se migra a un layout POS-específico hasta decisión de producto.
- No se añaden dependencias npm.
- No se toca la misión 57 (undo) que está pendiente.

## 9. Siguiente paso recomendado

1. El dueño aprobó la misión 58 con SVG→canvas nativo (sin dependencias). Proceder a ejecutar 58 → 59 → 60 → 61 → 62a → 62b → 62c, una misión por sesión.
2. El dueño decidió el alcance del rediseño visual: **toda la app admin**. La misión 62 se
   parte en: 62a (shell norhud: top bar + sidebar, solo layout), 62b (pantalla POS:
   encabezado de ticket + catálogo rápido), 62c (resto de pantallas adaptadas al nuevo
   shell). Cada una es una misión independiente.
3. Ejecutar las misiones en orden 58 → 59 → 60 → 61, una por sesión, con `/clear` entre ellas.
