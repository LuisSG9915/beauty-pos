# Análisis — Responsividad del punto de venta (POS)

**Fecha:** 2026-11-08 · **Estado:** análisis cerrado, plan por misiones listo
**Alcance:** solo análisis + plan. No se toca código.

---

## 1. Resumen ejecutivo

El POS actual (`/admin/pos`) usa 3 breakpoints: `sm` (640px), `md` (768px), `xl` (1280px). No se usa `lg` (1024px). El resultado es que en **tablets (768–1280px)** el layout se comporta como móvil (una sola columna, scroll forzado, controles pequeños), desperdiciando espacio horizontal y obligando a más scroll.

Se identificaron **15 problemas de responsividad** organizados en 4 categorías: layout, scroll, touch targets y tipografía. Se proponen **4 misiones** ordenadas por impacto.

---

## 2. Breakpoints del proyecto

| Breakpoint | Ancho | Uso actual en POS |
|---|---|---|
| `sm` | 640px | Padding, max-h scroll, numpad visible, grid 2→3 cols |
| `md` | 768px | Solo `order` (aside antes/quotes ticket) |
| `xl` | 1280px | Grid de 2 columnas, max-h none, grid 2→3→4 cols |
| `lg` | 1024px | **No se usa en el POS** |

**Problema principal:** entre `md` (768px) y `xl` (1280px) no hay transición. Una tablet de 1024px se trata como móvil.

---

## 3. Problemas identificados

### 3.1 Layout

| # | Problema | Ubicación | Impacto |
|---|---|---|---|
| L1 | Grid de 2 columnas solo en `xl` (1280px). Tablets (768–1280px) ven una sola columna, desperdiciando espacio. | `venta-ticket.tsx:635` | Alto |
| L2 | No se usa `lg` (1024px) para transiciones suaves. El salto de `md` a `xl` es abrupto. | Todo el POS | Medio |
| L3 | `CatalogoSelector` grid: `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`. En tablets (md) solo muestra 2-3 columnas. Podría usar `md:grid-cols-3` para mejor aprovechamiento. | `catalogo-selector.tsx` | Medio |
| L4 | `CatalogoSelector` tabs: `flex-1` con `sm:flex-nowrap`. En tablets se envuelven correctamente, pero los tabs son estrechos. | `catalogo-selector.tsx` | Bajo |
| L5 | Input de búsqueda: `sm:max-w-64` (256px). En tablets es estrecho. | `catalogo-selector.tsx` | Bajo |
| L6 | Profesional select: `sm:max-w-52` (208px). En tablets es estrecho. | `venta-ticket.tsx:287` | Bajo |

### 3.2 Scroll

| # | Problema | Ubicación | Impacto |
|---|---|---|---|
| S1 | `sm:max-h-[45vh]` en la sección de líneas se aplica desde 640px. En tablets grandes, corta las líneas innecesariamente. | `venta-ticket.tsx:636` | Alto |
| S2 | `sm:max-h-[60vh]` en el aside se aplica desde 640px. En tablets, corta el resumen si es largo. | `venta-ticket.tsx:830` | Alto |
| S3 | El scroll interno dentro de un contenedor con `max-h` puede ser confuso en tablets (el usuario espera scroll de página, no de sección). | `venta-ticket.tsx` | Medio |
| S4 | `xl:max-h-none xl:overflow-visible` quita el scroll solo en desktop (1280px+). En tablets (768-1280px) el scroll sigue activo. | `venta-ticket.tsx:830` | Medio |

### 3.3 Touch targets

| # | Problema | Ubicación | Impacto |
|---|---|---|---|
| T1 | Botones de cantidad en `TicketLine`: `size-8` (32px) en la nueva versión. Cumple ≥24px pero es ajustado para móvil. El original usaba `size-11` (44px). | `venta-ticket.tsx:228, 236` | Medio |
| T2 | Numpad solo visible en móvil (`sm:hidden`). En tablets táctiles (768-1280px) no hay numpad ni teclado físico. | `cobro-form.tsx:499` | Alto |
| T3 | Botones de billetes rápidos: `min-h-11` (44px) — correcto. | `cobro-form.tsx` | OK |
| T4 | Botones de propina: `min-h-11` (44px) — correcto. | `cobro-form.tsx` | OK |
| T5 | Botones de medios de pago: `min-h-11` (44px) — correcto. | `cobro-form.tsx` | OK |
| T6 | `TicketLine` quitar: `size-9` (36px) — cumple ≥24px pero es ajustado. | `venta-ticket.tsx:219` | Bajo |

### 3.4 Tipografía y espaciado

| # | Problema | Ubicación | Impacto |
|---|---|---|---|
| P1 | Total: `text-2xl sm:text-3xl`. En tablets podría ser `text-3xl` directamente. | `venta-ticket.tsx:848` | Bajo |
| P2 | Padding de secciones: `p-4 sm:p-6` en desktop es `p-6`, pero en tablets (768-1280px) sigue siendo `p-4` (porque `sm` es 640px). Debería ser `md:p-6`. | `venta-ticket.tsx:636, 829` | Medio |
| P3 | Gap del grid: `gap-6` en todos los tamaños. En móvil podría ser `gap-4` para ahorrar espacio. | `venta-ticket.tsx:635` | Bajo |
| P4 | `CatalogoSelector` card padding: `p-2.5` en móvil, podría ser mayor en tablets. | `catalogo-selector.tsx` | Bajo |

