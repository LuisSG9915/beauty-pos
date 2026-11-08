import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  CARACTERISTICAS_POR_DEFECTO,
  CLAVES_CARACTERISTICAS_POS,
  CARACTERISTICAS_POS,
  obtenerCaracteristica,
} from "@/modules/pos/caracteristicas";
import {
  cargarConfiguracionPos,
  guardarConfiguracionPos,
} from "@/modules/pos/queries";

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(),
}));

import { getDatabase } from "@/db/client";

const orgId = "11111111-1111-1111-1111-111111111111";
const orgIdDos = "22222222-2222-2222-2222-222222222222";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDatabase).mockReturnValue(
    mockDb as unknown as ReturnType<typeof getDatabase>,
  );
});

function mockeoSelect(filas: Array<{ clave: string; valor: boolean }>) {
  mockDb.select.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(filas),
    }),
  });
}

function mockeoInsert() {
  const onConflictMock = vi.fn().mockResolvedValue(undefined);
  const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictMock });
  mockDb.insert.mockReturnValue({ values: valuesMock });
  return { valuesMock, onConflictMock };
}

describe("CARACTERISTICAS_POS (catálogo)", () => {
  it("todas las características están activas por defecto", () => {
    for (const clave of CLAVES_CARACTERISTICAS_POS) {
      expect(CARACTERISTICAS_POR_DEFECTO[clave]).toBe(true);
    }
  });

  it("tiene las 8 características esperadas", () => {
    expect(CARACTERISTICAS_POS).toHaveLength(8);
    const claves = CARACTERISTICAS_POS.map((c) => c.clave);
    expect(claves).toContain("agenda-citas");
    expect(claves).toContain("cobro-caja");
    expect(claves).toContain("ventas-tienda");
    expect(claves).toContain("clientes-marketing");
    expect(claves).toContain("pagina-presencia");
    expect(claves).toContain("caja");
    expect(claves).toContain("impresion");
    expect(claves).toContain("gastos");
  });

  it("obtenerCaracteristica devuelve la definición de una clave", () => {
    const caja = obtenerCaracteristica("caja");
    expect(caja?.etiqueta).toBe("Caja");
    expect(caja?.ruta).toBe("/caja");
    expect(caja?.activaPorDefecto).toBe(true);

    const inexistente = obtenerCaracteristica("no-existe");
    expect(inexistente).toBeUndefined();
  });
});

describe("cargarConfiguracionPos", () => {
  it("devuelve valores por defecto cuando no hay filas en la tabla", async () => {
    mockeoSelect([]);

    const config = await cargarConfiguracionPos(orgId);

    for (const clave of CLAVES_CARACTERISTICAS_POS) {
      expect(config[clave]).toBe(true);
    }
  });

  it("respeta los valores guardados por organización", async () => {
    mockeoSelect([
      { clave: "caja", valor: false },
      { clave: "impresion", valor: false },
    ]);

    const config = await cargarConfiguracionPos(orgId);

    expect(config.caja).toBe(false);
    expect(config.impresion).toBe(false);
    expect(config["cobro-caja"]).toBe(true);
    expect(config["agenda-citas"]).toBe(true);
  });

  it("cada organización lee su propia configuración", async () => {
    mockeoSelect([{ clave: "caja", valor: false }]);

    const configA = await cargarConfiguracionPos(orgId);
    const configB = await cargarConfiguracionPos(orgIdDos);

    expect(configA.caja).toBe(false);
    expect(configB.caja).toBe(false);
  });
});

describe("guardarConfiguracionPos", () => {
  it("inserta una característica nueva para la organización", async () => {
    const { valuesMock, onConflictMock } = mockeoInsert();

    await guardarConfiguracionPos(orgId, "caja", false);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(valuesMock).toHaveBeenCalledWith({
      organizacionId: orgId,
      clave: "caja",
      valor: false,
    });
    expect(onConflictMock).toHaveBeenCalledWith({
      target: [expect.anything(), expect.anything()],
      set: {
        valor: false,
        actualizadaAt: expect.any(Date),
      },
    });
  });

  it("actualiza una característica existente (upsert)", async () => {
    const { onConflictMock } = mockeoInsert();

    await guardarConfiguracionPos(orgId, "impresion", false);
    await guardarConfiguracionPos(orgId, "impresion", true);

    expect(onConflictMock).toHaveBeenCalledTimes(2);
  });
});
