# 78 — Cobrar desde la agenda termina con la misma confirmación

**Prioridad:** P1 · **Depende de:** 75, 77b ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 5

**Objetivo**
Cuando la cita se cobra desde el panel de la agenda, el sheet no se cierra en
silencio: recarga el ticket, muestra la misma confirmación "Venta cobrada"
(cambio a entregar, enviar ticket, nueva venta) y "Listo" cierra el panel y
refresca la agenda. Cobrar sigue costando 3 toques (S2).

**Fuera de alcance**
No se cambia la lógica de cobro ni el sheet de checkout más allá del resultado.
No se toca el flujo de página `/admin/pos` (ese ya va a `/cobrado`). No se
agregan dependencias.

## Contexto verificado

- `src/app/admin/agenda/checkout-sheet.tsx:85-95` — `CheckoutContent`
  renderiza `VentaTicket` con `modo="inline"`, `onChanged={refetch}` y
  `onCobrada` delegado al padre; `refetch` recarga `cargarTicket`.
- `src/app/admin/agenda/agenda-board.tsx:664-679` — `CheckoutSheet` recibe
  `onCobrada={() => { setCheckoutVentaId(null); toast.success("Venta cobrada
  correctamente."); router.refresh(); }}` — cierra el panel sin mostrar
  cambio ni ticket (H16).
- `src/app/admin/pos/cobro-form.tsx:66-69,121-128` — `useActionState(cobrarVenta)`;
  en `modo === "inline"` el éxito llama `onCobrada?.()` (la action devuelve el
  estado sin redirigir, `actions.ts:898-900`).
- `src/app/admin/pos/actions.ts:894-909` — tras cobrar: si `modo === "inline"`
  retorna el outcome (sin redirect); si no, redirige a
  `/admin/pos/cobrado/<id>`.
- `src/app/admin/pos/venta-ticket.tsx:1038-1086` — bloque "Venta cobrada con
  éxito" (estado `completada`) con `TicketActionsBar`, "← Volver a Cobrar" y
  `CancelarVentaButton`; en `modo="inline"` no muestra "Volver".
- `src/app/admin/pos/venta-ticket.tsx:984-1021` — flujo editable: botón
  "Cobrar $X" → `Dialog` con `CobroForm enDialog`.
- `src/modules/pos/ticket.ts` — `TicketData` incluye `pagos[].cambio`,
  `venta.clienteNombre/clienteTelefono/total/propina` (la confirmación inline
  puede calcular el cambio igual que la pantalla de la 75).
- `scripts/flows-e2e.ts:715,777,1284` — `esperarResultadoCobro(true)` espera a
  que el sheet se cierre tras cobrar desde la agenda; con el cambio debe
  esperar la confirmación y luego "Listo".

## Diseño decidido

- En `modo="inline"`, tras `onCobrada` el sheet **no se cierra solo**: el padre
  (`agenda-board`/`CheckoutSheet`) cambia a un estado "cobrada" que:
  1. Recarga el ticket (`refetch`/`cargarTicket`) para que `VentaTicket` pinte
     el bloque "Venta cobrada con éxito".
  2. Muestra encima (o dentro del sheet) la confirmación compacta: total,
     "Cambio a entregar $X" (suma de `pagos[].cambio`), acciones de ticket
     (las mismas de la 75: WhatsApp, imprimir, imagen) y botón primario
     "Listo".
  3. "Listo" cierra el sheet y hace `router.refresh()` de la agenda.
- Reutilizar el componente de confirmación de la 75 si es posible (extraer la
  parte compartida "Cambio + enviar ticket" a un componente sin página, p. ej.
  `src/components/admin/pos/ticket-enviado.tsx`); si la 75 lo dejó como página
  completa, aquí se implementa una variante compacta dentro del sheet sin
  duplicar la lógica de WhatsApp/imagen.
- Cobrar desde la agenda sigue en 3 toques: abrir cobro → confirmar → Listo
  (el "Listo" es posterior al cobro, no cuenta para S2).
- El toast "Venta cobrada correctamente." se conserva solo si no hay confirmación
  visible; con la confirmación, el feedback es la pantalla misma.

## Pasos

1. `src/app/admin/agenda/checkout-sheet.tsx` — estado "cobrada": no cerrar en
   `onCobrada`, recargar ticket y montar la confirmación compacta con "Listo".
2. `src/app/admin/agenda/agenda-board.tsx` — `onCobrada` ya no cierra; pasa a
   modo "esperando confirmación" o se mueve la lógica al sheet.
3. `src/app/admin/pos/venta-ticket.tsx` — si hace falta, variante inline de la
   confirmación (cambio + acciones + Listo) sin "Volver a Cobrar".
4. `src/app/admin/pos/cobro-form.tsx` — solo si el callback necesita datos
   extra (cambio, ventaId) para la confirmación.
