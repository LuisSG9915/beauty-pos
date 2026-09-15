import { describe, expect, it } from "vitest";

import { conAlergias } from "./alergias";

describe("conAlergias", () => {
  it("devuelve las notas originales cuando no hay alergias", () => {
    expect(conAlergias("prefiere productos suaves", undefined)).toBe("prefiere productos suaves");
    expect(conAlergias(null, undefined)).toBeNull();
  });

  it("anexa el aviso de alergias a las notas existentes", () => {
    expect(conAlergias("cliente puntual", "níquel · látex")).toBe("cliente puntual\nAlergias: níquel · látex");
  });

  it("crea el aviso cuando no hay notas operativas", () => {
    expect(conAlergias(null, "peróxido")).toBe("Alergias: peróxido");
    expect(conAlergias("", "peróxido")).toBe("Alergias: peróxido");
  });
});
