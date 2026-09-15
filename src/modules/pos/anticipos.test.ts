import { describe, expect, it } from "vitest";

import { anticiposAplicables } from "@/modules/pos/anticipos";

const ant = (monto: number | string) => ({ monto });

describe("anticiposAplicables", () => {
  it("aplica un anticipo que cabe completo", () => {
    const { aplicados, suma } = anticiposAplicables([ant(100)], 300);
    expect(aplicados).toHaveLength(1);
    expect(suma).toBe(100);
  });

  it("aplica varios anticipos en orden mientras quepan contra el total", () => {
    const { aplicados, suma } = anticiposAplicables([ant(100), ant(150), ant(100)], 300);
    // 100 + 150 = 250 caben; el tercero (100) excedería 300 → queda vigente.
    expect(aplicados).toHaveLength(2);
    expect(suma).toBe(250);
  });

  it("un anticipo mayor al total no se aplica (queda vigente)", () => {
    const { aplicados, suma } = anticiposAplicables([ant(500)], 300);
    expect(aplicados).toHaveLength(0);
    expect(suma).toBe(0);
  });

  it("anticipo exacto cubre todo el total (cobro a $0)", () => {
    const { aplicados, suma } = anticiposAplicables([ant(300)], 300);
    expect(suma).toBe(300);
    expect(aplicados).toHaveLength(1);
  });

  it("respeta el orden de creación: el primero entra aunque el segundo no", () => {
    const { aplicados, suma } = anticiposAplicables([ant(200), ant(200), ant(100)], 300);
    // primero 200 cabe; segundo 200 no; tercero 100 sí → 200 + 100.
    expect(suma).toBe(300);
    expect(aplicados).toHaveLength(2);
  });

  it("sin anticipos vigentes la suma es cero", () => {
    const { aplicados, suma } = anticiposAplicables([], 300);
    expect(aplicados).toHaveLength(0);
    expect(suma).toBe(0);
  });
});