5. `scripts/flows-e2e.ts` — `esperarResultadoCobro(true)` acepta la
   confirmación inline; nuevo paso "Listo" cierra el sheet y la agenda se
   refresca.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → suite en verde.
- [ ] `pnpm test:flows` → los `esperarResultadoCobro(true)` en verde con el
      paso nuevo; la cita queda "cobrada" y la agenda refrescada.
- [ ] `pnpm test:usability --only=agenda` → 0 hallazgos nuevos.
- [ ] `pnpm test:smoke` → verde.
- [ ] Manual: cobrar desde la agenda muestra el cambio y permite enviar el
      ticket sin salir del panel.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev
pnpm test:flows && pnpm test:smoke
pnpm test:usability --only=agenda --json
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 5 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- La confirmación inline exige duplicar demasiada lógica de la 75 (extraer el
  componente compartido primero; si no cabe, dejar la agenda con la versión
  actual + "Ver ticket" y documentar).
- `onCobrada`/`onChanged` no recargan el ticket a tiempo para pintar el estado
  completada (ajustar el orden de estados, no hacer polling).
- `test:flows` no logra distinguir "sheet abierto con confirmación" de "sheet
  cerrado" (afinar el selector, no el flujo).

## Reporte (al terminar)

```
Misión: 78 — cobro desde agenda con confirmación
Cambios:
- src/app/admin/pos/venta-ticket.tsx — nuevo prop onFinalizar (modo inline);
  bloque "Venta cobrada con éxito" muestra "Cambio a entregar $X" (suma de
  pagos[].cambio, solo si > 0) y botón primario "Listo"
  (data-action-id=agenda.cobro.listo, data-action-clave=1) en lugar del
  "Volver a Cobrar" de página. TicketActionsBar (WhatsApp/imagen/descargar)
  ya estaba y se conserva.
- src/app/admin/agenda/checkout-sheet.tsx — onCobrada del padre ya no cierra
  el sheet: VentaTicket.onCobrada=refetch (recarga el ticket a completada) y
  onFinalizar=onClose. CheckoutSheet pierde la prop onCobrada.
- src/app/admin/agenda/agenda-board.tsx — CheckoutSheet solo recibe onClose
  (cierra + router.refresh); se elimina el toast "Venta cobrada
  correctamente." porque la confirmación visible es el feedback.
- scripts/flows-e2e.ts — esperarResultadoCobro(true) ahora espera el botón
  "Listo" de la confirmación inline, lo pulsa y verifica que el sheet se
  cierre (antes esperaba el cierre directo).
Verificación: typecheck ✔ | lint ✔ (0 errores, 4 avisos preexistentes) |
  test 653 ✔ | flows 77/77 ✔ (los dos cobros inline ejercitan la
  confirmación: "Listo" aparece, se pulsa y el sheet se cierra) |
  smoke ✔ | usability --only=agenda: /admin/agenda OK ambos viewports;
  único hallazgo = Agenda→Mi día táctil, preexistente (ver desviaciones).
Antes → después: el sheet se cerraba en silencio tras cobrar → queda abierta
  la confirmación "Venta cobrada con éxito" con cambio a entregar, acciones
  de ticket (WhatsApp/imagen/descargar) y "Listo" que cierra y refresca.
Desviaciones:
- No hizo falta extraer un componente compartido nuevo: la confirmación
  inline reutiliza el bloque "Venta cobrada con éxito" de VentaTicket y
  TicketActionsBar (la lógica de WhatsApp/imagen ya es compartida desde la
  74). Solo se agregó el cambio a entregar y el botón "Listo" en modo inline.
- El toast "Venta cobrada correctamente." se eliminó del cierre (la misión
  pedía conservarlo solo sin confirmación visible); onClose ya hacía
  router.refresh(), así que "Listo" = cierre + refresh sin código extra.
- Hallazgo preexistente investigado (no corregido, fuera de alcance): el
  check táctil Agenda→Mi día falla desde antes de la 78. Causa: el shell usó
  NavigationActivity con barra .admin-nav-progress hasta el commit 94d2b6b,
  que borró el componente y dejó el uso comentado; la tab bar usa <a> de
  carga completa sin indicador propio (guardNavTap y onNavigate quedaron
  sin uso — avisos de lint preexistentes). El check quedó desactualizado
  respecto al patrón actual (punto useLinkStatus por enlace). Decisión de
  producto pendiente: restaurar indicador global, cablear guardNavTap +
  pending por enlace, o ajustar el check.
Riesgo abierto: el cambio a entregar inline solo se pinta cuando
  cambioTotal > 0 (los cobros E2E son exactos); el cálculo es el mismo
  reduce de pagos[].cambio ya probado en la pantalla /cobrado de la 75.
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
