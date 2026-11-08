/**
 * Generación de imagen (PNG) de un nodo DOM del comprobante.
 *
 * No usa dependencias externas: serializa el nodo a SVG `<foreignObject>`,
 * lo rasteriza en un `<canvas>` (escala 2x) y devuelve un `Blob` PNG.
 *
 * El nodo debe estar **renderizado** (no `display: none`) y llevar sus estilos
 * en atributos `style` inline, porque el SVG se rasteriza en un documento
 * independiente y no hereda el CSS del documento padre (ni clases Tailwind).
 */
export type TicketImagenOpciones = {
  /** Factor de escala para nitidez (default 2). */
  escala?: number;
};

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

  const serializado = new XMLSerializer().serializeToString(elemento);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}"><foreignObject width="100%" height="100%">${serializado}</foreignObject></svg>`;

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const imagen = new Image();
  imagen.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    imagen.onload = () => resolve();
    imagen.onerror = () => reject(new Error("No se pudo rasterizar el comprobante"));
    imagen.src = url;
  });

  const canvas = document.createElement("canvas") as HTMLCanvasElement;
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(url);
    throw new Error("Canvas no soportado en este navegador");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  URL.revokeObjectURL(url);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar el PNG del comprobante"));
    }, "image/png");
  });
}
