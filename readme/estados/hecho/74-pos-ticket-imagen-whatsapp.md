# 74 — La imagen del ticket se genera y se comparte según el aparato

**Prioridad:** P0 · **Depende de:** 75 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo**
El PNG del comprobante se genera de verdad (hoy sale en blanco o truena) y se
comparte según el aparato: en el teléfono se abre el menú Compartir con la
imagen lista para WhatsApp; en la computadora se copia la imagen y se abre el
chat de la clienta en WhatsApp Web; si nada aplica, se descarga el PNG.

**Fuera de alcance**
No se agrega ninguna dependencia npm (si el método SVG→canvas falla en un
navegador real, se anota `BLOQUEO:` y se evalúa Canvas 2D o Browser Run como
misión aparte). No se integra la API de WhatsApp Business ni enlaces públicos.
No se cambia la lógica de cobro.

## Contexto verificado

- `src/lib/ticket-imagen.ts:27-58` — `renderTicketToPng` serializa el nodo a
  SVG `<foreignObject>`, lo carga con `URL.createObjectURL(blob)` en un
  `Image` y rasteriza a canvas 2x. **Verificado en Chrome 153 (origen http):**
  1. Con URL `blob:` el canvas queda contaminado → `toBlob`/`getImageData`
     lanzan `SecurityError` (WebKit hace lo mismo según whatwg/html#10641).
  2. Con `data:image/svg+xml` el PNG sale en blanco si el nodo conserva
     `left:-9999px` (la captura queda fuera del lienzo).
  3. Sin `viewBox` la escala 2x no escala: el texto ocupa un cuarto del
     lienzo.
  4. Con `data:` + posición reiniciada + `viewBox` el PNG sale correcto
     (640×130, miles de píxeles de texto).
- `src/lib/ticket-imagen.test.ts` — prueba unitaria con mocks que no detectan
  el taint ni el lienzo en blanco; hay que endurecerla.
- `src/app/admin/pos/printable-ticket.tsx:89-92` — `whatsappHref` arma
  `wa.me/52${digitos}` sin validar (números extranjeros o ya con 52 quedan
  mal).
- `src/app/admin/pos/printable-ticket.tsx:98-122` — `handleWhatsApp`: intenta
  `navigator.share({ files, title, text })` (el `title`+`text` puede hacer que
  WhatsApp en iPhone descarte la imagen) y si falla cae a `wa.me` con texto.
- `src/app/admin/pos/printable-ticket.tsx:124-156` — `handleCompartirImagen`:
  misma generación; fallback a descarga `<a download>`.
- `src/app/admin/pos/printable-ticket.tsx:362-494` — contenedor de captura
  `position:absolute; left:-9999; width:320; fontSize:11` — hay que subir la
  letra base a ~14 px para que se lea en el teléfono y preparar el clon para
  la serialización.
- `src/app/admin/client-form.tsx:130` — `wa.me/52${telefono}` a ciegas.
- `src/modules/expedientes/retencion.ts:190-195` — `wa.me/${digitos}` sin
  código de país (10 dígitos = número inválido).
- `wa.me` solo admite texto prellenado (FAQ oficial de WhatsApp): la imagen
  viaja por `navigator.share({ files })` en el teléfono o por portapapeles +
  pegado manual en WhatsApp Web.

## Diseño decidido

- **`renderTicketToPng`**: usar URL `data:image/svg+xml;charset=utf-8` (no
  `blob:`); clonar el nodo, reiniciar `position/left/top` del clon (el original
  queda intacto en `-9999px`), agregar `viewBox="0 0 <ancho> <alto>"` al SVG y
  rasterizar a `2x`. Error tipado claro si el canvas no exporta.
- **`src/lib/whatsapp.ts`** (nuevo, puro y probado):
  - `normalizarTelefonoWhatsApp(telefono)`: quita `+`, `00`, espacios y el
    prefijo `044/045`/`521`; 10 dígitos → antepone `52`; devuelve `null` si no
    queda un número válido (8–15 dígitos).
  - `enlaceWhatsApp({ telefono, texto })` → `https://wa.me/<numero>?text=…`.
  - `textoTicketWhatsApp({ negocio, fecha, lineas, total, pagos, moneda })` →
    mensaje llano: negocio, fecha, conceptos, total, forma de pago, gracias.
- **Un solo lugar arma el mensaje/enlace**: `printable-ticket.tsx`,
  `client-form.tsx` y `retencion.ts` usan `whatsapp.ts` (H13). En
  `retencion.ts` el número normalizado conserva su comportamiento (sin 52 si
  ya lo trae; con 52 si son 10 dígitos MX).
- **Botones según el aparato** (en `TicketActionsBar`/`EnviarTicket`):
  - Táctil + `navigator.canShare({ files })` → "Compartir imagen":
    `navigator.share({ files: [file] })` **solo con el archivo** (sin
    `title`/`text`, que en iOS pueden hacer perder la imagen). El texto del
    ticket puede ofrecerse como paso aparte ("Copiar texto" o el enlace
    `wa.me` ya existente).
  - Escritorio con portapapeles → "Copiar imagen" (`navigator.clipboard.write`
    con `ClipboardItem` `image/png`) + "Abrir WhatsApp" (`enlaceWhatsApp` con
    el texto del ticket; la persona pega la imagen en el chat).
  - Si nada aplica → "Descargar imagen" (`<a download>`).
  - Cada botón con su `data-action-id` (`pos.ticket.compartir_imagen`,
    `pos.ticket.copiar_imagen`, `pos.ticket.abrir_whatsapp`,
    `pos.ticket.descargar_imagen`).
- **Generación por adelantado**: el PNG se genera al montar la vista (o al
  abrir el diálogo de confirmación), no dentro del clic, para no perder la
  activación de usuario que `navigator.share` exige en Safari. Mientras se
  genera, los botones muestran estado "preparando".
- **`flows-e2e`**: mockear `navigator.share`/`canShare`/`clipboard` en la
  página y verificar que `share` recibe un `File` `image/png` cuyo bitmap mide
  2x y tiene píxeles de texto (>0 tras `getImageData`).

## Pasos

1. `src/lib/ticket-imagen.ts` — `data:` URL + clon sin posición + `viewBox` +
   errores claros.
2. `src/lib/ticket-imagen.test.ts` — cubrir: URL `data:` (no `blob:`), el clon
   no hereda `left/top`, `viewBox` presente, escala 2x, error sin canvas.
3. `src/lib/whatsapp.ts` (nuevo) + `src/lib/whatsapp.test.ts` (nuevo) —
   normalización MX/extranjero, `enlaceWhatsApp`, `textoTicketWhatsApp`.
4. `src/app/admin/pos/printable-ticket.tsx` — letra base ~14 px en la captura;
   botones por aparato; `whatsapp.ts` para mensaje/enlace; fecha real.
5. `src/app/admin/client-form.tsx`, `src/modules/expedientes/retencion.ts` —
   usar `enlaceWhatsApp`/`normalizarTelefonoWhatsApp`.
6. `scripts/flows-e2e.ts` — verificación del `File` compartido (PNG 2x con
   texto).

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → suite en verde con las pruebas nuevas.
- [ ] En `flows-e2e`, el `navigator.share` simulado recibe `image/png` 2x con
      píxeles de texto > 0 (no blanco, no contaminado).
- [ ] Pruebas de normalización: `55 1234 5678` → `525512345678`;
      `+52 1 55…`/`04455…`/`521…` → `5255…`; `+34 612…` → `34612…`; vacío →
      `null`.
- [ ] Manual (dueño): Android comparte la imagen a WhatsApp; iPhone comparte
      solo el archivo; Chrome escritorio copia y pega en WhatsApp Web.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev
pnpm test:flows
# Manual en aparatos reales (Android, iPhone, Chrome+WhatsApp Web)
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 6 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- El método `data:`+`viewBox` sigue produciendo lienzo en blanco en algún
  navegador de la prueba manual → documentar y proponer Canvas 2D o Browser
  Run (misión aparte, con aprobación).
- `navigator.clipboard.write` con `ClipboardItem` no existe en el navegador
  objetivo de escritorio → usar descarga + texto como fallback documentado.
- La generación por adelantado rompe el layout o el performance del ticket
  (medir antes de subir la letra base).

## Reporte (al terminar)

```
Misión: 74 — imagen del ticket y WhatsApp por aparato
Cambios:
- src/lib/ticket-imagen.ts → renderTicketToPng reescrito: URL data: (no
  blob:, que contaminaba el canvas), clon del nodo sin position/left/top
  (el original queda en -9999px), viewBox en px CSS + width/height en px
  de dispositivo (escala 2x real), sonda getImageData de 1 px y errores
  tipados TicketImagenError.
- src/lib/ticket-imagen.test.ts → cubre data: URL, clon sin posición,
  viewBox, escala 2x/3x y error sin canvas.
- src/lib/whatsapp.ts (nuevo) → normalizarTelefonoWhatsApp (MX: 044/045,
  521…, 10 dígitos → 52; 8–15 dígitos), enlaceWhatsApp y
  textoTicketWhatsApp (negocio, fecha, cliente, conceptos, total, pago).
- src/lib/whatsapp.test.ts (nuevo) → 8 pruebas de normalización/enlace/texto.
- src/app/admin/pos/printable-ticket.tsx → PNG generado por adelantado al
  montar (navigator.share exige gesto en Safari); botones por aparato:
  Compartir imagen (canShare files, share solo con el archivo), Copiar
  imagen (ClipboardItem) o Descargar imagen; "Abrir WhatsApp" con
  enlaceWhatsApp; letra base de la captura ~14 px; action-ids nuevos.
- src/app/admin/client-form.tsx → wa.me ciego reemplazado por
  enlaceWhatsApp (corrige números extranjeros o ya con código de país).
- src/modules/expedientes/retencion.ts → wa.me manual reemplazado por
  enlaceWhatsApp + normalizar (corrige el número de 10 dígitos que antes
  salía inválido); test ajustado al formato vigente sin "1".
- src/app/admin/pos/cobrado/[ventaId]/venta-cobrada.tsx → mensaje y enlace
  de WhatsApp ahora salen de whatsapp.ts (una sola fuente).
- scripts/flows-e2e.ts → mock de navigator.share/canShare/clipboard (como
  string: tsx/esbuild inyecta __name que no existe en el navegador) y 3
  pasos: botón visible, share recibe File y PNG 2x con texto.
Verificación: typecheck ✔ | lint ✔ | test 641 ✔ | usability --only=pos ✔
  (rutas OK en ambos viewports; avisos preexistentes: confirmar bajo el
  pliegue → M76, toque Agenda→Mi día) | smoke ✔ | PNG real verificado en
  Chrome headless: image/png 640px (2x), 41k píxeles no blancos ✔ |
  flows: pasos de la misión en verde en 2 corridas; la suite completa no
  cerró limpia por flakes de infraestructura ajenos (detalles abajo)
Antes → después: PNG en blanco/tainted que nunca se generaba → imagen real
  2x compartible por menú nativo (teléfono), portapapeles (escritorio) o
  descarga; teléfonos normalizados para wa.me.
Desviaciones:
- El mensaje de WhatsApp del ticket ahora incluye la línea "Pago:
  <medio> <monto>" (la pide el diseño de textoTicketWhatsApp).
- En venta-cobrada la imagen PNG queda montada (TicketCapturaImagen) pero
  sin botón de compartir propio: las acciones de imagen viven en
  TicketActionsBar (ticket). Si se quiere compartir imagen directo desde
  la confirmación, es una iteración chica sobre whatsapp.ts.
Riesgo abierto: iOS/WhatsApp Web pendientes de prueba manual del dueño
  (el share solo con files evita el bug de iOS que descartaba la imagen);
  ClipboardItem requiere contexto seguro (localhost y https OK).
```

## Desviaciones (las escribe el implementador)

- `scripts/flows-e2e.ts`: los mocks de `navigator.*` van como **string** en
  `evaluateOnNewDocument`, no como función — tsx/esbuild envuelve las
  funciones con el helper `__name` (keepNames) que no existe en el
  navegador y el mock nunca se instalaba (verificado con
  `ReferenceError: __name is not defined`).
- `retencion.test.ts`: la expectativa `wa.me/52155…` se actualizó a
  `wa.me/5255…` — el "1" tras +52 está obsoleto y la misión lo elimina.
- El texto del ticket por WhatsApp suma la línea "Pago:" con medio y
  monto (antes solo llevaba total).
- La pantalla "Venta cobrada" no ofrece compartir imagen propia; la imagen
  se comparte desde el ticket (`TicketActionsBar`). `TicketCapturaImagen`
  queda montada ahí como punto de integración futuro.
- `flows-e2e` arrojó dos fallos intermitentes ajenos al cambio en corridas
  separadas (wait de 10 s en "Nuevo cliente" — reproducido funcionando;
  500 transitorio en consulta de suscripciones de /admin/pos — servidor
  sano al reintentar). Se documentan por transparencia.
