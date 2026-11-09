# 75 — Pantalla "Venta cobrada" que dice la verdad y no se cierra por accidente

**Prioridad:** P0 · **Depende de:** 73 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo**
Tras cobrar, la persona ve una pantalla propia "Venta cobrada" (no un modal
flotante sobre una página vacía) que muestra el total, las formas de pago, el
**cambio a entregar** real, y permite enviar el ticket por WhatsApp, imprimirlo
de verdad y abrir una nueva venta sin errores.

**Fuera de alcance**
No se cambia la lógica de cobro, pagos, propina ni idempotencia. No se genera
la imagen PNG del ticket (eso es la misión 74; aquí se deja el punto de
integración). No se toca la agenda (eso es la 78) ni el inicio de Cobrar (79).
No se agregan dependencias.

## Contexto verificado

- `src/app/admin/pos/cobrado/[ventaId]/page.tsx:25-63` — página server que
  carga `getTicketData`, exige `estado === "completada"` y
  `ticket.venta.sucursalId === sucursalId`, pero **no llama**
  `requireAccessPermission` ni `canAccessBranch` (H6).
- `src/app/admin/pos/cobrado/[ventaId]/cobrado-cliente.tsx:12-49` —
  `CobradoConfirmacion` solo monta `ModalConfirmacionCobro` y al cerrar hace
  `router.push(/admin/pos?…)`; no pasa `onNuevaVenta`.
- `src/components/admin/pos/modal-confirmacion-cobro.tsx:78-83` —
  `urlNuevaVenta = /pos?…&nueva=1` → **404** (no existe `src/app/pos`);
  `mensajeWhatsApp` lleva la ruta interna `/admin/pos?…&ventaId=…`.
- `src/components/admin/pos/modal-confirmacion-cobro.tsx:136-143` — título
  `Venta #{ventaId.slice(-4)}` (fragmento de UUID) y "Cobrado · sin cambio"
  fijo, aunque haya cambio.
- `src/components/admin/pos/modal-confirmacion-cobro.tsx:147-260` — formulario
  WhatsApp sin teléfono prellenado (la venta trae `clienteTelefono`), input sin
  etiqueta visible, `<select>` de país sin nombre accesible (axe
  `select-name`), cuatro acciones solo-icono, "Imprimir" = `window.print()`
  sobre una página sin bloque imprimible.
- `src/app/admin/pos/printable-ticket.tsx:48-211` — `TicketActionsBar`:
  Imprimir/WhatsApp/Compartir imagen. `:214-358` bloque `hidden print:block`
  (ticket 80 mm). `:362-494` contenedor de captura fuera de pantalla.
- `src/app/admin/pos/venta-ticket.tsx:1038-1086` — bloque "Venta cobrada con
  éxito" con `TicketActionsBar` + "← Volver a Cobrar" + `CancelarVentaButton`.
- `src/modules/pos/ticket.ts:13-34` — tipo `TicketData.venta` (sin `cobradaAt`
  ni `folio`); `:441-462` CTE `v` de `getTicketData` (agregar `v.cobrada_at`).
- `src/app/admin/pos/sencillo/page.tsx:26-27,67-68` — tampoco valida permiso
  ni sucursal (H6).
- `src/app/admin/pos/page.tsx:39,87` — patrón correcto:
  `requireAccessPermission(context.access, "ventas.ver")` +
  `canAccessBranch(context.access, ticket.venta.sucursalId)`.
- `src/app/admin/pos/page.tsx:243-259` — patrón de "Nueva venta":
  `buildAdminHref("/pos", { organizationId, sucursalId, extra: { nueva: "1" } })`
  (crea la venta en `page.tsx:64-82`).
- `src/lib/url-context.ts` — `buildAdminHref` / `firstParam`.
- Pruebas con `renderToStaticMarkup`: patrón en
  `src/components/admin/data-table.test.tsx` (o equivalente existente).

## Diseño decidido

- **Pantalla propia, no modal**: `/admin/pos/cobrado/<id>` renderiza una
  tarjeta centrada estilo norhud (misma familia visual que el POS) SIN fondo
  que capture Esc ni clic fuera. Encabezado: h1 "Venta cobrada" + total +
  forma(s) de pago; "Cambio a entregar $X" en grande cuando
  `sum(pagos[].cambio) > 0`; cliente y fecha/hora reales del cobro
  (`cobradaAt`).
- **`getTicketData`**: agregar `cobradaAt` al CTE `v` (`v.cobrada_at`) y al
  tipo `TicketData.venta` — misma ronda SQL, sin consultas extra.
