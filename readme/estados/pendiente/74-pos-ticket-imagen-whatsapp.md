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
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | flows ✔ | manual <aparatos>
Antes → después: <PNG en blanco/tainted → imagen real compartible>
Desviaciones: <ninguna | lista>
Riesgo abierto: <iOS/WhatsApp Web pendiente de prueba manual | ninguno>
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
