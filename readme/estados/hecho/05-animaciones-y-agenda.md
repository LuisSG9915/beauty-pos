# Plan 05 — Animaciones y agenda usable

**Modelo:** SWE-2 MAX (diseño cerrado; no requiere Opus)
**Dolor:** "No hay animaciones; a veces usar la agenda está complicado y aburrido."

## Lo que YA existe (verificado — no reimplementar)

| Ya existe | Dónde |
|---|---|
| Arrastrar cita a otra hora/profesional (HTML5 DnD, snap 15 min) | `agenda-board.tsx` `dropEnColumna` → `moveCita` |
| Clic en hueco → "Nueva cita" con hora y profesional precargados | `agenda-board.tsx` `clickEnHueco` |
| Línea de hora actual con etiqueta | `day-grid.tsx` (`minutoActual`) |
| Color por profesional (`categoryTone`) y por estado (`estados.ts`) | `day-grid.tsx`, `cita-card.tsx` |
| Diálogo "Mover cita" con horarios sugeridos en conflicto | `move-cita-dialog.tsx` |
| Bloqueo optimista por `version` + `CITA_STALE_MESSAGE` | `actions.ts` `moverCitaEnTx` |
| Sheets/diálogos animados (`data-starting-style`/`data-ending-style`) | `components/ui/sheet.tsx`, `dialog.tsx` |
| `prefers-reduced-motion` global | `globals.css` final |
| `tw-animate-css` importado (sin uso) | `globals.css:2` |

## Problemas reales detectados

1. **Arrastrar no funciona en táctil.** HTML5 DnD no dispara en iOS/Android: en
   tablet/celular (lo normal en recepción) solo se puede mover con el diálogo.
2. **Mover se siente lento.** La tarjeta queda en su lugar (`opacity-50`) hasta que
   el server responde y `revalidatePath` refresca; no hay vista previa de destino
   durante el arrastre (no se ve a qué hora caerá).
3. **No se puede cambiar la duración arrastrando**; hay que abrir el formulario.
4. **Sin deshacer** tras mover por error.
5. **Cero animación en tarjetas/listas/páginas**: aparecen de golpe.
6. **Fecha solo por `<input type=date>` nativo**; sin tira de días para saltar rápido.

## Diseño cerrado

### A. Tokens y utilidades de animación (`globals.css`)

```css
@theme inline {
  --ease-salida: cubic-bezier(0.22, 1, 0.36, 1);
  --duracion-rapida: 120ms;
  --duracion-media: 200ms;
}
@keyframes entrada-suave { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes pulso-exito { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary) 45%, transparent); } 100% { box-shadow: 0 0 0 10px transparent; } }
.anim-entrada { animation: entrada-suave var(--duracion-media) var(--ease-salida) both; }
.anim-pulso { animation: pulso-exito 600ms var(--ease-salida) 1; }
```

Stagger: `style={{ animationDelay: \`${Math.min(i, 8) * 30}ms\` }}` (tope 8 para no
retrasar listas largas). El bloque `prefers-reduced-motion` existente ya lo neutraliza.

**Dónde aplicar `anim-entrada`:** tarjetas de cita (`CitaCard`), filas de
`list-view.tsx`, tarjetas de `resumen-dia.tsx`, `AdminCard` (prop opcional
`animate`), filas de tablas admin (via `DataTable` del plan 04 si ya existe; si no,
solo en productos/servicios/clientes/inventario), `EmptyState`.
**`anim-pulso`:** en la tarjeta recién creada/movida (ver C.3).
**Transiciones hover/press** en botones: `active:scale-[0.98] transition-transform`
en la variante base de `components/ui/button.tsx`.

**NO** usar View Transitions de Next/React en esta fase (no está habilitado en
`next.config.ts` y la versión de Next es distinta a la conocida: no tocar config
experimental). **NO** agregar librerías de animación.

### B. Arrastre unificado con Pointer Events (táctil + mouse)

Reemplazar HTML5 DnD por un hook propio `useArrastreCita` en
`src/app/admin/agenda/agenda-drag.ts`:

