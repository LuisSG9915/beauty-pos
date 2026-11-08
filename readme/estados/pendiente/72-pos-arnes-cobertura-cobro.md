# 72 — El arnés de pruebas recorre el cobro de punta a punta

**Prioridad:** P0 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 4

**Objetivo**
`pnpm test:usability` y `pnpm test:flows` ejercitan el ticket en proceso, la
ventana de cobro y la pantalla post-cobro, en móvil y escritorio, y dejan
capturas. La corrida documenta los defectos conocidos (botón "Cobrar" de bajo
contraste, selector de país sin nombre) como línea base para las misiones
siguientes.

**Fuera de alcance**
No se cambia código de la aplicación (`src/`). No se arreglan los defectos que
el arnés reporte: eso es trabajo de las misiones 73–79. No se agregan
dependencias.

## Contexto verificado

- `scripts/usability-check.ts:36-76` — lista `PAGES` estática; `/admin/pos`
  está, pero no el ticket ni `/admin/pos/cobrado/…`.
- `scripts/usability-check.ts:97-208` — `rutasDinamicas()` crea por SQL la cita
  de prueba (identificada por `notas = 'Cita de prueba del arnés de usabilidad
  (e2e-usability)'`) y devuelve `/mi-cita/<token>`; `limpiar()` la borra al
  final.
- `scripts/usability-check.ts:218-281` — `crearCompraDePrueba()` crea una compra
  en borrador con folio `E2E-USABILITY` y `limpiarComprasDePrueba()` la borra.
  Es el patrón a copiar para las ventas de prueba.
- `scripts/usability-check.ts:527-664` — `main()`: por viewport recorre las
  rutas y corre `axeScan` + `accionPrimariaCheck` + `objetivoTactilCheck` +
  `layoutMovilCheck` (solo móvil); luego "Rutas por clics" (desktop) y
  "Recorrido táctil" (móvil, Agenda → Mi día).
- `scripts/flows-e2e.ts:619-624` — `abrirCobro()` abre el `CheckoutSheet` de la
  agenda (clic en "Ver venta"/"Cobrar" del panel lateral).
- `scripts/flows-e2e.ts:651-670` — `esperarResultadoCobro(enSheet)`: en modo
  sheet espera a que cierre el diálogo; en modo página espera
  `/admin/pos` sin `ventaId` o `/admin/agenda`. **Ya no cubre** la
  redirección a `/admin/pos/cobrado/<id>` que hace `cobrarVenta`.
- `scripts/flows-e2e.ts:671` — `clickCobrar` hace clic en
  `[role="dialog"] button[type="submit"]` con texto "Cobrar".
- `scripts/flows-e2e.ts:788-825` — recorrido walk-in: "Abrir venta" → agregar
  línea → clic en propina "10%" → clic en "Cobrar". **Roto desde la misión 62**:
  la propina y el medio de pago viven dentro del `<Dialog>` de cobro, que solo
  se abre pulsando el botón "Cobrar $X" del ticket (`pos.cobro.abrir`).
- `src/app/admin/pos/page.tsx:44,86` — el ticket se abre con
  `/admin/pos?organizationId=…&sucursalId=…&ventaId=…`.
- `src/app/admin/pos/cobrado/[ventaId]/page.tsx:35-50` — la confirmación vive
  en `/admin/pos/cobrado/<ventaId>?organizationId=…&sucursalId=…` y exige
  `estado === "completada"`.
- `src/db/schema/operations.ts:173-216` — tabla `ventas` (estado
  `en_proceso`/`completada`, `cobrada_at`, `subtotal`, `total`, `propina`);
  `:218-277` — `detalle_ventas_servicios` y `detalle_ventas_medios_pagos`.

## Diseño decidido

- Las ventas de prueba se crean por SQL en la organización E2E (slug
  `estetica-prueba-e2e`, la misma de `E2E_RESERVA_SLUG`), identificadas por una
  marca en `ventas.notas` (p. ej. `E2E-USABILITY`) y se borran en `finally`,
  igual que `limpiarComprasDePrueba`. Si una corrida anterior dejó basura, se
  reutiliza o se limpia antes de crear.
- Datos mínimos: una venta `en_proceso` con 1 línea de `detalle_ventas_servicios`
  (servicio del catálogo E2E, `nombre`/`precio` como snapshot) y una venta
  `completada` con `cobrada_at = now()`, 1 línea de servicio y 1 pago en
  `detalle_ventas_medios_pagos` (medio `efectivo` del catálogo E2E,
  `recibido > monto` para que haya cambio visible).
- La ventana de cobro se audita como paso interactivo (como el "Recorrido
  táctil" de `/admin/agenda` → `/admin/mi-dia`): abrir el ticket de prueba,
  hacer clic en el botón `pos.cobro.abrir`, esperar `[role="dialog"]` y correr
  los mismos checks dentro del diálogo.
- En `flows-e2e`: antes de tocar propina/medio/pago hay que abrir la ventana de
  cobro (clic en el botón "Cobrar $…" del ticket); `esperarResultadoCobro`
  debe aceptar `location.pathname.startsWith("/admin/pos/cobrado/")` como
  resultado exitoso en modo página; tras cobrar en página se continúa con el
  botón "Nueva venta" de la confirmación (o se navega de vuelta a `/admin/pos`
  si la misión 75 aún no está).

## Pasos

1. `scripts/usability-check.ts` — añadir `crearVentasDePrueba()` +
   `limpiarVentasDePrueba()` (patrón de `crearCompraDePrueba`) y registrar las
   rutas `/admin/pos?…&ventaId=<enProceso>` y
   `/admin/pos/cobrado/<completada>?…` en la lista dinámica.
2. `scripts/usability-check.ts` — paso interactivo "ventana de cobro": clic en
   `pos.cobro.abrir`, esperar el diálogo, correr `axeScan` +
   `accionPrimariaCheck` + `objetivoTactilCheck` (+ `layoutMovilCheck` en
   móvil) con la página del diálogo abierto; capturas en `.artifacts/`.
3. `scripts/flows-e2e.ts` — abrir la ventana de cobro antes de elegir propina
   y medio de pago en los recorridos de ticket en proceso (sheet y página);
   actualizar `esperarResultadoCobro` para aceptar `/admin/pos/cobrado/`.
4. Guardar la línea base: correr `pnpm test:usability --only=pos --json` y
   `pnpm test:flows` con `pnpm dev` activo; el JSON debe reportar los defectos
   conocidos (contraste del botón `pos.cobro.abrir`, `select-name` del país en
   la confirmación si la ruta nueva lo alcanza).

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → suite en verde.
- [ ] `pnpm test:usability --only=pos --json` → las 3 rutas del POS aparecen en
      ambos viewports; la ventana de cobro se audita con el diálogo abierto;
      la línea base queda en `.artifacts/usability-*.json`.
- [ ] `pnpm test:flows` → el cobro completo corre; si falla por un defecto ya
      conocido, el `record()` indica el paso exacto (no un timeout genérico).

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev  (requerido por los arneses)
pnpm test:usability --only=pos --json
pnpm test:flows
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 4 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- El esquema real de `ventas`/`detalle_*` contradice el "Contexto verificado".
- Crear las ventas de prueba exige tocar datos de una organización que no sea
  la E2E.
- `flows-e2e` falla por un defecto que esta misión no puede distinguir de un
  bug del arnés nuevo (anotar cuál y seguir).

## Reporte (al terminar)

```
Misión: 72 — arnés de usabilidad del cobro
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability N rutas ✔ | flows N ✔
Antes → después: <rutas POS cubiertas → + ticket, ventana y confirmación>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
