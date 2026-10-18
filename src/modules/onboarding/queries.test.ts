import { beforeEach, describe, expect, it, vi } from "vitest";

import * as kvCache from "@/lib/kv-cache";
import { invalidarCacheOnboarding, obtenerProgresoOnboarding } from "./queries";

vi.mock("@/lib/kv-cache", () => ({
  kvGetJson: vi.fn(),
  kvPutJson: vi.fn(),
  kvDelete: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(() => ({
    execute: vi.fn().mockResolvedValue({
      rows: [
        {
          servicios_activos: 10,
          horarios_activos: 6,
          miembros_activos: 3,
          citas_registradas: 15,
          ventas_cobradas: 8,
          sucursal_nombre: "Principal",
        },
      ],
    }),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ estado: "en_progreso", pasoActual: 2 }]),
        })),
      })),
    })),
  })),
}));

describe("obtenerProgresoOnboarding con CACHE_KV", () => {
  const orgId = "11111111-1111-1111-1111-111111111111";
  const sucursalId = "22222222-2222-2222-2222-222222222222";
  const userId = "33333333-3333-3333-3333-333333333333";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve progreso desde CACHE_KV si existe cache hit", async () => {
    const cachedProgreso = {
      estadoNegocio: {
        serviciosActivos: 10,
        horariosActivos: 6,
        miembrosActivos: 3,
        citasRegistradas: 15,
        ventasCobradas: 8,
        sucursalNombre: "Principal",
      },
      progresoGuia: { estado: "en_progreso" as const, pasoActual: 2 },
    };
    vi.mocked(kvCache.kvGetJson).mockResolvedValueOnce(cachedProgreso);

    const resultado = await obtenerProgresoOnboarding(orgId, sucursalId, userId);

    expect(resultado).toEqual(cachedProgreso);
    expect(kvCache.kvGetJson).toHaveBeenCalledWith(`onboarding:${orgId}`);
    expect(kvCache.kvPutJson).not.toHaveBeenCalled();
  });

  it("consulta y guarda en KV con TTL 600 en cache miss", async () => {
    vi.mocked(kvCache.kvGetJson).mockResolvedValueOnce(null);

    const resultado = await obtenerProgresoOnboarding(orgId, sucursalId, userId);

    expect(resultado.estadoNegocio?.serviciosActivos).toBe(10);
    expect(kvCache.kvPutJson).toHaveBeenCalledWith(
      `onboarding:${orgId}`,
      expect.objectContaining({
        estadoNegocio: expect.any(Object),
        progresoGuia: expect.any(Object),
      }),
      { expirationTtl: 600 },
    );
  });

  it("invalida la clave de onboarding en KV al llamar invalidarCacheOnboarding", async () => {
    await invalidarCacheOnboarding(orgId);

    expect(kvCache.kvDelete).toHaveBeenCalledWith(`onboarding:${orgId}`);
  });
});
