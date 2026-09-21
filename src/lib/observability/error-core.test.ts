import { describe, expect, it } from "vitest";

import {
  calcularPrioridad,
  fingerprintDe,
  sanitizarStack,
  sanitizarTexto,
} from "./error-core";

describe("sanitizarTexto", () => {
  it("redacta correos, teléfonos, UUIDs y secretos", () => {
    const texto =
      "Error para ana@salon.mx tel 55 1234 5678 id 8f3a2b1c-4d5e-4f6a-9b8c-0d1e2f3a4b5c token=abc123";
    const limpio = sanitizarTexto(texto);
    expect(limpio).not.toContain("ana@salon.mx");
    expect(limpio).not.toContain("1234");
    expect(limpio).not.toContain("8f3a2b1c");
    expect(limpio).not.toContain("abc123");
    expect(limpio).toContain("[correo]");
    expect(limpio).toContain("[id]");
    expect(limpio).toContain("[tel]");
    expect(limpio).toContain("token=[redactado]");
  });

  it("quita query strings", () => {
    expect(sanitizarTexto("GET /api/clientes?nombre=Maria")).not.toContain("Maria");
  });

  it("trunca a 500 caracteres por defecto", () => {
    expect(sanitizarTexto("x".repeat(2000)).length).toBe(500);
  });
});

describe("sanitizarStack", () => {
  it("conserva frames de la app y limita la longitud", () => {
    const stack = [
      "TypeError: x is undefined",
      "    at cobrar (https://app.example.com/_next/static/chunks/src/app/admin/pos/actions.ts?x=1:2:3)",
      ...Array.from({ length: 30 }, (_, i) => `    at fn${i} (https://a/b/c.js:${i}:1)`),
    ].join("\n");
    const limpio = sanitizarStack(stack);
    expect(limpio.split("\n").length).toBeLessThanOrEqual(12);
    expect(limpio).toContain("/src/");
    expect(limpio).not.toContain("?x=1");
  });
});

describe("fingerprintDe", () => {
  const base = {
    fuente: "client" as const,
    tipo: "TypeError",
    mensaje: "x is undefined",
    stack: "Error\n    at cobrar (/src/app/admin/pos/actions.ts:10:5)",
    ruta: "/admin/pos",
  };

  it("agrupa el mismo error aunque cambie el UUID de la ruta", () => {
    const a = fingerprintDe({ ...base, ruta: "/admin/clientes/8f3a2b1c-4d5e-4f6a-9b8c-0d1e2f3a4b5c" });
    const b = fingerprintDe({ ...base, ruta: "/admin/clientes/11111111-2222-3333-4444-555555555555" });
    expect(a).toBe(b);
  });

  it("distingue fuentes y tipos distintos", () => {
    expect(fingerprintDe(base)).not.toBe(fingerprintDe({ ...base, fuente: "server" }));
    expect(fingerprintDe(base)).not.toBe(fingerprintDe({ ...base, tipo: "RangeError" }));
  });
});

describe("calcularPrioridad", () => {
  it("p0: error masivo en flujo crítico", () => {
    expect(
      calcularPrioridad({
        fuente: "server_action",
        modulo: "pos",
        ocurrencias24h: 60,
        organizaciones: 6,
      }),
    ).toBe("p0");
  });

  it("p3: error aislado de navegador en módulo menor", () => {
    expect(
      calcularPrioridad({
        fuente: "client",
        modulo: "otro",
        ocurrencias24h: 1,
        organizaciones: 0,
      }),
    ).toBe("p3");
  });

  it("p2: frecuencia media en módulo crítico", () => {
    expect(
      calcularPrioridad({
        fuente: "client",
        modulo: "agenda",
        ocurrencias24h: 15,
        organizaciones: 1,
      }),
    ).toBe("p2");
  });
});
