import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { renderTicketToPng, TicketImagenError } from "./ticket-imagen";

describe("renderTicketToPng", () => {
  const originalDocument = globalThis.document;
  const originalImage = (globalThis as { Image?: unknown }).Image;
  const originalXMLSerializer = (globalThis as { XMLSerializer?: unknown }).XMLSerializer;

  let ultimaSrcImagen = "";
  let nodoSerializado: { style?: Record<string, string> } | null = null;
  let canvasSinContexto = false;

  const rectDe = (width: number, height: number) =>
    ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  /** Elemento falso que imita al contenedor de captura fuera de pantalla. */
  function elementoFalso(width = 100, height = 50) {
    return {
      style: { position: "absolute", left: "-9999px", top: "0px" },
      getBoundingClientRect: () => rectDe(width, height),
      cloneNode() {
        return {
          style: { position: "absolute", left: "-9999px", top: "0px" },
        };
      },
    } as unknown as HTMLElement;
  }

  beforeEach(() => {
    ultimaSrcImagen = "";
    nodoSerializado = null;
    canvasSinContexto = false;
    const fakeCtx = {
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      fillStyle: "",
    };
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => (canvasSinContexto ? null : fakeCtx),
      toBlob: (cb: (b: Blob | null) => void) =>
        cb(new Blob(["x"], { type: "image/png" })),
    };
    (globalThis as { document: unknown }).document = {
      createElement: () => fakeCanvas,
    };
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(v: string) {
        ultimaSrcImagen = v;
        setTimeout(() => this.onload?.(), 0);
      }
    }
    (globalThis as { Image: unknown }).Image = FakeImage;
    class FakeSerializer {
      serializeToString(node: { style?: Record<string, string> }) {
        nodoSerializado = node;
        return "<div/>";
      }
    }
    (globalThis as { XMLSerializer: unknown }).XMLSerializer = FakeSerializer;
  });

  afterEach(() => {
    (globalThis as { document: unknown }).document = originalDocument;
    (globalThis as { Image: unknown }).Image = originalImage;
    (globalThis as { XMLSerializer: unknown }).XMLSerializer = originalXMLSerializer;
  });

  it("devuelve un Blob PNG", async () => {
    const blob = await renderTicketToPng(elementoFalso());
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
  });

  it("carga el SVG con URL data: (no blob: que contamina el canvas)", async () => {
    await renderTicketToPng(elementoFalso());
    expect(ultimaSrcImagen.startsWith("data:image/svg+xml")).toBe(true);
    expect(ultimaSrcImagen).not.toContain("blob:");
  });

  it("serializa un clon sin la posición fuera de pantalla", async () => {
    await renderTicketToPng(elementoFalso());
    expect(nodoSerializado?.style?.position).toBe("static");
    expect(nodoSerializado?.style?.left).toBe("0");
    expect(nodoSerializado?.style?.top).toBe("0");
  });

  it("el SVG lleva viewBox en px CSS y tamaño de dispositivo 2x", async () => {
    await renderTicketToPng(elementoFalso(100, 50));
    const svg = decodeURIComponent(ultimaSrcImagen);
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="100"');
    expect(svg).toContain('viewBox="0 0 100 50"');
  });

  it("respeta la escala personalizada", async () => {
    await renderTicketToPng(elementoFalso(100, 50), { escala: 3 });
    const svg = decodeURIComponent(ultimaSrcImagen);
    expect(svg).toContain('width="300"');
    expect(svg).toContain('viewBox="0 0 100 50"');
  });

  it("sin contexto de canvas rechaza con error claro", async () => {
    canvasSinContexto = true;
    await expect(renderTicketToPng(elementoFalso())).rejects.toBeInstanceOf(
      TicketImagenError,
    );
  });
});
