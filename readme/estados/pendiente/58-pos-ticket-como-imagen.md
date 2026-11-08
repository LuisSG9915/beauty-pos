# 58 — POS: enviar el ticket como imagen (PNG)

**Prioridad:** P1 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo**
El cajero puede generar un PNG del comprobante de una venta cobrada y compartirlo
por WhatsApp (sheet nativo del sistema) o descargarlo, sin depender de un mensaje
de texto. Reutiliza el markup del ticket actual y no añade dependencias.

**Fuera de alcance**
No se añaden dependencias npm. No se modifica el bloque `hidden print:block` existente
ni `window.print()`. No se toca el modal post-cobro más allá de añadir el botón
(eso va en la misión 59). No se cambia la lógica de cobro.

## Contexto verificado

- `src/app/admin/pos/printable-ticket.tsx:1-235` — `TicketActionsBar` con botones
  Imprimir (`window.print()`) y WhatsApp (texto). Bloque imprimible `hidden print:block`
  con formato 80 mm. Props: `negocioNombre, ventaId, clienteNombre, ...`.
- `src/app/admin/pos/venta-ticket.tsx:1000-1027` — renderiza `TicketActionsBar` solo
  cuando `venta.estado === "completada"`.
- `src/components/admin/pos/modal-confirmacion-cobro.tsx:81-97` — `enviarWhatsApp`
  abre `wa.me` con texto (solo enlace a la venta).
- `package.json` — sin librería de captura de DOM (html-to-image, dom-to-image).

## Diseño decidido

- Generación de imagen con APIs nativas: serializar nodo DOM a SVG `<foreignObject>`,
  rasterizar a `<canvas>` (escala 2x) y `toBlob('image/png')`.
- El nodo a capturar debe estar **renderizado** (no `display:none`). Se añade un
  contenedor posicionado fuera de pantalla (`position: absolute; left: -9999px`)
  con el mismo markup del ticket en **estilos inline** (no clases Tailwind), para
  evitar problemas de herencia de CSS en el SVG.
- Botón "Compartir imagen": si `navigator.share` y `navigator.canShare({ files })`
  → `navigator.share({ files: [file], title, text })`; si no → descarga con `<a download>`.
- El helper vive en `src/lib/ticket-imagen.ts` y es puro (recibe un `HTMLElement`).

## Pasos

1. `src/lib/ticket-imagen.ts` (nuevo) — función `renderTicketToPng(element: HTMLElement): Promise<Blob>`
   con serialización SVG→canvas a 2x y fallback de error tipado.
2. `src/app/admin/pos/printable-ticket.tsx` — añadir contenedor de captura
   (renderizado, fuera de pantalla) con markup del ticket en estilos inline + `ref`;
   añadir botón "Compartir imagen" en `TicketActionsBar` que llama al helper.
3. Integrar `navigator.share` con fallback a descarga y toast de resultado.
4. `src/lib/ticket-imagen.test.ts` (nuevo) — prueba unitaria del helper con mock de
   `canvas`/`toBlob` (verificar que se llama y devuelve Blob).
5. Verificación manual en Chrome desktop (descarga PNG) y móvil (share sheet).

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] Botón "Compartir imagen" genera un PNG descargable en Chrome desktop.
- [ ] En un navegador con `navigator.share` mockeado con files, se invoca `share`
      con un `File` de tipo `image/png`.
- [ ] El contenedor oculto no afecta el layout: `pnpm test:usability` → 0 errores
      de layout-movil.
- [ ] `pnpm test` → pruebas nuevas en verde.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev  (verificación manual del PNG)
# pnpm test:usability --viewport=movil
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 6 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- La serialización SVG→canvas produce un PNG en blanco por falta de estilos
  heredados → anotar y evaluar añadir `html-to-image` (requiere aprobación).
- El contenedor oculto rompe `test:usability` por desbordamiento horizontal.
- `navigator.share` con files no está disponible y el fallback de descarga falla
  en el navegador objetivo.

## Reporte (al terminar)

```
Misión: 58 — POS ticket como imagen
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: <comprobante solo texto/imprimible → + compartir PNG>
Desviaciones: <ninguna | lista>
Riesgo abierto: <calidad del PNG en Safari iOS | ninguno>
```
