import { describe, expect, it } from "vitest";

import {
  calcularSegundosRestantes,
  crearPoseTimer,
  formatearTiempoRestante,
} from "./temporizador";

describe("agenda / temporizador", () => {
  it("crea un temporizador de pose con timestamps precisos", () => {
    const baseNow = 1700000000000;
    const timer = crearPoseTimer({
      citaId: "cita-123",
      clienteNombre: "Laura González",
      servicioNombre: "Balayage Rubia",
      minutos: 35,
      nowMs: baseNow,
    });

    expect(timer.citaId).toBe("cita-123");
    expect(timer.clienteNombre).toBe("Laura González");
    expect(timer.minutosTotales).toBe(35);
    expect(timer.iniciaAt).toBe(baseNow);
    expect(timer.terminaAt).toBe(baseNow + 35 * 60 * 1000);
    expect(timer.completado).toBe(false);
  });

  it("calcula segundos restantes dinámicamente", () => {
    const baseNow = 1700000000000;
    const timer = crearPoseTimer({
      citaId: "cita-123",
      clienteNombre: "Laura",
      servicioNombre: "Tinte",
      minutos: 10,
      nowMs: baseNow,
    });

    // A los 4 minutos transcurridos quedan 6 minutos = 360 segundos
    const restante = calcularSegundosRestantes(timer, baseNow + 4 * 60 * 1000);
    expect(restante).toBe(360);

    // Cuando el tiempo se agota
    const expirado = calcularSegundosRestantes(timer, baseNow + 11 * 60 * 1000);
    expect(expirado).toBe(0);
  });

  it("formatea segundos restantes a formato mm:ss", () => {
    expect(formatearTiempoRestante(360)).toBe("06:00");
    expect(formatearTiempoRestante(45)).toBe("00:45");
    expect(formatearTiempoRestante(0)).toBe("00:00");
    expect(formatearTiempoRestante(2105)).toBe("35:05");
  });
});
