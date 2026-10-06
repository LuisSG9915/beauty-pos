import { describe, expect, it } from "vitest";

import { catUnidadesMedida, productos } from "@/db/schema/catalogs";
import { claveDisponible, SLUG_MAX, slugClave } from "@/lib/clave";

describe("slugClave", () => {
  it("convierte el nombre a minúsculas separadas por guiones", () => {
    expect(slugClave("Shampoo reparador 300ml")).toBe("shampoo-reparador-300ml");
    expect(slugClave("Corte de Caballero")).toBe("corte-de-caballero");
  });

  it("quita acentos y diacríticos", () => {
    expect(slugClave("Tónico Facial")).toBe("tonico-facial");
    expect(slugClave("Depilación línea bávara")).toBe("depilacion-linea-bavara");
  });

  it("convierte ñ y otros caracteres unicode a su base", () => {
    expect(slugClave("Niño")).toBe("nino");
    expect(slugClave("Uñas acrílicas")).toBe("unas-acrilicas");
    expect(slugClave("Crème brûlée")).toBe("creme-brulee");
  });

  it("colapsa espacios múltiples, símbolos y guiones al borde", () => {
    expect(slugClave("Corte   &   Peinado!")).toBe("corte-peinado");
    expect(slugClave("  --Mixto--  ")).toBe("mixto");
    expect(slugClave("IVA (16%)")).toBe("iva-16");
  });

  it("cae en 'item' cuando no quedan caracteres útiles", () => {
    expect(slugClave("")).toBe("item");
    expect(slugClave("   ")).toBe("item");
    expect(slugClave("·—·")).toBe("item");
    expect(slugClave(null)).toBe("item");
    expect(slugClave(undefined)).toBe("item");
  });

  it("recorta al largo máximo sin dejar guion al final", () => {
    const largo = slugClave("nombre ".repeat(30), 20);
    expect(largo.length).toBeLessThanOrEqual(20);
    expect(largo).not.toMatch(/-$/);
    // El recorte nunca devuelve vacío.
    expect(slugClave("a".repeat(200), 10)).toBe("a".repeat(10));
    expect(slugClave("x", SLUG_MAX)).toBe("x");
  });
});

type DbFalso = {
  db: Parameters<typeof claveDisponible>[0];
  consultas: () => number;
};

/** Simula una tabla donde las primeras `ocupadas` candidatas ya existen. */
function dbConClavesOcupadas(ocupadas: number): DbFalso {
  let consultas = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            consultas += 1;
            return consultas <= ocupadas ? [{ n: 1 }] : [];
          },
        }),
      }),
    }),
  };
  return {
    db: db as unknown as Parameters<typeof claveDisponible>[0],
    consultas: () => consultas,
  };
}

describe("claveDisponible", () => {
  it("devuelve el slug base cuando está libre", async () => {
    const { db, consultas } = dbConClavesOcupadas(0);
    await expect(claveDisponible(db, catUnidadesMedida, "org-1", "Pieza", 20)).resolves.toBe("pieza");
    expect(consultas()).toBe(1);
  });

  it("itera sufijos hasta encontrar hueco", async () => {
    const { db, consultas } = dbConClavesOcupadas(2);
    await expect(claveDisponible(db, catUnidadesMedida, "org-1", "Pieza", 20)).resolves.toBe("pieza-3");
    expect(consultas()).toBe(3);
  });

  it("mantiene el sufijo dentro del largo de la columna", async () => {
    const { db } = dbConClavesOcupadas(1);
    const clave = await claveDisponible(db, catUnidadesMedida, "org-1", "Pieza extra", 6);
    expect(clave.length).toBeLessThanOrEqual(6);
    expect(clave).toBe("piez-2");
  });

  it("también resuelve columnas sku", async () => {
    const { db } = dbConClavesOcupadas(1);
    await expect(claveDisponible(db, productos, "org-1", "Shampoo Reparador", 80)).resolves.toBe("shampoo-reparador-2");
  });
});
