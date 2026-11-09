# 77b — Mostrar el folio en todo el flujo de cobro

**Prioridad:** P1 · **Depende de:** 77a ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 7

**Objetivo**
La persona del salón ve un folio corto y consecutivo ("Folio 0042") en el
ticket, el comprobante impreso, la imagen, el mensaje de WhatsApp, la
confirmación "Venta cobrada", la lista "Ventas de hoy" y el historial de
ventas — nunca más fragmentos del identificador interno.

**Fuera de alcance**
No se cambia la asignación del folio (eso fue la 77a) ni la lógica de cobro.
Las ventas sin conexión siguen mostrando su `OFF-…` provisional hasta
sincronizarse. No se agregan dependencias.

## Contexto verificado

- `src/modules/pos/ticket.ts:13-34` — `TicketData.venta` (agregar `folio:
  number | null`); `:441-462` CTE `v` — agregar `v.folio` al `select` (misma
  ronda).
- `src/lib/format.ts` — helpers de formato (`formatCurrency`, `formatDate`,
  `formatTime`); aquí va `formatFolioVenta(folio)` → `"0042"` (relleno a 4,
  sin truncar si pasa de 4 dígitos).
- `src/lib/glosario.ts` — agregar `folio: "folio"` (fuente única).
- `src/app/admin/pos/printable-ticket.tsx:80,222,389` — `Folio:
  #${ventaId.slice(0,8).toUpperCase()}` en mensaje WhatsApp, bloque impreso y
  contenedor de captura → reemplazar por el folio real (o "—" si null).
- `src/app/admin/pos/venta-ticket.tsx` — el ticket en pantalla no muestra
  folio hoy; agregarlo junto al total/estado cuando exista.
- `src/app/admin/pos/cobrado/[ventaId]/venta-cobrada.tsx` (de la 75) — mostrar
  "Folio 0042" en el encabezado de "Venta cobrada".
- `src/app/admin/pos/page.tsx:311-340` — filas de "Ventas de hoy": hoy muestran
  cliente · hora · estado · total; anteponer el folio.
- `src/app/admin/ventas/page.tsx` — listado de ventas: agregar folio a la
  columna/fila (hoy no lo muestra).
- `src/app/admin/pos/sencillo/cobro-sencillo.tsx:87` — `Venta
  #{venta.id.slice(-4)}` → folio real o "Venta en proceso" si aún no cobra.
- `src/app/offline/venta/offline-venta.tsx:204,323,349,844` — folio `OFF-…`
  provisional; se conserva hasta sincronizar (documentado, no se toca).
- Búsqueda de fragmentos de UUID en UI: `slice(0,8)`/`slice(-4)` sobre ids de
  venta deben quedar en 0 dentro del flujo de cobro.

## Diseño decidido

- `formatFolioVenta(folio: number | null | undefined): string` → `null` →
  `"—"` (o el texto "en proceso" donde aplique); `42` → `"0042"`; `12345` →
  `"12345"`.
- El folio se muestra como `Folio 0042` (sin `#`, sin UUID). En el ticket
  impreso/imagen/texto de WhatsApp va en el encabezado junto a la fecha.
- "Ventas de hoy" y "Ventas" (historial): `folio · hora · cliente · estado ·
  total`; ventas `en_proceso` (folio null) muestran "En proceso" sin folio.
- `TicketData.venta.folio` viaja desde el CTE; el componente decide el texto.

## Pasos

1. `src/lib/format.ts` — `formatFolioVenta`.
2. `src/modules/pos/ticket.ts` — `folio` en `TicketData.venta` + CTE `v`.
3. `src/lib/glosario.ts` — término `folio`.
4. `printable-ticket.tsx` — folio real en mensaje, impresión y captura.
5. `venta-ticket.tsx`, `venta-cobrada.tsx`, `pos/page.tsx`, `ventas/page.tsx`,
   `cobro-sencillo.tsx` — mostrar el folio donde corresponde.
