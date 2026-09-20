import { describe, expect, it } from "vitest";

import { CAPACIDADES, PLANES_CATALOGO, planCatalogoPorClave, type CapacidadClave } from "./capacidades";
import { tieneCapacidad, type ContextoSuscripcion } from "./queries";

const claves = new Set(Object.keys(CAPACIDADES));

describe("catálogo de planes", () => {
  it("solo usa capacidades válidas del catálogo", () => {
    for (const plan of PLANES_CATALOGO) {
      for (const cap of plan.capacidades) {
        expect(claves.has(cap), `${plan.clave} usa capacidad desconocida: ${cap}`).toBe(true);
      }
    }
  });

  it("Crecimiento incluye todo lo de Esencial y Profesional todo lo de Crecimiento", () => {
    const esencial = planCatalogoPorClave("esencial")!;
    const crecimiento = planCatalogoPorClave("crecimiento")!;
    const profesional = planCatalogoPorClave("profesional")!;
    for (const cap of esencial.capacidades) {
      expect(crecimiento.capacidades).toContain(cap);
    }
    for (const cap of crecimiento.capacidades) {
      expect(profesional.capacidades).toContain(cap);
    }
    expect(profesional.capacidades).toContain("multisucursal");
    expect(crecimiento.capacidades).not.toContain("multisucursal");
  });

  it("la reserva en línea básica está en Esencial; la auto-confirmación no", () => {
    const esencial = planCatalogoPorClave("esencial")!;
    expect(esencial.capacidades).toContain("reservas_online");
    expect(esencial.capacidades).not.toContain("reservas_auto_confirmar");
  });

  it("el plan del trial (crecimiento) tiene 14 días y cubre 2 sucursales", () => {
    const crecimiento = planCatalogoPorClave("crecimiento")!;
    expect(crecimiento.trialDias).toBe(14);
    expect(crecimiento.maxUsuarios).toBe(8);
    expect(crecimiento.maxSucursales).toBe(2);
    expect(crecimiento.sucursalesIncluidas).toBe(2);
    expect(crecimiento.recomendado).toBe(true);
  });

  it("los precios son numéricos positivos y el anual es ~10 meses", () => {
    for (const plan of PLANES_CATALOGO) {
      const mensual = Number(plan.precioMensual);
      expect(mensual).toBeGreaterThan(0);
      if (plan.precioAnual) {
        expect(Number(plan.precioAnual)).toBe(mensual * 10);
      }
    }
  });

  it("la cobertura incluida es coherente con los topes del plan", () => {
    for (const plan of PLANES_CATALOGO) {
      expect(plan.sucursalesIncluidas).toBeGreaterThanOrEqual(1);
      if (plan.maxSucursales != null) {
        expect(plan.sucursalesIncluidas).toBeLessThanOrEqual(plan.maxSucursales);
      }
      // Sin precio de extra el máximo no puede superar lo incluido.
      if (plan.precioSucursalExtra == null && plan.maxSucursales != null) {
        expect(plan.maxSucursales).toBeLessThanOrEqual(plan.sucursalesIncluidas);
      }
    }
    const profesional = planCatalogoPorClave("profesional")!;
    expect(profesional.sucursalesIncluidas).toBe(3);
    expect(profesional.maxSucursales).toBeNull();
    expect(Number(profesional.precioSucursalExtra)).toBeGreaterThan(0);
  });
});

describe("tieneCapacidad", () => {
  const ctx = (efectivo: ContextoSuscripcion["efectivo"], capacidades: readonly CapacidadClave[]): ContextoSuscripcion => ({
    efectivo,
    plan: { clave: "crecimiento", nombre: "Crecimiento", maxSucursales: 1, maxUsuarios: 8 },
    capacidades: new Set(capacidades),
  });

  it("permite la capacidad cuando la suscripción está vigente y el plan la incluye", () => {
    expect(tieneCapacidad(ctx("vigente", ["gastos"]), "gastos")).toBe(true);
  });

  it("niega la capacidad cuando el plan no la incluye", () => {
    expect(tieneCapacidad(ctx("vigente", ["gastos"]), "multisucursal")).toBe(false);
  });

  it("niega todo con suscripción vencida aunque el plan la incluya", () => {
    expect(tieneCapacidad(ctx("vencida", ["gastos"]), "gastos")).toBe(false);
  });
});
