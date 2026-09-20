import { describe, expect, it } from "vitest";

import { debeEnviarRecordatorio, horasAntesValidas, type CitaParaRecordatorio } from "./rules";

const ahora = new Date("2026-02-10T15:00:00Z");

function cita(overrides: Partial<CitaParaRecordatorio> = {}): CitaParaRecordatorio {
  return {
    id: "c1",
    // exactamente 24 h después → dentro de la ventana
    fechaHora: new Date("2026-02-11T15:00:00Z"),
    estado: "confirmada",
    activo: true,
    correoCliente: "cliente@correo.com",
    yaEnviada: false,
    ...overrides,
  };
}

describe("debeEnviarRecordatorio", () => {
  it("envía cuando la cita cae en la ventana de horasAntes", () => {
    expect(debeEnviarRecordatorio(cita(), { ahora, horasAntes: 24 })).toBe(true);
  });

  it("no envía fuera de la ventana", () => {
    const lejos = cita({ fechaHora: new Date("2026-02-11T20:00:00Z") });
    expect(debeEnviarRecordatorio(lejos, { ahora, horasAntes: 24 })).toBe(false);
  });

  it("respeta el margen del cron", () => {
    const borde = cita({ fechaHora: new Date("2026-02-11T15:29:00Z") });
    expect(debeEnviarRecordatorio(borde, { ahora, horasAntes: 24 })).toBe(true);
    const fuera = cita({ fechaHora: new Date("2026-02-11T15:31:00Z") });
    expect(debeEnviarRecordatorio(fuera, { ahora, horasAntes: 24 })).toBe(false);
  });

  it("omite canceladas, sin correo, inactivas o ya enviadas", () => {
    expect(debeEnviarRecordatorio(cita({ estado: "cancelada" }), { ahora, horasAntes: 24 })).toBe(false);
    expect(debeEnviarRecordatorio(cita({ estado: "completada" }), { ahora, horasAntes: 24 })).toBe(false);
    expect(debeEnviarRecordatorio(cita({ correoCliente: null }), { ahora, horasAntes: 24 })).toBe(false);
    expect(debeEnviarRecordatorio(cita({ activo: false }), { ahora, horasAntes: 24 })).toBe(false);
    expect(debeEnviarRecordatorio(cita({ yaEnviada: true }), { ahora, horasAntes: 24 })).toBe(false);
  });
});

describe("horasAntesValidas", () => {
  it("acepta 1–168 horas", () => {
    expect(horasAntesValidas(24)).toBe(true);
    expect(horasAntesValidas(1)).toBe(true);
    expect(horasAntesValidas(168)).toBe(true);
  });

  it("rechaza valores fuera de rango o no enteros", () => {
    expect(horasAntesValidas(0)).toBe(false);
    expect(horasAntesValidas(169)).toBe(false);
    expect(horasAntesValidas(1.5)).toBe(false);
  });
});
