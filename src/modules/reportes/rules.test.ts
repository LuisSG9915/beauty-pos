import { describe, expect, it } from "vitest";

import {
  deltaKpi,
  derivarAvisos,
  derivarCitas,
  derivarReservasWeb,
  derivarVentas,
  escapeCsv,
  etiquetaDelta,
  filaCsv,
  periodoAnterior,
  presetsPeriodo,
} from "./rules";

describe("periodoAnterior", () => {
  it("devuelve el periodo previo de la misma duración", () => {
    // 2026-03-10 → 2026-03-16 son 7 días; el previo es 03-03 → 03-09.
    expect(periodoAnterior("2026-03-10", "2026-03-16")).toEqual({ desde: "2026-03-03", hasta: "2026-03-09" });
  });

  it("maneja rangos de un día", () => {
    expect(periodoAnterior("2026-03-10", "2026-03-10")).toEqual({ desde: "2026-03-09", hasta: "2026-03-09" });
  });

  it("cruza el límite de mes", () => {
    expect(periodoAnterior("2026-03-01", "2026-03-03")).toEqual({ desde: "2026-02-26", hasta: "2026-02-28" });
  });

  it("devuelve null con fechas inválidas o invertidas", () => {
    expect(periodoAnterior("2026-03-16", "2026-03-10")).toBeNull();
    expect(periodoAnterior("no-fecha", "2026-03-10")).toBeNull();
  });
});

describe("presetsPeriodo", () => {
  const presets = presetsPeriodo("2026-03-15");

  it("incluye hoy, ayer, 7d, 30d, este mes y mes pasado", () => {
    expect(presets.map((p) => p.clave)).toEqual(["hoy", "ayer", "7d", "30d", "mes", "mes_previo"]);
  });

  it("7 días termina hoy y empieza hace 6", () => {
    expect(presets.find((p) => p.clave === "7d")).toEqual({ clave: "7d", etiqueta: "7 días", desde: "2026-03-09", hasta: "2026-03-15" });
  });

  it("mes pasado cubre el mes calendario completo", () => {
    expect(presets.find((p) => p.clave === "mes_previo")).toEqual({
      clave: "mes_previo",
      etiqueta: "Mes pasado",
      desde: "2026-02-01",
      hasta: "2026-02-28",
    });
  });

  it("cruza de año en enero", () => {
    const enero = presetsPeriodo("2026-01-10");
    expect(enero.find((p) => p.clave === "mes_previo")?.desde).toBe("2025-12-01");
    expect(enero.find((p) => p.clave === "mes_previo")?.hasta).toBe("2025-12-31");
  });
});

describe("deltaKpi", () => {
  it("calcula valor y porcentaje", () => {
    expect(deltaKpi(1120, 1000)).toEqual({ valor: 120, pct: 12 });
    expect(deltaKpi(900, 1000)).toEqual({ valor: -100, pct: -10 });
  });

  it("sin base cuando el previo es cero", () => {
    expect(deltaKpi(500, 0).pct).toBeNull();
    expect(deltaKpi(0, 0).pct).toBe(0);
  });
});

describe("etiquetaDelta", () => {
  it("formatea el porcentaje con signo", () => {
    expect(etiquetaDelta({ valor: 120, pct: 12 })).toBe("+12% vs periodo anterior");
    expect(etiquetaDelta({ valor: -10, pct: -5 })).toBe("-5% vs periodo anterior");
  });

  it("indica cuando no hay base comparable", () => {
    expect(etiquetaDelta({ valor: 100, pct: null })).toContain("sin base");
  });
});

