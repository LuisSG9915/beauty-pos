import { describe, expect, it } from "vitest";

import {
  enlaceWhatsApp,
  normalizarTelefonoWhatsApp,
  textoTicketWhatsApp,
} from "./whatsapp";

describe("normalizarTelefonoWhatsApp", () => {
  it("10 dígitos mexicanos → antepone 52", () => {
    expect(normalizarTelefonoWhatsApp("55 1234 5678")).toBe("525512345678");
    expect(normalizarTelefonoWhatsApp("5512345678")).toBe("525512345678");
  });

  it("formatos mexicanos con prefijo se compactan a 52 + 10 dígitos", () => {
    expect(normalizarTelefonoWhatsApp("+52 1 55 1234 5678")).toBe("525512345678");
    expect(normalizarTelefonoWhatsApp("5215512345678")).toBe("525512345678");
    expect(normalizarTelefonoWhatsApp("044 55 1234 5678")).toBe("525512345678");
    expect(normalizarTelefonoWhatsApp("0455512345678")).toBe("525512345678");
    expect(normalizarTelefonoWhatsApp("0052 55 1234 5678")).toBe("525512345678");
  });

  it("números extranjeros conservan su código de país", () => {
    expect(normalizarTelefonoWhatsApp("+34 612 345 678")).toBe("34612345678");
    expect(normalizarTelefonoWhatsApp("1 415 555 2671")).toBe("14155552671");
  });

  it("número ya internacional de 12 dígitos se respeta", () => {
    expect(normalizarTelefonoWhatsApp("525512345678")).toBe("525512345678");
  });

  it("vacío, basura y longitudes inválidas → null", () => {
    expect(normalizarTelefonoWhatsApp("")).toBeNull();
    expect(normalizarTelefonoWhatsApp(null)).toBeNull();
    expect(normalizarTelefonoWhatsApp(undefined)).toBeNull();
    expect(normalizarTelefonoWhatsApp("abc")).toBeNull();
    expect(normalizarTelefonoWhatsApp("12345")).toBeNull();
    expect(normalizarTelefonoWhatsApp("1".repeat(16))).toBeNull();
  });
});

describe("enlaceWhatsApp", () => {
  it("arma wa.me con número normalizado y texto codificado", () => {
    const href = enlaceWhatsApp({ telefono: "55 1234 5678", texto: "Hola *cliente*" });
    expect(href).toBe(`https://wa.me/525512345678?text=${encodeURIComponent("Hola *cliente*")}`);
  });

  it("sin teléfono válido ofrece elegir chat", () => {
    expect(enlaceWhatsApp({ telefono: "", texto: "hola" })).toBe(
      `https://wa.me/?text=${encodeURIComponent("hola")}`,
    );
    expect(enlaceWhatsApp({ telefono: null })).toBe("https://wa.me/");
  });
});

describe("textoTicketWhatsApp", () => {
  it("incluye negocio, fecha, conceptos, total y pago sin rutas internas", () => {
    const texto = textoTicketWhatsApp({
      negocio: "Estética Prueba",
      fecha: "2026-02-10T18:30:00Z",
      cliente: "María López",
      lineas: [
        { nombre: "Corte", cantidad: 1 },
        { nombre: "Tinte", cantidad: 2 },
      ],
      total: "850.00",
      pagos: [{ nombre: "Efectivo", monto: "1000.00" }],
      moneda: "MXN",
    });
    expect(texto).toContain("*Estética Prueba* · Ticket de venta");
    expect(texto).toContain("Cliente: María López");
    expect(texto).toContain("Conceptos: Corte, 2x Tinte");
    expect(texto).toContain("Total: $850.00");
    expect(texto).toContain("Pago: Efectivo $1,000.00");
    expect(texto).not.toContain("/admin/");
  });
});
