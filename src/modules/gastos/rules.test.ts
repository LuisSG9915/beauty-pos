import { describe, expect, it } from "vitest";

import { afectaCaja, puedeRevertir, validarGastoInput } from "./rules";

describe("afectaCaja", () => {
  it("solo el efectivo mueve el cajón", () => {
    expect(afectaCaja("efectivo")).toBe(true);
    expect(afectaCaja("tarjeta")).toBe(false);
    expect(afectaCaja("transferencia")).toBe(false);
    expect(afectaCaja("wallet")).toBe(false);
  });
});

describe("puedeRevertir", () => {
  it("solo se revierte un gasto confirmado", () => {
    expect(puedeRevertir("confirmado")).toBe(true);
    expect(puedeRevertir("revertido")).toBe(false);
  });
});

describe("validarGastoInput", () => {
  const valido = { concepto: "Renta del local", importe: 5000, fechaGasto: "2026-03-01" };

  it("acepta un gasto bien formado", () => {
    expect(validarGastoInput(valido)).toBeNull();
  });

  it("rechaza concepto vacío", () => {
    expect(validarGastoInput({ ...valido, concepto: "   " })).toContain("concepto");
  });

  it("rechaza importes no positivos o inválidos", () => {
    expect(validarGastoInput({ ...valido, importe: 0 })).toContain("importe");
    expect(validarGastoInput({ ...valido, importe: -10 })).toContain("importe");
    expect(validarGastoInput({ ...valido, importe: Number.NaN })).toContain("importe");
  });

  it("rechaza fecha con formato inválido", () => {
    expect(validarGastoInput({ ...valido, fechaGasto: "01/03/2026" })).toContain("fecha");
    expect(validarGastoInput({ ...valido, fechaGasto: "" })).toContain("fecha");
  });
});