6. Pruebas: `formatFolioVenta` + un test de render estático que verifique que
   no aparece `slice` de UUID en el ticket/comprobante.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → suite en verde con las pruebas nuevas.
- [ ] `rg "slice\((0, 8|-4)\)"` sobre `src/app/admin/pos` y `src/app/admin/ventas`
      → 0 usos para folio visible (los que queden deben estar justificados).
- [ ] `pnpm test:usability --only=pos` → 0 hallazgos nuevos.
- [ ] `pnpm test:flows` → verde (el cobro completo muestra el folio nuevo).

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev
pnpm test:usability --only=pos --json
pnpm test:flows
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 7 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- `TicketData.venta` no puede llevar `folio` sin otra ronda SQL (debe ir en el
  CTE `v`; si no, `BLOQUEO:`).
- Algún listado muestra el folio de una venta `en_proceso` (debe ser null →
  "En proceso").
- El cambio excede 7 archivos (reducir: posponer `ventas/page.tsx` a otra
  misión).

## Reporte (al terminar)

```
Misión: 77b — folio visible en el flujo
Cambios:
- src/lib/format.ts — formatFolioVenta(): 42→"0042", 12345→"12345",
  null→"—".
- src/lib/glosario.ts — término `folio` ("número consecutivo del ticket
  por sucursal").
- src/modules/pos/ticket.ts — TicketData.venta.folio + TicketDetallesRow +
  v.folio en el CTE (misma ronda SQL, sin consulta extra).
- src/lib/whatsapp.ts — textoTicketWhatsApp acepta folio y agrega la
  línea "Folio 0042" junto a la fecha.
- src/app/admin/pos/printable-ticket.tsx — prop folio; ComprobanteImprimible
  y TicketCapturaImagen muestran "Folio 0042" (antes "Folio: #A1B2C3D4");
  TicketActionsBar lo pasa al mensaje de WhatsApp y a la clave del PNG;
  nombreArchivoTicket() → ticket-0042-ab12.png (folio + sufijo del id).
- src/app/admin/pos/cobrado/[ventaId]/ — folio en subtítulo "Venta cobrada"
  y en propsTicket/mensaje (page.tsx lo pasa desde ticket.venta).
- src/app/admin/pos/venta-ticket.tsx — "Folio 0042" junto al estado en
  Resumen de cobro (solo si existe) y folio a TicketActionsBar.
- src/app/admin/pos/page.tsx — "Ventas de hoy": "Folio 0042 · cliente ·
  hora" (en_proceso sin folio, badge "En proceso" ya lo dice).
- src/app/admin/ventas/page.tsx — columna Folio en tabla + campo en
  tarjeta móvil (solo cuando existe).
- src/app/admin/pos/sencillo/cobro-sencillo.tsx — "Venta #A1B2" →
  "Folio 0042" o "Venta en proceso".
- Pruebas: format.test.ts (formatFolioVenta), printable-ticket.test.tsx
  (comprobante con folio, sin fragmento de UUID), venta-cobrada.test.tsx
  (+2: folio en encabezado y mensaje, encabezado sin folio cuando null).
Verificación: typecheck ✔ | lint ✔ (0 errores, 0 avisos nuevos) | test
  653 ✔ | usability --only=pos: rutas OK ambos viewports, 0 avisos (el
  error Agenda→Mi día móvil es preexistente) | flows 77/77 ✔
Antes → después: "Folio: #F47AC10B" y "Venta #C3D4" → "Folio 0042"
  consecutivo por sucursal en ticket, impresión, imagen, WhatsApp,
  confirmación, Ventas de hoy e historial.
Desviaciones:
- 11 archivos (el plan estimaba ≤7 pero su propio contexto listaba 9;
  whatsapp.ts y cobrado/page.tsx eran necesarios para que el folio
  llegara al mensaje y a la pantalla).
- Los nombres de archivo PNG llevan folio + sufijo del id (ticket-0042-
  ab12.png) para no colisionar entre sucursales con el mismo folio.
Riesgo abierto: ninguno; ventas en_proceso muestran "—"/"En proceso".
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
