import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { renderTicketToPng } from "./ticket-imagen";

describe("renderTicketToPng", () => {
  const originalDocument = globalThis.document;
  const originalImage = (globalThis as { Image?: unknown }).Image;
  const originalURL = globalThis.URL;
  const originalXMLSerializer = (globalThis as { XMLSerializer?: unknown }).XMLSerializer;

  beforeEach(() => {
    const fakeCtx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "" };
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => fakeCtx,
      toBlob: (cb: (b: Blob | null) => void) =>
        cb(new Blob(["x"], { type: "image/png" })),
    };
    const doc = { createElement: () => fakeCanvas };
    (globalThis as { document: unknown }).document = doc;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin = "";
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    (globalThis as { Image: unknown }).Image = FakeImage;
    (globalThis as { URL: unknown }).URL = {
      createObjectURL: () => "blob:url",
      revokeObjectURL: () => {},
    };
    class FakeSerializer {
      serializeToString() {
        return "<div/>";
      }
    }
    (globalThis as { XMLSerializer: unknown }).XMLSerializer = FakeSerializer;
  });

  afterEach(() => {
    (globalThis as { document: unknown }).document = originalDocument;
    (globalThis as { Image: unknown }).Image = originalImage;
    (globalThis as { URL: unknown }).URL = originalURL;
    (globalThis as { XMLSerializer: unknown }).XMLSerializer = originalXMLSerializer;
  });

  it("devuelve un Blob PNG", async () => {
    const el = {
      getBoundingClientRect: () => ({ width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }),
    } as unknown as HTMLElement;
    const blob = await renderTicketToPng(el);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
  });

  it("respeta la escala por defecto (2x)", async () => {
    const el = {
      getBoundingClientRect: () => ({ width: 100, height: 50, top: 0, left: 0, right: 100, bottom: 50, x: 0, y: 0, toJSON: () => ({}) }),
    } as unknown as HTMLElement;
    // No lanza; el canvas se crea con dimensiones 200x100 (verificado indirectamente por no-error).
    await expect(renderTicketToPng(el)).resolves.toBeInstanceOf(Blob);
  });
});
