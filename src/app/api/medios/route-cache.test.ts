/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./[...key]/route";
import * as accessAuth from "@/lib/auth/access";
import * as authAuth from "@/lib/auth/authorization";
import * as mediaModule from "@/lib/media";

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/lib/auth/access", () => ({
  getApiSessionUser: vi.fn(),
}));

vi.mock("@/lib/auth/authorization", () => ({
  resolveAccessSafe: vi.fn(),
  hasPermission: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/media", () => ({
  getMediaBucket: vi.fn(),
  mediaGet: vi.fn(),
  mediaDelete: vi.fn(),
  PERMISO_POR_ENTIDAD: {
    producto: "catalogos.editar",
    servicio: "catalogos.editar",
    ficha: "clientes.editar",
    compra: "compras.editar",
    mobiliario: "sucursales.editar",
  },
}));

vi.mock("@/lib/kv-cache", () => ({
  kvReadThrough: vi.fn((_key, _ttl, loader) => loader()),
  kvInvalidate: vi.fn(),
}));

describe("GET /api/medios/[...key] - Edge Cache API y Privacidad", () => {
  const orgId = "11111111-1111-1111-1111-111111111111";
  let mockCache: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCache = {
      match: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
    };

    (globalThis as any).caches = {
      default: mockCache,
    };
  });

  it("devuelve respuesta inmediatamente desde Cache API en hit de prefijo público", async () => {
    const cachedResponse = new Response("imagen-cacheada", {
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
    mockCache.match.mockResolvedValueOnce(cachedResponse);

    const request = new NextRequest(`https://melena.app/api/medios/productos/${orgId}/prod1/foto.webp`);
    const params = Promise.resolve({ key: ["productos", orgId, "prod1", "foto.webp"] });

    const response = await GET(request, { params });

    expect(response).toBe(cachedResponse);
    expect(mediaModule.mediaGet).not.toHaveBeenCalled();
  });

  it("lee de R2 y almacena en Cache API en miss de prefijo público", async () => {
    vi.mocked(mediaModule.getMediaBucket).mockReturnValue({} as any);
    vi.mocked(mediaModule.mediaGet).mockResolvedValueOnce({
      body: "imagen-bytes",
      size: 1234,
      httpEtag: '"etag-123"',
      writeHttpMetadata: vi.fn(),
    } as any);

    const request = new NextRequest(`https://melena.app/api/medios/productos/${orgId}/prod1/foto.webp`);
    const params = Promise.resolve({ key: ["productos", orgId, "prod1", "foto.webp"] });

    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(mediaModule.mediaGet).toHaveBeenCalledWith(`productos/${orgId}/prod1/foto.webp`);
  });

  it("retorna 401 para prefijo privado sin sesión", async () => {
    vi.mocked(accessAuth.getApiSessionUser).mockResolvedValueOnce(null);

    const request = new NextRequest(`https://melena.app/api/medios/compras/${orgId}/ticket.webp`);
    const params = Promise.resolve({ key: ["compras", orgId, "ticket.webp"] });

    const response = await GET(request, { params });

    expect(response.status).toBe(401);
    expect(mockCache.match).not.toHaveBeenCalled();
  });

  it("retorna 403 para prefijo privado si el usuario no tiene acceso a la organización", async () => {
    vi.mocked(accessAuth.getApiSessionUser).mockResolvedValueOnce({ id: "user-1" } as any);
    vi.mocked(authAuth.resolveAccessSafe).mockResolvedValueOnce(null);

    const request = new NextRequest(`https://melena.app/api/medios/compras/${orgId}/ticket.webp`);
    const params = Promise.resolve({ key: ["compras", orgId, "ticket.webp"] });

    const response = await GET(request, { params });

    expect(response.status).toBe(403);
    expect(mockCache.match).not.toHaveBeenCalled();
  });

  it("permite acceso privado autorizado con Cache-Control: private y sin guardar en edge cache", async () => {
    vi.mocked(accessAuth.getApiSessionUser).mockResolvedValueOnce({ id: "user-1" } as any);
    vi.mocked(authAuth.resolveAccessSafe).mockResolvedValueOnce({ organizationId: orgId } as any);
    vi.mocked(mediaModule.getMediaBucket).mockReturnValue({} as any);
    vi.mocked(mediaModule.mediaGet).mockResolvedValueOnce({
      body: "ticket-bytes",
      size: 5678,
      httpEtag: '"etag-ticket"',
      writeHttpMetadata: vi.fn(),
    } as any);

    const request = new NextRequest(`https://melena.app/api/medios/compras/${orgId}/ticket.webp`);
    const params = Promise.resolve({ key: ["compras", orgId, "ticket.webp"] });

    const response = await GET(request, { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(mockCache.match).not.toHaveBeenCalled();
    expect(mockCache.put).not.toHaveBeenCalled();
  });
});
