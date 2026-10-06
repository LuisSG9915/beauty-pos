import { describe, expect, it } from "vitest";

import { PX_PER_MIN } from "./agenda-types";
import { etiquetaMinuto, layoutCitas, minutoDesdeY, pad2 } from "./agenda-utils";

describe("pad2", () => {
  it("rellena a dos dígitos", () => {
    expect(pad2(0)).toBe("00");
    expect(pad2(7)).toBe("07");
    expect(pad2(59)).toBe("59");
  });
});

describe("etiquetaMinuto", () => {
  it("formatea minutos del día como HH:MM", () => {
    expect(etiquetaMinuto(0)).toBe("00:00");
    expect(etiquetaMinuto(9 * 60 + 30)).toBe("09:30");
    expect(etiquetaMinuto(23 * 60 + 45)).toBe("23:45");
  });
});

describe("minutoDesdeY", () => {
  const startMin = 8 * 60; // 08:00
  const endMin = 21 * 60; // 21:00

  it("devuelve startMin cuando el puntero está en el tope de la columna", () => {
    expect(minutoDesdeY(100, 100, startMin, endMin, 60)).toBe(startMin);
  });

  it("redondea a bloques de 15 minutos", () => {
    // 7 minutos después de startMin → sigue en startMin.
    const yCasi15 = 100 + 22 * PX_PER_MIN;
    expect(minutoDesdeY(yCasi15, 100, startMin, endMin, 60)).toBe(startMin + 15);
    // 4 minutos → baja a startMin (4 < 7.5).
    const y4 = 100 + 4 * PX_PER_MIN;
    expect(minutoDesdeY(y4, 100, startMin, endMin, 60)).toBe(startMin);
  });

  it("acota el fin para que la duración completa quepa en el día", () => {
    const yFondo = 100 + (endMin - startMin) * PX_PER_MIN + 500;
    expect(minutoDesdeY(yFondo, 100, startMin, endMin, 60)).toBe(endMin - 60);
    expect(minutoDesdeY(yFondo, 100, startMin, endMin, 15)).toBe(endMin - 15);
  });

  it("acota valores negativos a startMin", () => {
    expect(minutoDesdeY(0, 100, startMin, endMin, 60)).toBe(startMin);
  });
});

describe("layoutCitas", () => {
  const cita = (id: string, iso: string, duracion: number) => ({
    id,
    fechaHora: iso,
    duracionMinutos: duracion,
    estado: "pendiente",
    notas: null,
    totalEstimado: "0",
    clienteId: null,
    clienteNombre: "Cliente",
    clienteTelefono: null,
    clienteNotas: null,
    sucursalId: "suc",
    usuarioId: "u1",
    usuarioNombre: "Pro",
    version: 1,
    ventaId: null,
    servicios: [],
    recursos: [],
  });

  const zona = "America/Mexico_City";
  // 2025-01-06 10:00/10:30/11:00 locales → UTC (-06:00).
  const base = "2025-01-06T16:00:00Z";

  it("cita sola ocupa un carril completo", () => {
    const layout = layoutCitas([cita("a", base, 60)], zona);
    expect(layout.get("a")).toEqual({ lane: 0, lanes: 1 });
  });

  it("citas traslapadas reciben carriles distintos", () => {
    const layout = layoutCitas(
      [
        cita("a", base, 60),
        cita("b", "2025-01-06T16:30:00Z", 60),
      ],
      zona,
    );
    expect(layout.get("a")?.lanes).toBe(2);
    expect(layout.get("b")?.lanes).toBe(2);
    expect(layout.get("a")?.lane).not.toBe(layout.get("b")?.lane);
  });

  it("citas que se tocan en el borde NO se traslapan", () => {
    const layout = layoutCitas(
      [
        cita("a", base, 60),
        cita("b", "2025-01-06T17:00:00Z", 60),
      ],
      zona,
    );
    expect(layout.get("a")?.lanes).toBe(1);
    expect(layout.get("b")?.lanes).toBe(1);
  });
});