```ts
type ModoArrastre = "mover" | "duracion";
type EstadoArrastre = {
  citaId: string; modo: ModoArrastre;
  columnaId: string;          // profesional destino ("" = sin asignar)
  minutoInicio: number;       // minutos del día, snap 15
  duracion: number;           // minutos, snap 15, min 15
} | null;
```

- **Inicio**: `pointerdown` en la tarjeta. Mouse: arrastre arranca al moverse > 6 px.
  Táctil: **pulsación larga 350 ms** (para no pelear con el scroll); `navigator.vibrate?.(10)`
  al activarse. Durante el arrastre: `setPointerCapture`, `touch-action: none` en la
  tarjeta activa, auto-scroll vertical del contenedor `data-agenda-grid` cuando el
  puntero está a < 48 px del borde.
- **Columna destino**: `document.elementFromPoint(x, y)?.closest("[data-columna-id]")`
  — añadir `data-columna-id={column.id}` al div de cada columna en `day-grid.tsx`.
- **Minuto**: misma fórmula ya usada (`startMin + (clientY - rect.top) / PX_PER_MIN`,
  redondeo 15, clamp `[startMin, endMin - duracion]`). Extraer a
  `agenda-utils.ts` → `minutoDesdeY(clientY, rectTop, startMin, endMin, duracion)`
  con test unitario.
- **Vista previa ("fantasma")**: rectángulo absoluto en la columna destino con borde
  punteado `border-primary` y etiqueta `HH:MM – HH:MM`; la tarjeta original queda con
  `opacity-40`.
- **Soltar**: si cambió algo → mutación (C). `Escape` o `pointercancel` → cancela.
- **Móvil (< md, una columna visible)**: solo cambia hora dentro del profesional
  visible; para cambiar profesional se usa el diálogo existente.
- Teclado/a11y: el diálogo `MoveCitaDialog` sigue siendo la alternativa accesible
  (ya está en el panel lateral); no se elimina.

Eliminar `draggable`, `onDragStart/End/Over/Leave/Drop`, `dragId`, `dropTarget` y
`dropEnColumna` una vez migrado.

### C. Mutaciones optimistas + deshacer

1. En `agenda-board.tsx` usar `useOptimistic(citas, reducer)` con acciones
   `{ tipo: "mover", id, fechaHora, usuarioId }` y `{ tipo: "duracion", id, duracionMinutos }`.
   La tarjeta salta a la nueva posición al instante; si el server responde error se
   revierte sola al terminar la transición + `toast.error` (ya existente en
   `runMutation`).
2. **Deshacer**: tras éxito de mover/duración, toast con acción "Deshacer" 6 s que
   llama la misma action con los valores previos y `version + 1`. Revisar si
   `components/ui/toast.tsx` soporta acción; si no, añadir `toast.success(msg, { action: { label, onClick } })`.
3. Marcar `anim-pulso` en la tarjeta afectada (estado local `ultimaCitaTocada` 700 ms).

### D. Cambiar duración arrastrando

- Asa inferior de 8 px (`cursor-ns-resize`, visible al hover / siempre en táctil
  cuando la tarjeta está seleccionada) en `CitaCard` solo si `isCitaEditable(estado)`.
- Nueva server action en `actions.ts`:

```ts
const duracionSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  duracionMinutos: z.coerce.number().int().min(15).max(720),
  version: z.coerce.number().int().min(1),
});
export async function cambiarDuracionCita(formData: FormData): Promise<CitaMutationResult>
```

  Implementación: copiar el esqueleto de `moverCitaEnTx` (permiso `agenda.editar`,
  `canAccessBranch`, `lockSucursalAgenda`, `versionCoincide`, `isCitaEditable`,
  `validarDisponibilidadCita` con la **misma** `fechaHora` y la nueva duración,
  `recursosDeCita`), `update citas set duracion_minutos, version+1`,
  `registrarHistorialCita` con `accion: "duracion"` y `detalle: { de, a }`.
  **No** encolar aviso al cliente (la hora de inicio no cambia).
  Nota: al agregar/quitar servicios (`toggleServicioCita`) la duración se recalcula
  desde los servicios — comportamiento existente, se conserva.

### E. Tira de días en la barra

