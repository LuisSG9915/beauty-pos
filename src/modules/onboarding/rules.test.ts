import { describe, expect, it } from "vitest";

import { evaluarPasos, pasosParaPermisos, resumenGuia, PASOS_GUIA } from "./rules";
import type { EstadoNegocio } from "./types";

const negocioVacio: EstadoNegocio = {
  serviciosActivos: 0,
  horariosActivos: 0,
  miembrosActivos: 1,
  citasRegistradas: 0,
  ventasCobradas: 0,
};

const negocioOperando: EstadoNegocio = {
  serviciosActivos: 3,
  horariosActivos: 7,
  miembrosActivos: 1,
  citasRegistradas: 2,
  ventasCobradas: 1,
};

describe("pasosParaPermisos", () => {
  it("admin de plataforma (null) ve todos los pasos", () => {
    expect(pasosParaPermisos(null)).toHaveLength(PASOS_GUIA.length);
  });

  it("propietario con todos los permisos ve todos los pasos", () => {
    const permisos = new Set(PASOS_GUIA.flatMap((paso) => [...paso.permisos]));
    expect(pasosParaPermisos(permisos)).toHaveLength(PASOS_GUIA.length);
  });

  it("un especialista solo ve pasos que puede ejecutar", () => {
    const permisos = new Set(["agenda.ver", "agenda.editar", "catalogos.ver", "clientes.ver"]);
    const claves = pasosParaPermisos(permisos).map((paso) => paso.clave);
    expect(claves).toContain("horario");
    expect(claves).toContain("primera_cita");
    expect(claves).not.toContain("servicios");
    expect(claves).not.toContain("equipo");
    expect(claves).not.toContain("primer_cobro");
    expect(claves).not.toContain("resultado");
  });

  it("sin permisos relevantes la guía queda vacía", () => {
    expect(pasosParaPermisos(new Set(["clientes.ver"]))).toHaveLength(0);
  });
});

describe("resumenGuia", () => {
  it("negocio nuevo: nada hecho y el primer paso requerido es servicios", () => {
    const resumen = resumenGuia(evaluarPasos(pasosParaPermisos(null), negocioVacio));
    expect(resumen.completados).toBe(0);
    expect(resumen.terminada).toBe(false);
    expect(resumen.pasos[resumen.siguiente]?.clave).toBe("servicios");
  });

  it("el paso opcional de equipo no bloquea la conclusión", () => {
    const resumen = resumenGuia(evaluarPasos(pasosParaPermisos(null), negocioOperando));
    const equipo = resumen.pasos.find((paso) => paso.clave === "equipo");
    expect(equipo?.hecho).toBe(false);
    expect(resumen.terminada).toBe(true);
  });

  it("con parte del avance, «siguiente» apunta al primer pendiente requerido", () => {
    const estado: EstadoNegocio = { ...negocioVacio, serviciosActivos: 2, horariosActivos: 5 };
    const resumen = resumenGuia(evaluarPasos(pasosParaPermisos(null), estado));
    expect(resumen.pasos[resumen.siguiente]?.clave).toBe("primera_cita");
    expect(resumen.terminada).toBe(false);
  });

  it("una guía sin pasos visibles no se considera terminada", () => {
    expect(resumenGuia([]).terminada).toBe(false);
  });
});
