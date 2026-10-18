import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  queryAnalyticsEngine,
  writeNavigationTelemetry,
  writeProductTelemetry,
} from "./analytics-engine";

type WriteDataPointFn = (event?: {
  indexes?: ((ArrayBuffer | string) | null)[];
  doubles?: number[];
  blobs?: ((ArrayBuffer | string) | null)[];
}) => void;

type MockCloudflareEnv = {
  TELEMETRY_AE?: {
    writeDataPoint: WriteDataPointFn;
  };
};

const { mockState } = vi.hoisted(() => ({
  mockState: {
    context: null as { env?: MockCloudflareEnv } | null,
  },
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => mockState.context,
}));

describe("analytics-engine", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.context = null;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("writeNavigationTelemetry", () => {
    it("retorna false si no hay binding de Analytics Engine disponible", () => {
      mockState.context = null;

      const result = writeNavigationTelemetry({
        ruta: "/admin/agenda",
        duracionMs: 120,
        ttfbMs: 45,
      });

      expect(result).toBe(false);
    });

    it("escribe en TELEMETRY_AE y retorna true cuando el binding está presente", () => {
      const writeDataPoint = vi.fn();
      mockState.context = {
        env: {
          TELEMETRY_AE: { writeDataPoint },
        },
      };

      const result = writeNavigationTelemetry({
        ruta: "/admin/pos",
        duracionMs: 250,
        ttfbMs: 60,
        organizacionId: "org-123",
        rol: "admin",
        dispositivo: "desktop",
      });

      expect(result).toBe(true);
      expect(writeDataPoint).toHaveBeenCalledWith({
        indexes: ["org-123"],
        blobs: ["nav", "/admin/pos", "org-123", "admin", "desktop"],
        doubles: [250, 60],
      });
    });

    it("usa valores por defecto para campos opcionales", () => {
      const writeDataPoint = vi.fn();
      mockState.context = {
        env: {
          TELEMETRY_AE: { writeDataPoint },
        },
      };

      const result = writeNavigationTelemetry({
        ruta: "/",
        duracionMs: 80,
      });

      expect(result).toBe(true);
      expect(writeDataPoint).toHaveBeenCalledWith({
        indexes: ["anon"],
        blobs: ["nav", "/", "", "", ""],
        doubles: [80, 0],
      });
    });
  });

  describe("writeProductTelemetry", () => {
    it("retorna false si no hay binding disponible", () => {
      mockState.context = null;

      const result = writeProductTelemetry({
        evento: "venta_cobrada",
        modulo: "pos",
        organizacionId: "org-123",
      });

      expect(result).toBe(false);
    });

    it("escribe en TELEMETRY_AE con formato de producto y retorna true", () => {
      const writeDataPoint = vi.fn();
      mockState.context = {
        env: {
          TELEMETRY_AE: { writeDataPoint },
        },
      };

      const result = writeProductTelemetry({
        evento: "reserva_creada",
        modulo: "reservas",
        organizacionId: "org-123",
        sucursalId: "suc-456",
        rol: "recepcionista",
        duracionMs: 350,
      });

      expect(result).toBe(true);
      expect(writeDataPoint).toHaveBeenCalledWith({
        indexes: ["org-123"],
        blobs: ["prod", "reserva_creada", "reservas", "org-123", "suc-456", "recepcionista"],
        doubles: [350, 1],
      });
    });
  });

  describe("queryAnalyticsEngine", () => {
    it("retorna null si CF_ACCOUNT_ID o CF_API_TOKEN_ANALYTICS no están configurados", async () => {
      delete process.env.CF_ACCOUNT_ID;
      delete process.env.CF_API_TOKEN_ANALYTICS;

      const result = await queryAnalyticsEngine("SELECT * FROM melena_telemetry");
      expect(result).toBeNull();
    });

    it("ejecuta consulta SQL contra la API de Cloudflare y devuelve datos", async () => {
      process.env.CF_ACCOUNT_ID = "acc-123";
      process.env.CF_API_TOKEN_ANALYTICS = "token-xyz";

      const mockData = [{ ruta: "/admin", vistas: 10 }];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockData }),
      } as Response);

      const result = await queryAnalyticsEngine("SELECT blob2 as ruta, count() as vistas FROM melena_telemetry");
      expect(result).toEqual(mockData);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.cloudflare.com/client/v4/accounts/acc-123/analytics_engine/sql",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer token-xyz",
          }),
        }),
      );

      fetchSpy.mockRestore();
    });

    it("retorna null si la petición HTTP falla", async () => {
      process.env.CF_ACCOUNT_ID = "acc-123";
      process.env.CF_API_TOKEN_ANALYTICS = "token-xyz";

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "Bad request",
      } as Response);

      const result = await queryAnalyticsEngine("SELECT INVALID SQL");
      expect(result).toBeNull();

      fetchSpy.mockRestore();
    });
  });
});
