import { describe, expect, it } from "vitest";

import { formatFolioVenta } from "./format";

describe("formatFolioVenta", () => {
  it("rellena a 4 dígitos sin truncar", () => {
    expect(formatFolioVenta(1)).toBe("0001");
    expect(formatFolioVenta(42)).toBe("0042");
    expect(formatFolioVenta(999)).toBe("0999");
    expect(formatFolioVenta(1000)).toBe("1000");
    expect(formatFolioVenta(12345)).toBe("12345");
  });

  it("acepta el folio como texto numérico", () => {
    expect(formatFolioVenta("42")).toBe("0042");
  });

  it("devuelve — para ventas sin folio", () => {
    expect(formatFolioVenta(null)).toBe("—");
    expect(formatFolioVenta(undefined)).toBe("—");
    expect(formatFolioVenta("")).toBe("—");
    expect(formatFolioVenta("abc")).toBe("—");
  });
});
