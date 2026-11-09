/**
 * Generación de imagen (PNG) de un nodo DOM del comprobante.
 *
 * No usa dependencias externas: serializa el nodo a SVG `<foreignObject>`,
 * lo rasteriza en un `<canvas>` (escala 2x) y devuelve un `Blob` PNG.
 *
 * El nodo debe estar **renderizado** (no `display: none`) y llevar sus estilos
 * en atributos `style` inline, porque el SVG se rasteriza en un documento
 * independiente y no hereda el CSS del documento padre (ni clases Tailwind).
 *
 * Detalles verificados en Chrome 153 (origen http):
 * - La imagen del SVG se carga con URL `data:` — `blob:` contamina el canvas
 *   (`toBlob`/`getImageData` lanzan SecurityError, igual que en WebKit).
 * - Se serializa un CLON sin `position/left/top`: el original vive fuera de
 *   pantalla (`left:-9999px`) y dentro del foreignObject quedaría desplazado
 *   → lienzo en blanco.
 * - El SVG lleva `viewBox` en px CSS con `width/height` en px de dispositivo:
 *   sin él la escala 2x no escala y el texto sale diminuto.
 */
export type TicketImagenOpciones = {
  /** Factor de escala para nitidez (default 2). */
  escala?: number;
};

export class TicketImagenError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "TicketImagenError";
  }
}

export async function renderTicketToPng(
  elemento: HTMLElement,
  opciones?: TicketImagenOpciones,
): Promise<Blob> {
  const escala = opciones?.escala ?? 2;
  const rect = elemento.getBoundingClientRect();
  const anchoBase = rect.width > 0 ? rect.width : 320;
  const altoBase = rect.height > 0 ? rect.height : 100;
  const ancho = Math.round(anchoBase * escala);
  const alto = Math.round(altoBase * escala);

  const clon = elemento.cloneNode(true) as HTMLElement;
  clon.style.position = "static";
  clon.style.left = "0";
  clon.style.top = "0";
  const serializado = new XMLSerializer().serializeToString(clon);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" ` +
    `viewBox="0 0 ${anchoBase} ${altoBase}">` +
    `<foreignObject width="100%" height="100%">${serializado}</foreignObject></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const imagen = new Image();
  imagen.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    imagen.onload = () => resolve();
    imagen.onerror = () =>
      reject(new TicketImagenError("No se pudo rasterizar el comprobante"));
    imagen.src = url;
  });

  const canvas = document.createElement("canvas") as HTMLCanvasElement;
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new TicketImagenError("Canvas no soportado en este navegador");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(imagen, 0, 0, ancho, alto);

  // Sonda de 1 px: si el canvas quedó contaminado, getImageData lanza
  // SecurityError y toBlob devolvería null — mejor fallar con mensaje claro.
  try {
    ctx.getImageData(0, 0, 1, 1);
  } catch {
    throw new TicketImagenError("No se pudo leer el comprobante generado");
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new TicketImagenError("No se pudo generar el PNG del comprobante"));
    }, "image/png");
  });
}
