import { describe, expect, it } from "vitest";

import {
  elegirPaqueteParaServicio,
  estadoTrasUso,
  restarSesiones,
  saldoParaServicio,
} from "@/modules/pos/paquetes";

const paquete = (id: string, servicioId: string, sesionesRestantes: number) => ({
  id,
  servicioId,
  sesionesRestantes,
});

describe("elegirPaqueteParaServicio", () => {
  it("elige el paquete vigente más antiguo que cubre el servicio", () => {
    const lista = [
      paquete("p1", "s1", 2),
      paquete("p2", "s1", 5),
      paquete("p3", "s2", 9),
    ];
    expect(elegirPaqueteParaServicio(lista, "s1", 1)?.id).toBe("p1");
  });

  it("salta paquetes sin saldo suficiente para la cantidad de la línea", () => {
    const lista = [paquete("p1", "s1", 1), paquete("p2", "s1", 3)];
    expect(elegirPaqueteParaServicio(lista, "s1", 2)?.id).toBe("p2");
  });

  it("devuelve null si ningún paquete cubre el servicio", () => {
    const lista = [paquete("p1", "s2", 5)];
    expect(elegirPaqueteParaServicio(lista, "s1", 1)).toBeNull();
  });

  it("devuelve null si la cantidad no es positiva", () => {
    const lista = [paquete("p1", "s1", 5)];
    expect(elegirPaqueteParaServicio(lista, "s1", 0)).toBeNull();
  });
});

describe("restarSesiones / estadoTrasUso", () => {
  it("descuenta sesiones sin bajar de cero", () => {
    expect(restarSesiones(5, 2)).toBe(3);
    expect(restarSesiones(2, 5)).toBe(0);
  });

  it("agota el paquete cuando el saldo llega a cero", () => {
    expect(estadoTrasUso(3)).toBe("vigente");
    expect(estadoTrasUso(0)).toBe("agotado");
  });
});

describe("saldoParaServicio", () => {
  it("suma las sesiones restantes de los paquetes que cubren el servicio", () => {
    const lista = [
      paquete("p1", "s1", 2),
      paquete("p2", "s1", 3),
      paquete("p3", "s2", 4),
    ];
    expect(saldoParaServicio(lista, "s1")).toBe(5);
    expect(saldoParaServicio(lista, "s2")).toBe(4);
    expect(saldoParaServicio(lista, "s9")).toBe(0);
  });
});
