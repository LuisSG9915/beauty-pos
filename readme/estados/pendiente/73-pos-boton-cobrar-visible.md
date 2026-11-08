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
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores | flows ✔
Antes → después: <contraste ~1:1 y botón que puede quedar bajo el pliegue →
  primario bugambilia siempre visible>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
