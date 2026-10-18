import { beforeEach, describe, expect, it, vi } from "vitest";

import * as kvCache from "@/lib/kv-cache";
import { invalidarCacheReservaMeta, obtenerReservaMeta } from "./queries";

vi.mock("@/lib/kv-cache", () => ({
  kvGetJson: vi.fn(),
  kvPutJson: vi.fn(),
  kvDelete: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([
            {
              id: "org-1",
              nombre: "Mi Salón",
              slug: "mi-salon",
              zonaHoraria: "America/Mexico_City",
            },
          ]),
        })),
        orderBy: vi.fn().mockResolvedValue([
          {
            id: "suc-1",
            nombre: "Sucursal Centro",
            direccion: "Av Central 123",
            reservasAutoConfirmar: true,
            zonaHoraria: "America/Mexico_City",
          },
        ]),
        innerJoin: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn().mockResolvedValue([
                { sucursalId: "suc-1", usuarioId: "user-1", nombre: "Estilista Ana" },
              ]),
            })),
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/modules/billing/queries", () => ({
  contextoSuscripcion: vi.fn().mockResolvedValue({
    estado: "vigente",
    capacidades: ["reservas_online", "reservas_auto_confirmar"],
  }),
  tieneCapacidad: vi.fn().mockReturnValue(true),
}));

describe("obtenerReservaMeta con CACHE_KV", () => {
  const slug = "mi-salon";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve los metadatos desde CACHE_KV si existe cache hit", async () => {
    const cachedMeta = {
      portal: {
        organizacion: { id: "org-1", nombre: "Mi Salón", slug: "mi-salon" },
        sucursales: [
          {
            id: "suc-1",
            nombre: "Sucursal Centro",
            direccion: "Av Central 123",
            autoConfirmar: true,
            zonaHoraria: "America/Mexico_City",
          },
        ],
      },
      servicios: [],
      profesionales: [],
      horarios: [],
    };
    vi.mocked(kvCache.kvGetJson).mockResolvedValueOnce(cachedMeta);

    const resultado = await obtenerReservaMeta(slug);

    expect(resultado).toEqual(cachedMeta);
    expect(kvCache.kvGetJson).toHaveBeenCalledWith(`reserva_meta:${slug}`);
    expect(kvCache.kvPutJson).not.toHaveBeenCalled();
  });

  it("invalida la clave de reserva_meta en KV al llamar invalidarCacheReservaMeta", async () => {
    await invalidarCacheReservaMeta(slug);

    expect(kvCache.kvDelete).toHaveBeenCalledWith(`reserva_meta:${slug}`);
  });
});