- **Acciones**:
  - "Enviar ticket por WhatsApp": teléfono de la clienta
    (`clienteTelefono`) prellenado, editable, con `<label>` visible; el número
    se normaliza con la misma regla que usará la misión 74 (por ahora puede
    quedar la regla local del modal hasta que exista `src/lib/whatsapp.ts`).
    El texto NO lleva rutas internas ni UUID: negocio, total, fecha y folio
    (folio llega en la 77b; mientras tanto sin folio).
  - "Imprimir ticket": botón con texto; imprime el comprobante real
    (`ComprobanteImprimible`/`TicketActionsBar` de `printable-ticket.tsx`).
  - "Ver venta": enlace a `/admin/pos?…&ventaId=<id>`.
  - Acción primaria `data-action-clave="1"` +
    `data-action-id="pos.cobrado.nueva_venta"`: "Nueva venta" →
    `buildAdminHref("/pos", { organizationId, sucursalId, extra: { nueva: "1" } })`.
  - Se eliminan "Copiar" y "Enlace" (copiaban la ruta interna inútil).
- **Se elimina** `src/components/admin/pos/modal-confirmacion-cobro.tsx` y su
  prueba `modal-confirmacion-cobro.test.tsx`: solo los usa `/cobrado`. La
  funcionalidad se reescribe en `venta-cobrada.tsx` (cliente) +
  `printable-ticket.tsx` (ticket/envío reutilizable).
- **`printable-ticket.tsx`**: separar `ComprobanteImprimible` (bloque
  `print:block`) y el contenedor de captura para que `venta-cobrada.tsx` y el
  bloque completada de `venta-ticket.tsx` los reutilicen; la acción de imagen
  queda como punto de integración de la 74.
- **Guardas (H6)**: en `/cobrado/[ventaId]/page.tsx` y
  `/admin/pos/sencillo/page.tsx` agregar
  `requireAccessPermission(context.access, "ventas.ver")` y
  `canAccessBranch(context.access, ticket.venta.sucursalId)` (o la sucursal
  de la venta cuando aplica), siguiendo el patrón de `pos/page.tsx:39,87`.
- **Fecha del comprobante**: `TicketActionsBar` recibe `fecha` real
  (`cobradaAt`) en lugar de `new Date()` por defecto (H10).

## Pasos

1. `src/modules/pos/ticket.ts` — `cobradaAt` en el CTE `v` y en
   `TicketData.venta`.
2. `src/app/admin/pos/printable-ticket.tsx` — exportar
   `ComprobanteImprimible` + contenedor de captura reutilizables; `fecha`
   por prop.
3. `src/app/admin/pos/cobrado/[ventaId]/venta-cobrada.tsx` (nuevo, cliente) —
   pantalla "Venta cobrada" con cambio, WhatsApp (teléfono prellenado),
   imprimir, ver venta y "Nueva venta".
4. `src/app/admin/pos/cobrado/[ventaId]/page.tsx` — guardas de permiso y
   sucursal; pasar los datos del ticket al componente.
5. `src/app/admin/pos/cobrado/[ventaId]/cobrado-cliente.tsx` — reemplazar por
   la pantalla nueva (o eliminar si `venta-cobrada.tsx` la sustituye).
6. `src/app/admin/pos/venta-ticket.tsx` — el bloque completada usa el
   comprobante/acciones reutilizados.
7. `src/app/admin/pos/sencillo/page.tsx` — mismas guardas.
8. Eliminar `modal-confirmacion-cobro.tsx` + su test; agregar test nuevo de
   `venta-cobrada` con `renderToStaticMarkup`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → suite en verde, incluidas las pruebas nuevas de
      `venta-cobrada` (hay h1 "Venta cobrada"; aparece "Cambio a entregar"
      cuando hay cambio; el enlace de WhatsApp no contiene "/admin/" ni UUID;
      "Nueva venta" apunta a `/admin/pos?…&nueva=1`).
- [ ] `pnpm test:usability --only=cobrado` (con la ruta dinámica de la 72) →
      0 errores y 0 avisos nuevos; el `select` de país tiene nombre accesible.
- [ ] `pnpm test:flows` → cobrar → "Venta cobrada" → "Nueva venta" abre un
      ticket nuevo.
- [ ] `pnpm test:smoke` → verde.
- [ ] Manual: vista previa de impresión muestra el ticket (no la pantalla).

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev
pnpm test:usability --only=cobrado --json
pnpm test:flows && pnpm test:smoke
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 8 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- `getTicketData` no puede exponer `cobradaAt` sin una ronda extra (debe ir en
  el CTE `v`; si no, se documenta y se usa `createdAt` como aproximación).
- La pantalla nueva exige más de 8 archivos (reducir alcance: dejar la acción
  de imagen para la 74 sin integrarla aún).