En `agenda-toolbar.tsx`, debajo de la fila actual (solo vista "dia"): tira
horizontal desplazable de 14 días (7 antes, 7 después de `fecha`) con día de la
semana + número; día activo resaltado; hoy con punto. Cada día es `<Link>` con
`hrefFor({ fecha })` y `guardRepeatedTap`. Botones ≥ 40 px de alto (objetivo táctil).
Opcional en la misma tira: contador de citas por día **solo si** `page.tsx` ya lo
tiene a mano; si no, sin contador (no añadir query).

## Pasos (orden)

1. A: tokens + clases + aplicar en agenda y tablas.
2. `minutoDesdeY` + tests en `agenda-utils.test.ts` (crear si no existe).
3. B: `agenda-drag.ts` + integración en `day-grid.tsx`/`agenda-board.tsx`; quitar HTML5 DnD.
4. C: `useOptimistic` + deshacer + pulso.
5. D: `cambiarDuracionCita` + asa en `CitaCard`.
6. E: tira de días.

## Criterios de aceptación

- En tablet/celular (Chrome DevTools touch + dispositivo real si se puede) se mueve
  una cita con pulsación larga y arrastre; el fantasma muestra la hora destino.
- Al soltar, la tarjeta queda en su nuevo lugar inmediatamente; si hay conflicto,
  vuelve a su lugar con toast de error.
- "Deshacer" regresa la cita a su hora/profesional original.
- Arrastrar el borde inferior cambia la duración (snap 15 min) y se valida disponibilidad.
- Listas y tarjetas entran con animación sutil; con `prefers-reduced-motion` no.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:usability` y `pnpm test:perf`
(agenda) con `pnpm dev` corriendo; `pnpm test:smoke` (flujo crítico de agenda).
Recorrido manual con Puppeteer en viewport 390 px (`scripts/lib/browser.ts`)
simulando touch para el arrastre.

## Fuera de alcance

Agenda en tiempo real multiusuario (Durable Objects), vista semanal con arrastre
(la semana sigue de solo lectura + enlace al día), View Transitions entre rutas.

## Desviaciones (la llena el implementador)

- **Asa de duración de 14 px**, no 8 px: el requisito de la tarjeta pide 14 px
  (objetivo táctil más generoso). Se implementó `h-3.5` con `cursor-ns-resize`,
  `touch-action: none`, visible al hover y siempre en punteros toscos
  (`any-pointer-coarse`).
- **`EstadoArrastre.columnaId` es `string | null`** (el plan lo tipaba `string`):
  `null` marca "puntero fuera de cualquier columna" para restaurar la tarjeta a
  su lugar al soltar fuera de la rejilla.
- **Tira de 15 ítems** (7 antes + día activo + 7 después): el plan decía "14
  días (7 antes, 7 después)"; para mantener el día activo centrado se incluye
  el propio día seleccionado como ítem central.
- **Sin `dayjs`**: el proyecto no tiene la dependencia; se usaron las utilidades
  propias (`getZonedParts`, `localDateTimeToUtc`, `dayBoundsUtc`, `shiftDateKey`).
- **Telemetría del hueco**: en vez de `data-action-id` en el fondo de columna
  (registraría clics sobre bloqueos y bordes), el clic real sobre hueco llama
  `trackAction("agenda.vacio.crear")` directamente.
- **`MoveCitaDialog` recibe prop `initial`**: al soltar sobre un bloqueo se abre
  el diálogo con el horario/profesional intentados en lugar del horario actual
  de la cita (se fuerza remount con `key`).
- **Clic residual con caducidad**: el "tragado" del clic posterior al soltado
  usa una ventana de 500 ms (`performance.now()`), no un flag persistente —
  evita comerse un clic legítimo si el gesto se cancela con `Escape`.
- **Chips en `CitaCard`**: cliente / servicio / profesional (este último solo en
  vistas donde el profesional no es la columna, con `showProfesional`).
- **Doble-clic en `ConfirmDialog`**: se añadió guardia `confirmando` que ignora
  el segundo clic mientras el diálogo cierra.
- **View Transitions**: no se activaron (fuera de alcance del plan); solo
  transiciones CSS (`anim-entrada`, `anim-pulso`, hover/press, data-ending-style
  de Base UI ya existentes).