describe("escapeCsv", () => {
  it("escapa comillas, comas y saltos", () => {
    expect(escapeCsv('dijo "hola", adiós')).toBe('"dijo ""hola"", adiós"');
    expect(escapeCsv("línea1\nlínea2")).toBe('"línea1\nlínea2"');
  });

  it("neutraliza fórmulas de hoja de cálculo", () => {
    expect(escapeCsv("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(escapeCsv("+cmd")).toBe("'+cmd");
    expect(escapeCsv("-10")).toBe("'-10");
    expect(escapeCsv("@mencion")).toBe("'@mencion");
    expect(escapeCsv("  =evil()")).toBe("'  =evil()");
  });

  it("deja intactos valores normales y nulos", () => {
    expect(escapeCsv("Maria")).toBe("Maria");
    expect(escapeCsv(42)).toBe("42");
    expect(escapeCsv(null)).toBe("");
  });
});

describe("filaCsv", () => {
  it("serializa una fila completa", () => {
    expect(filaCsv(["Ana", "=hack", 100, null])).toBe("Ana,'=hack,100,");
  });
});

// ---------------------------------------------------------------------------
// Fixtures financieros — cada KPI contra datos deterministas.
// ---------------------------------------------------------------------------

describe("derivarCitas", () => {
  const fixture = [
    { estado: "completada", total: 8 },
    { estado: "cancelada", total: 1 },
    { estado: "no_asistio", total: 1 },
    { estado: "pendiente", total: 2 },
  ];

  it("suma totales, finalizadas y asistencia", () => {
    const r = derivarCitas(fixture);
    expect(r.totalCitas).toBe(12);
    expect(r.completadas).toBe(8);
    expect(r.finalizadas).toBe(10); // completadas + canceladas + no_asistio
    expect(r.asistencia).toBe(80);
  });

  it("asistencia null sin finalizadas", () => {
    expect(derivarCitas([{ estado: "pendiente", total: 3 }]).asistencia).toBeNull();
    expect(derivarCitas([]).asistencia).toBeNull();
  });
});

describe("derivarVentas", () => {
  const fixture = [
    { dia: "2026-03-01", operaciones: 2, descuentos: "50.00", propinas: "100.00", total: "1000.00" },
    { dia: "2026-03-02", operaciones: 1, descuentos: "0.00", propinas: "50.00", total: "500.00" },
  ];

  it("suma vendido, propinas, operaciones y ticket", () => {
    const r = derivarVentas(fixture);
    expect(r.vendido).toBe(1500);
    expect(r.propinasTotal).toBe(150);
    expect(r.operaciones).toBe(3);
    expect(r.ticketPromedio).toBe(500);
  });

  it("ticket null sin operaciones", () => {
    expect(derivarVentas([]).ticketPromedio).toBeNull();
  });
});

describe("derivarReservasWeb", () => {
  it("solo cuenta el origen web", () => {
    const rows = [
      { origen: "panel", total: 9 },
      { origen: "web", total: 4 },
    ];
    expect(derivarReservasWeb(rows)).toBe(4);
    expect(derivarReservasWeb([{ origen: "panel", total: 9 }])).toBe(0);
  });
});

describe("derivarAvisos", () => {
  it("agrupa estados y suma reintentos", () => {
    const r = derivarAvisos([
      { estado: "enviado", total: 10, reintentos: 0 },
      { estado: "fallido", total: 2, reintentos: 8 },
      { estado: "omitido", total: 3, reintentos: 0 },
      { estado: "pendiente", total: 1, reintentos: 0 },
      { estado: "enviando", total: 1, reintentos: 1 },
    ]);
    expect(r.avisosEnviados).toBe(10);
    expect(r.avisosFallidos).toBe(2);
    expect(r.avisosOmitidos).toBe(3);
    expect(r.avisosPendientes).toBe(2); // pendiente + enviando
    expect(r.avisosReintentos).toBe(9);
  });

  it("devuelve ceros sin avisos", () => {
    const r = derivarAvisos([]);
    expect(r).toEqual({
      avisosEnviados: 0,
      avisosFallidos: 0,
      avisosOmitidos: 0,
      avisosPendientes: 0,
      avisosReintentos: 0,
    });
  });
});