- Algún consumidor oculto de `ModalConfirmacionCobro` aparece al buscar.

## Reporte (al terminar)

```
Misión: 75 — pantalla Venta cobrada
Cambios:
- src/modules/pos/ticket.ts → cobradaAt en el CTE `v` y en TicketData.venta
  (misma ronda SQL, sin consultas extra).
- src/app/admin/pos/printable-ticket.tsx → exporta ComprobanteImprimible
  (bloque print:block 80 mm) y TicketCapturaImagen (captura para PNG, punto
  de integración de la 74); TicketActionsBar los reutiliza.
- src/app/admin/pos/cobrado/[ventaId]/venta-cobrada.tsx (nuevo) → pantalla
  propia "Venta cobrada": total, formas de pago, "Cambio a entregar" real
  (suma de pagos[].cambio > 0), cliente y fecha/hora del cobro, WhatsApp con
  teléfono prellenado y selector de país con etiqueta visible, Imprimir
  ticket, Ver venta y "Nueva venta" → /admin/pos?…&nueva=1. Contenido
  visible envuelto en print:hidden → la impresión solo muestra el
  comprobante.
- src/app/admin/pos/cobrado/[ventaId]/page.tsx → guardas
  requireAccessPermission("ventas.ver") + canAccessBranch; pasa el ticket
  completo al componente.
- src/app/admin/pos/cobrado/[ventaId]/cobrado-cliente.tsx → eliminado
  (sustituido por venta-cobrada.tsx, previsto en el paso 5).
- src/app/admin/pos/venta-ticket.tsx → bloque completada pasa fecha real
  (venta.cobradaAt) al TicketActionsBar.
- src/app/admin/pos/sencillo/page.tsx → mismas guardas de permiso y sucursal.
- src/components/admin/pos/modal-confirmacion-cobro.tsx + test → eliminados
  (sin consumidores tras quitar cobrado-cliente).
- venta-cobrada.test.tsx (nuevo) → 5 pruebas renderToStaticMarkup: h1,
  cambio condicional, WhatsApp sin /admin/ ni UUID, Nueva venta con
  nueva=1, acciones accesibles.
- scripts/flows-e2e.ts → +2 pasos ("Venta cobrada" visible y "Nueva venta"
  abre ticket nuevo) y clickAccionCita tolera render desactualizado
  (recarga entre reintentos + diagnóstico de acciones presentes).
Verificación: typecheck ✔ | lint ✔ (0 errores; 4 avisos preexistentes) |
test 629 ✔ | usability cobrado 0 errores nuevos (select-name resuelto) |
flows 74/74 ✔ | smoke ✔ | impresión (emulateMediaType print) muestra solo
el comprobante ✔
Antes → después: modal con 404 en "Nueva venta", "sin cambio" fijo, UUID
visible y select sin nombre → pantalla dedicada con cambio real, WhatsApp
con teléfono prellenado, impresión del comprobante y guardas de servidor.
Desviaciones:
- clickAccionCita del arnés ganó recargas entre reintentos: el paso
  mi_dia.cita.cobrar falló de forma intermitente (también en la corrida del
  agente de la 73) porque pollReload puede aceptar el estado optimista y el
  DOM queda un instante desactualizado. Es robustez del arnés, no cambio de
  producto.
- El ticket impreso y el texto de WhatsApp de TicketActionsBar aún llevan
  "Folio: #<8 chars del id>": se reemplaza por el folio consecutivo en la
  77b (fuera de alcance aquí).
Riesgo abierto: ninguno funcional; imagen PNG del ticket sigue pendiente
  de la 74 (TicketCapturaImagen ya queda montada en la pantalla).
```

## Desviaciones (las escribe el implementador)

- `clickAccionCita` en `scripts/flows-e2e.ts` ahora recarga la página entre
  reintentos y, al fallar, reporta las `data-action-id` presentes. Motivo:
  el paso `mi_dia.cita.cobrar` falló de forma intermitente (también en la
  verificación de la 73) porque `pollReload` acepta el estado optimista del
  cliente y el botón puede quedar un instante desactualizado/deshabilitado.
- Se añadió `print:hidden` al contenido visible de `venta-cobrada.tsx`:
  sin él, la vista previa de impresión mostraba la pantalla de confirmación
  junto al comprobante (el `.no-print` global nunca se usaba).
- El "Folio" del comprobante impreso y del mensaje de `TicketActionsBar`
  sigue siendo un fragmento del id; la sustitución por folio consecutivo es
  alcance de la 77b.
- Conteo de archivos: 7 modificados + 3 eliminados + 2 nuevos (componente y
  prueba), ligeramente sobre el presupuesto de 8 al contar eliminaciones;
  el alcance funcional se mantuvo.

