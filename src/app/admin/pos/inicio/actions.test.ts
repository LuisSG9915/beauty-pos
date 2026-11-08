import { describe, expect, it, vi, beforeEach } from "vitest";

import { guardarSeleccionCaracteristicasPos } from "./actions";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("@/lib/auth/access", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/modules/pos/queries", () => ({
  guardarConfiguracionesPos: vi.fn().mockResolvedValue(undefined),
}));

import { redirect } from "next/navigation";
import { getDatabase } from "@/db/client";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { guardarConfiguracionesPos } from "@/modules/pos/queries";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "33333333-3333-3333-3333-333333333333";

let filasMembresia: Array<{ id: string }> = [];

const mockDb = {
  select: vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(filasMembresia),
      }),
    }),
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  filasMembresia = [];
  vi.mocked(getDatabase).mockReturnValue(mockDb as never);
  vi.mocked(requireAuthenticatedUser).mockResolvedValue({
    session: {} as never,
    user: { id: userId } as { id: string },
  } as never);
  vi.mocked(guardarConfiguracionesPos).mockResolvedValue(undefined);
  vi.mocked(redirect).mockImplementation(() => undefined as never);
});

function mockeoMembresia(existe: boolean) {
  filasMembresia = existe ? [{ id: "membresia-id" }] : ([] as Array<{ id: string }>);
}

function formData(valores: Record<string, boolean>, organizacionId = orgId) {
  const fd = new FormData();
  fd.set("organizacionId", organizacionId);
  fd.set("valores", JSON.stringify(valores));
  return fd;
}

describe("guardarSeleccionCaracteristicasPos", () => {
  it("guarda la selección y redirige al POS", async () => {
    mockeoMembresia(true);
    const fd = formData({ caja: false, impresion: false, "cobro-caja": true });

    await guardarSeleccionCaracteristicasPos(fd);

    expect(guardarConfiguracionesPos).toHaveBeenCalledWith(orgId, {
      caja: false,
      impresion: false,
      "cobro-caja": true,
    });
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      `/admin/pos?organizationId=${orgId}&nueva=1`,
    );
  });

  it("redirige con error cuando el usuario no es miembro de la organización", async () => {
    mockeoMembresia(false);
    const fd = formData({ caja: true });

    await guardarSeleccionCaracteristicasPos(fd);

    expect(guardarConfiguracionesPos).not.toHaveBeenCalled();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      `/admin/pos/inicio?organizationId=${orgId}&error=no-acceso`,
    );
  });

  it("redirige con error cuando la selección es inválida", async () => {
    mockeoMembresia(true);
    const fd = new FormData();
    fd.set("organizacionId", "no-es-un-uuid");
    fd.set("valores", "no-es-json");

    await guardarSeleccionCaracteristicasPos(fd);

    expect(guardarConfiguracionesPos).not.toHaveBeenCalled();
    expect(vi.mocked(redirect)).toHaveBeenCalledWith(
      `/admin/pos/inicio?organizationId=no-es-un-uuid&error=seleccion-invalida`,
    );
  });
});