### 3.5 Otros

| # | Problema | Ubicación | Impacto |
|---|---|---|---|
| O1 | Modal de cobro: `max-w-md` (448px). En tablets es estrecho. Podría ser `max-w-lg` en `md`. | `venta-ticket.tsx:997` | Medio |
| O2 | Dialog de cobro: `p-0 sm:p-6`. En tablets sigue con `p-0` si no se alcanza `sm`... pero `sm` es 640px, así que en tablets (768px+) ya tiene `p-6`. OK. | `venta-ticket.tsx:997` | OK |
| O3 | `CatalogoSelector` grid: `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`. En tablets (md-lg) solo 3 columnas. Podría usar `md:grid-cols-3 lg:grid-cols-4`. | `catalogo-selector.tsx` | Medio |
| O4 | `TicketLine` en no-editable: `flex items-center gap-2` sin wrap. En móvil estrecho puede desbordar. | `venta-ticket.tsx:270` | Bajo |
| O5 | Botones del header del POS ("Nueva venta rápida", "Ver historial"): se cortan en móvil. Error preexistente. | `page.tsx:229, 260` | Alto |

---

## 4. Plan de misiones propuesto

### Misión 66 — Grid responsivo (2 columnas desde md)

- **Prioridad:** P1 · **Depende de:** 64 · **Archivos:** ≤ 2
- **Objetivo:** En tablets (768px+) el POS muestra 2 columnas (ticket + resumen) en lugar de 1, aprovechando el espacio horizontal. Ajustar scroll para que solo se active en móvil.
- **Cambios:**
  1. `venta-ticket.tsx`: grid `md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]` en lugar de `xl:grid-cols-[...]`.
  2. `venta-ticket.tsx`: `sm:max-h-[45vh]` → `md:max-h-[45vh]` (scroll solo en móvil, no en tablets).
  3. `venta-ticket.tsx`: `sm:max-h-[60vh]` → `md:max-h-[60vh]`.
  4. `venta-ticket.tsx`: `xl:max-h-none xl:overflow-visible` → `md:max-h-none md:overflow-visible` (quitar scroll en tablets+).
  5. `venta-ticket.tsx`: padding `p-4 sm:p-6` → `p-4 md:p-6` en secciones.
  6. `venta-ticket.tsx`: gap `gap-6` → `gap-4 md:gap-6`.

### Misión 67 — Touch targets y numpad en tablets

- **Prioridad:** P1 · **Depende de:** 66 · **Archivos:** ≤ 2
- **Objetivo:** En tablets táctiles, el numpad es visible y los controles de cantidad tienen tamaño adecuado (≥32px).
- **Cambios:**
  1. `cobro-form.tsx`: numpad `sm:hidden` → `md:hidden` (visible en tablets).
  2. `venta-ticket.tsx`: botones de cantidad `size-8` (32px) → `size-9` (36px) en móvil, `size-10` (40px) en sm+.
  3. `venta-ticket.tsx`: quitar `size-9` (36px) → `size-10` (40px) para el botón quitar.

### Misión 68 — CatalogoSelector responsivo

- **Prioridad:** P2 · **Depende de:** 66 · **Archivos:** ≤ 1
- **Objetivo:** Mejor aprovechamiento del espacio en tablets: grid de productos 3-4 columnas, input de búsqueda más ancho, tabs más espaciados.
- **Cambios:**
  1. `catalogo-selector.tsx`: grid `grid-cols-2 sm:grid-cols-3 xl:grid-cols-4` → `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
  2. `catalogo-selector.tsx`: input `sm:max-w-64` → `md:max-w-72`.
  3. `catalogo-selector.tsx`: tabs `sm:px-4` → `md:px-5`.

### Misión 69 — Modal de cobro responsivo

- **Prioridad:** P2 · **Depende de:** 66 · **Archivos:** ≤ 1
- **Objetivo:** El modal de cobro se adapta a tablets: más ancho, mejor espaciado.
- **Cambios:**
  1. `venta-ticket.tsx`: `max-w-md` → `max-w-md md:max-w-lg` en el Dialog.
  2. `cobro-form.tsx`: `p-5 shadow-sm sm:p-6` → `p-5 md:p-7`.

### Misión 70 (futura) — Header del POS responsivo (O5)

- **Prioridad:** P2 · **Depende de:** 66 · **Archivos:** ≤ 2
- **Objetivo:** Los botones "Nueva venta rápida" y "Ver historial" no se cortan en móvil. Usar menú desplegable o wrap.
- **Nota:** Este es un problema preexistente en `page.tsx` (PosIndex). No se incluye en las misiones 66-69 porque toca un archivo diferente.

---

## 5. Orden de ejecución recomendado

```
66 → 67 → 68 → 69
```

Cada misión es independiente excepto las dependencias indicadas. Se pueden ejecutar en sesiones separadas con `/clear` entre ellas.

## 6. Lo que NO se hace

- No se cambia el shell admin (top bar / sidebar) — es transversal.
- No se migran a un layout POS-específico.
- No se añaden dependencias npm.
- No se toca el modal post-cobro (`ModalConfirmacionCobro`).
