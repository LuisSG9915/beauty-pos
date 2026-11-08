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
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores | flows ✔
Antes → después: <UUIDs visibles → folio consecutivo en todo el flujo>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
