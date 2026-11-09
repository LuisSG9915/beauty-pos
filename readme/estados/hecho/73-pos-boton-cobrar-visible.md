# 73 — En el ticket, "Cobrar" se ve y siempre está a la mano

**Prioridad:** P0 · **Depende de:** 72 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 3

**Objetivo**
El botón principal del ticket ("Cobrar $X") se ve con el color bugambilia del
sistema y queda siempre visible: en teléfono es una barra fija sobre la barra
inferior del panel; en escritorio/tablet va dentro del resumen. Las columnas
del ticket dejan de estar invertidas en pantallas anchas.

**Fuera de alcance**
No se cambia la ventana de cobro (`CobroForm`), ni la lógica de líneas, ni el
catálogo más allá del toast. No se toca la agenda ni otras pantallas. No se
agregan dependencias.

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx:636-637` — grid
  `md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]`: la primera columna es
  la ancha. El `<section>` del catálogo/líneas lleva `order-1 md:order-2` (cae
  en la columna angosta en md+) con `md:max-h-[45vh] md:overflow-y-auto`.
- `src/app/admin/pos/venta-ticket.tsx:831` — `<aside>` del resumen con
  `order-2 md:order-1` (cae en la columna ancha) y clases contradictorias
  `md:max-h-[60vh] md:overflow-y-auto md:max-h-none md:overflow-visible`.
- `src/app/admin/pos/venta-ticket.tsx:984-1021` — botón "Cobrar"
  (`data-action-clave="1"`, `data-action-id="pos.cobro.abrir"`) con clases que
  pisan el primario: `bg-card/95`, `border-t`, `backdrop-blur-sm`, `sticky
  bottom-0`. El `cn()` del proyecto resuelve el conflicto a `bg-card` +
  `text-primary-foreground` → contraste ~1.03:1 en claro (verificado
  ejecutando `cn`).
- `src/app/admin/pos/venta-ticket.tsx:998-1019` — `<Dialog>` que abre
  `CobroForm` con `enDialog`/`onClose`.
- `src/app/admin/pos/venta-ticket.tsx:1038-1086` — bloque "Venta cobrada con
  éxito" (estado completada) con `TicketActionsBar`; no se toca aquí.
- `src/app/admin/pos/catalogo-selector.tsx:105-118` — tras agregar una línea
  hace `toast.success("Agregado al ticket.")` además del "✓ Agregado" que ya
  pinta la tarjeta (`:285-287`).
- `src/components/admin/admin-nav.tsx:~777` — `AdminTabBar` fijo inferior de
  ~56 px con `z-40` en móvil; cualquier barra fija del ticket debe quedar por
  encima de él (z-index mayor y `bottom` que lo respete).
- `src/lib/utils.ts` — `cn()` (tailwind-merge): la última clase del mismo
  grupo gana; `bg-primary` y `bg-card/95` son del mismo grupo → gana la última
  en el string. Por eso el orden de clases en el JSX importa.

## Diseño decidido

- **Un solo botón "Cobrar"** con `data-action-clave="1"` y
  `data-action-id="pos.cobro.abrir"`, sin `bg-card/95`/`border-t`/
  `backdrop-blur`/`sticky` que pisen el primario. Muestra el monto a cobrar
  (`total − anticipoPorAplicar`), no el total completo.
- **Teléfono (< md)**: barra fija al pie del área de contenido, encima de la
  `AdminTabBar` (`bottom` = alto de la tab bar + `env(safe-area-inset-bottom)`),
  texto "Cobrar $X · N artículos". Solo se renderiza si `tieneLineas`; deja un
  espaciador del mismo alto al final del flujo para que el contenido no quede
  tapado.
- **md+**: el botón va dentro del `<aside>` del resumen (debajo del total),
  sin fijar.
- **Columnas md+**: ticket (catálogo + líneas) en la columna ancha a la
  izquierda (`md:order-1` en el section, `md:order-2` en el aside, o reordenar
  el grid); resumen en la columna angosta a la derecha. Quitar
  `md:max-h-[45vh]`/`md:overflow-y-auto` del section y las clases
  contradictorias del aside. En teléfono se mantiene el orden decidido en la
  misión 64: ticket primero, resumen después.
- **Catálogo**: quitar el `toast.success` por toque; el "✓ Agregado" de la
  tarjeta y el total ya son la confirmación. Los errores siguen con toast.

## Pasos

1. `src/app/admin/pos/venta-ticket.tsx` — reordenar el grid md+ (ticket a la
   izquierda/ancho, resumen a la derecha/angosto) y limpiar las clases de
   altura del section/aside.
2. `src/app/admin/pos/venta-ticket.tsx` — rehacer el botón "Cobrar": clases
   limpias con `bg-primary text-primary-foreground`, barra fija móvil sobre la
   tab bar + espaciador, versión md+ dentro del resumen.
3. `src/app/admin/pos/catalogo-selector.tsx` — quitar el toast de éxito por
   toque (conservar los de error).

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → suite en verde.
- [ ] `pnpm test:usability --only=pos` (desktop y móvil, contra la línea base
      de la 72) → 0 `color-contrast` en `pos.cobro.abrir`, claro y oscuro; la
      barra móvil no queda tapada por la tab bar; las líneas del ticket se ven
      sin scroll interno en 1366×768.
- [ ] Exactamente 1 `data-action-clave="1"` por pantalla del ticket.
- [ ] `pnpm test:flows` → verde.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev
pnpm test:usability --only=pos            # desktop + movil
pnpm test:flows
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 3 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- Quitar `md:max-h`/`overflow` rompe el layout en algún viewport (anotar cuál
  y dejar la altura mínima que lo sostenga).
- La barra fija móvil tapa contenido o controles en 390×844 (ajustar el
  espaciador, no quitar la barra).
- `test:flows` falla por un paso que esta misión no tocó.

## Reporte (al terminar)

```
Misión: 73 — botón Cobrar visible y a la mano
Cambios: venta-ticket.tsx → botón único responsive (fixed sobre la tab bar
en <md, static dentro del resumen en md+), columnas md+ corregidas, monto
= total − anticipoPorAplicar y texto "Cobrar $X · N artículos";
catalogo-selector.tsx → fuera toast.success por toque (siguen los de error).
Verificación: typecheck ✔ | lint ✔ (0 err, 3 avisos preexistentes) | test
626 ✔ | usability --only=pos: 0 color-contrast y 0 "bajo el pliegue" en
pos.cobro.abrir (la base de la 72 tenía 4+2); flows 72/72 al re-verificar
(la corrida original reportó 29/30 por un flake que no reprodujo).
Antes → después: texto ~1.03:1 invisible sobre bg-card y botón que podía
quedar bajo el pliegue en móvil → primario bugambilia (rgb(169,29,93))
siempre visible: barra fija de 56 px a 11 px sobre la tab bar en teléfono
y dentro del resumen en escritorio.
Desviaciones: ver sección siguiente.
Riesgo abierto: select-name axe en /admin/pos/cobrado/[id] (preexistente,
Select "Motivo SAT" de CancelarFacturaForm sin nombre accesible) y aviso
pos.cobro.confirmar bajo el pliegue — ambos ya estaban en la base de la 72.
```

## Desviaciones (las escribe el implementador)

- ~~**`test:flows` 29/30 — fallo preexistente**~~ **Descartado al
  re-verificar**: la corrida posterior con el mismo código dio 72/72, incluido
  el paso `mi_dia.cita.cobrar`. El 29/30 fue un flake del entorno de esa
  sesión (posible dev server desactualizado), no un defecto del flujo.
- **"N artículos" = suma de `cantidad`** de las 4 listas de líneas (mismo
  criterio que la columna "Artículos" de `/admin/ventas`), no número de
  líneas. Plural correcto ("1 artículo").
- **Botón dentro de la tarjeta "Resumen de cobro"**, debajo del bloque del
  total y antes del `<details>` de desglose (interpretación de "dentro del
  resumen, debajo del total").
- **Alto de barra 56 px (`h-14`)**: `min-h-14` perdía contra
  `max-sm:min-h-11` del size por defecto del Button (medido 44 px en móvil);
  `h-14` fija 56 px en todos los breakpoints y gana por orden en `cn()`.
- **`bottom` distinto en modo inline**: dentro del Sheet de agenda no hay
  tab bar visible (backdrop z-50 la cubre), así que la barra usa solo
  `env(safe-area-inset-bottom) + 0.75rem`; en página suma los 3.5 rem de la
  tab bar. Hoy `env(safe-area-inset-bottom)` vale 0 (sin `viewport-fit=cover`)
  pero queda listo si se activa.
- **Espaciador `pb-20 md:pb-0` condicional** en el grid (no un div aparte):
  en página se suma al `pb-24` del `main`; en el sheet compensa su `p-5`.
  Verificado con Puppeteer: al hacer scroll al fondo el último bloque del
  aside queda por encima de la barra (390×844).
