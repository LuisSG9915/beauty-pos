import { beforeEach, describe, expect, it, vi } from "vitest";

// El plan de la org se controla por prueba; la tabla `uso_ia` se simula con
// un stub de `db.execute` (upsert + suma del mes).
const { estado } = vi.hoisted(() => ({
  estado: { planClave: "esencial" as string | null },
}));

vi.mock("@/modules/billing/queries", () => ({
  contextoSuscripcionCache: vi.fn(async () => ({
    plan: estado.planClave ? { clave: estado.planClave } : null,
  })),
}));

import {
  consumirCuotaIa,
  LIMITE_IA_MENSUAL,
  limiteIaMensual,
  mesActualUtc,
} from "@/lib/ia/uso";

function dbConTotal(total: number) {
  return {
    execute: vi
      .fn()
      // 1ª llamada: upsert del contador (sin filas devueltas).
      .mockResolvedValueOnce({ rows: [] })
      // 2ª llamada: suma del mes.
      .mockResolvedValueOnce({ rows: [{ total }] }),
  } as unknown as Parameters<typeof consumirCuotaIa>[0];
}

describe("limiteIaMensual", () => {
  it("usa los límites del plan 08 por nivel de plan", () => {
    expect(LIMITE_IA_MENSUAL).toEqual({
      esencial: 30,
      crecimiento: 300,
      profesional: 1000,
    });
    expect(limiteIaMensual("esencial")).toBe(30);
    expect(limiteIaMensual("crecimiento")).toBe(300);
    expect(limiteIaMensual("profesional")).toBe(1000);
  });

  it("cae en el límite de esencial sin plan o con clave desconocida", () => {
    expect(limiteIaMensual(null)).toBe(30);
    expect(limiteIaMensual(undefined)).toBe(30);
    expect(limiteIaMensual("inexistente")).toBe(30);
  });
});

describe("mesActualUtc", () => {
  it("devuelve el primer día del mes UTC", () => {
    expect(mesActualUtc(new Date("2026-03-15T23:59:00Z"))).toBe("2026-03-01");
    expect(mesActualUtc(new Date("2026-12-01T00:00:00Z"))).toBe("2026-12-01");
  });
});

describe("consumirCuotaIa", () => {
  beforeEach(() => {
    estado.planClave = "esencial";
  });

  it("permite cuando la suma del mes no supera el límite", async () => {
    const db = dbConTotal(30);
    const resultado = await consumirCuotaIa(db, "org-1", "producto");
    expect(resultado).toEqual({ ok: true });
    expect((db.execute as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2);
  });

  it("rechaza (429) cuando la suma del mes supera el límite del plan", async () => {
    const db = dbConTotal(31);
    const resultado = await consumirCuotaIa(db, "org-1", "producto");
    expect(resultado).toEqual({ ok: false, limite: 30 });
  });

  it("aplica el límite del plan vigente (profesional)", async () => {
    estado.planClave = "profesional";
    const db = dbConTotal(400);
    const resultado = await consumirCuotaIa(db, "org-1", "ticket");
    expect(resultado).toEqual({ ok: true });
  });

  it("sin plan vigente usa el límite de esencial", async () => {
    estado.planClave = null;
    const db = dbConTotal(31);
    const resultado = await consumirCuotaIa(db, "org-1", "producto");
    expect(resultado).toEqual({ ok: false, limite: 30 });
  });
});
