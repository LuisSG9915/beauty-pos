import { beforeEach, describe, expect, it, vi } from "vitest";

import * as kvCache from "@/lib/kv-cache";
import { invalidarCacheAlertas, obtenerAlertasActivas } from "./queries";

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
          citas_pendientes: 3,
          citas_sin_profesional: 1,
          avisos_fallidos: 0,
          corte_sin_cerrar: 0,
          diferencias_caja: 0,
          stock_bajo: 2,
          por_agotarse: 0,
        },
      ],
    }),
  })),
}));

describe("obtenerAlertasActivas con CACHE_KV", () => {
  const orgId = "11111111-1111-1111-1111-111111111111";
  const sucursalId = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve alertas desde CACHE_KV si hay cache hit sin tocar BD", async () => {
    const cachedAlertas = [
      {
        clave: "citas_pendientes",
        titulo: "Reservas por confirmar",
        cantidad: 5,
        href: "/agenda" as const,
        tono: "advertencia" as const,
      },
    ];
    vi.mocked(kvCache.kvGetJson).mockResolvedValueOnce(cachedAlertas);

    const resultado = await obtenerAlertasActivas(orgId, sucursalId);

    expect(resultado).toEqual(cachedAlertas);
    expect(kvCache.kvGetJson).toHaveBeenCalledWith(`alertas:${orgId}:${sucursalId}`);
    expect(kvCache.kvPutJson).not.toHaveBeenCalled();
  });

  it("consulta BD y guarda en CACHE_KV con TTL 60 si hay cache miss", async () => {
    vi.mocked(kvCache.kvGetJson).mockResolvedValueOnce(null);

    const resultado = await obtenerAlertasActivas(orgId, sucursalId);

    expect(resultado.length).toBeGreaterThan(0);
    expect(kvCache.kvPutJson).toHaveBeenCalledWith(
      `alertas:${orgId}:${sucursalId}`,
      expect.any(Array),
      { expirationTtl: 60 },
    );
  });

  it("invalida la clave en KV al llamar invalidarCacheAlertas", async () => {
    await invalidarCacheAlertas(orgId, sucursalId);

    expect(kvCache.kvDelete).toHaveBeenCalledWith(`alertas:${orgId}:${sucursalId}`);
    expect(kvCache.kvDelete).toHaveBeenCalledWith(`alertas:${orgId}:all`);
  });
});
