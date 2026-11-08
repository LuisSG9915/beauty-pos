import { describe, expect, it, vi, beforeEach } from "vitest";

import { crearVentaSencilla } from "./actions";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("@/lib/auth/access", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

import { redirect } from "next/navigation";
import { getDatabase } from "@/db/client";
import { requireAuthenticatedUser } from "@/lib/auth/access";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-4333-8333-333333333333";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDatabase).mockReturnValue(mockDb as never);
  vi.mocked(requireAuthenticatedUser).mockResolvedValue({
    session: {} as never,
    user: { id: userId } as { id: string },
  } as never);
  vi.mocked(redirect).mockImplementation(() => undefined as never);
});

function mockeoSelect(
  filasPrimera: Array<{ id: string }>,
  filasSegunda: Array<{ id: string }>,
) {
  let llamada = 0;
  mockDb.select.mockImplementation(() => {
    llamada++;
    return {
      from: () => ({
        where: () => ({
          limit: () =>
            llamada === 1
              ? Promise.resolve(filasPrimera)
              : Promise.resolve(filasSegunda),
        }),
      }),
    };
  });
}

function mockeoVenta(id: string) {
  mockDb.insert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id }]),
    }),
  });
}

function formData(organizacionId = orgId) {
  const fd = new FormData();
  fd.set("organizacionId", organizacionId);
  return fd;
}

describe("crearVentaSencilla", () => {
  it("crea una venta directa y redirige al cobro sencillo", async () => {
    mockeoSelect([{ id: "miembro-id" }], [{ id: "sucursal-id" }]);
    mockeoVenta("venta-id-1");

    const fd = formData(orgId);
    await crearVentaSencilla(fd);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      `/admin/pos/sencillo?organizationId=${orgId}&sucursalId=sucursal-id&ventaId=venta-id-1`,
    );
  });

  it("rechaza cuando el usuario no es miembro de la organización", async () => {
    mockeoSelect([], [{ id: "sucursal-id" }]);

    const fd = formData(orgId);
    await crearVentaSencilla(fd);

    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      `/admin/pos/sencillo?organizationId=${orgId}&error=no-acceso`,
    );
  });

  it("rechaza cuando no hay sucursal activa", async () => {
    mockeoSelect([{ id: "miembro-id" }], []);

    const fd = formData(orgId);
    await crearVentaSencilla(fd);

    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      `/admin/pos/sencillo?organizationId=${orgId}&error=sin-sucursal`,
    );
  });

  it("rechaza cuando el identificador de organización no es un UUID", async () => {
    mockeoSelect([{ id: "miembro-id" }], [{ id: "sucursal-id" }]);

    const fd = formData("no-es-un-uuid");
    await crearVentaSencilla(fd);

    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      "/admin/pos/sencillo?error=seleccion-invalida",
    );
  });
});
