import { describe, expect, it } from "vitest";

import {
  diasRestantesTrial,
  esPermisoSoloLectura,
  estadoEfectivoSuscripcion,
} from "./rules";

const ahora = new Date("2026-01-15T12:00:00Z");

describe("estadoEfectivoSuscripcion", () => {
  it("sin suscripción sigue vigente (organizaciones históricas)", () => {
    expect(estadoEfectivoSuscripcion(null, ahora)).toBe("vigente");
    expect(estadoEfectivoSuscripcion(undefined, ahora)).toBe("vigente");
  });

  it("trial vigente hasta trial_termina_at", () => {
    const sus = { estado: "trialing", trialTerminaAt: new Date("2026-01-20T00:00:00Z"), periodoTerminaAt: null };
    expect(estadoEfectivoSuscripcion(sus, ahora)).toBe("vigente");
    expect(estadoEfectivoSuscripcion(sus, new Date("2026-01-21T00:00:00Z"))).toBe("vencida");
  });

  it("trial sin fecha de término queda vencido", () => {
    expect(estadoEfectivoSuscripcion({ estado: "trialing", trialTerminaAt: null, periodoTerminaAt: null }, ahora)).toBe("vencida");
  });

  it("activa sin corte de periodo sigue vigente; con corte pasado vence", () => {
    expect(estadoEfectivoSuscripcion({ estado: "activa", trialTerminaAt: null, periodoTerminaAt: null }, ahora)).toBe("vigente");
    const vencida = { estado: "activa", trialTerminaAt: null, periodoTerminaAt: new Date("2026-01-10T00:00:00Z") };
    expect(estadoEfectivoSuscripcion(vencida, ahora)).toBe("vencida");
  });

  it("past_due respeta el periodo como gracia", () => {
    const grace = { estado: "past_due", trialTerminaAt: null, periodoTerminaAt: new Date("2026-01-20T00:00:00Z") };
    expect(estadoEfectivoSuscripcion(grace, ahora)).toBe("vigente");
  });

  it("cancelada y vencida quedan vencidas", () => {
    const base = { trialTerminaAt: null, periodoTerminaAt: null };
    expect(estadoEfectivoSuscripcion({ ...base, estado: "cancelada" }, ahora)).toBe("vencida");
    expect(estadoEfectivoSuscripcion({ ...base, estado: "vencida" }, ahora)).toBe("vencida");
  });
});

describe("diasRestantesTrial", () => {
  it("cuenta días restantes del trial", () => {
    const sus = { estado: "trialing", trialTerminaAt: new Date("2026-01-20T00:00:00Z"), periodoTerminaAt: null };
    expect(diasRestantesTrial(sus, ahora)).toBe(5);
  });

  it("devuelve 0 cuando ya pasó y null si no aplica", () => {
    expect(diasRestantesTrial({ estado: "trialing", trialTerminaAt: new Date("2026-01-01"), periodoTerminaAt: null }, ahora)).toBe(0);
    expect(diasRestantesTrial({ estado: "activa", trialTerminaAt: null, periodoTerminaAt: null }, ahora)).toBeNull();
    expect(diasRestantesTrial(null, ahora)).toBeNull();
  });
});

describe("esPermisoSoloLectura", () => {
  it("permite lecturas y reportes", () => {
    expect(esPermisoSoloLectura("ventas.ver")).toBe(true);
    expect(esPermisoSoloLectura("reportes.operativos")).toBe(true);
    expect(esPermisoSoloLectura("reportes.financieros")).toBe(true);
  });

  it("bloquea escrituras", () => {
    expect(esPermisoSoloLectura("ventas.cobrar")).toBe(false);
    expect(esPermisoSoloLectura("citas.editar")).toBe(false);
    expect(esPermisoSoloLectura("gastos.editar")).toBe(false);
  });
});
