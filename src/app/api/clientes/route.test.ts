import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/clientes/route";

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      {
        id: "cli-1",
        nombre: "María Elena Morales",
        telefono: "5512345678",
        correo: "maria@test.com",
      },
    ]),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "cli-new-1",
            nombre: "Mariana",
            apellidoPaterno: "Solís",
            apellidoMaterno: null,
            telefono: "5587654321",
          },
        ]),
      }),
    }),
  })),
}));

vi.mock("@/lib/auth/access", () => ({
  getApiSessionUser: vi.fn().mockResolvedValue({
    id: "user-1",
    authUsuarioId: "auth-1",
    nombre: "Recepcionista Test",
  }),
}));

vi.mock("@/lib/auth/authorization", () => ({
  resolveAccessSafe: vi.fn().mockResolvedValue({
    rol: "recepcionista",
    permisos: ["agenda.editar", "clientes.ver"],
  }),
  hasPermission: vi.fn((access, perm) => access?.permisos?.includes(perm)),
}));

describe("API /api/clientes", () => {
  it("GET devuelve lista de clientes formateada para RemoteCombobox", async () => {
    const req = new NextRequest("http://localhost:3000/api/clientes?organizationId=org-1&q=maria");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { items: Array<{ value: string; label: string; description?: string }> };
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toEqual({
      value: "cli-1",
      label: "María Elena Morales",
      description: "5512345678",
    });
  });

  it("POST registra cliente rápido y divide nombre correctamente", async () => {
    const req = new NextRequest("http://localhost:3000/api/clientes", {
      method: "POST",
      body: JSON.stringify({
        organizationId: "org-1",
        nombreCompleto: "Mariana Solís",
        telefono: "55 8765 4321",
        notasOperativas: "Piel sensible",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { item: { value: string; label: string; description?: string } };
    expect(data.item).toEqual({
      value: "cli-new-1",
      label: "Mariana Solís",
      description: "5587654321",
    });
  });

  it("POST rechaza nombre vacío o demasiado corto", async () => {
    const req = new NextRequest("http://localhost:3000/api/clientes", {
      method: "POST",
      body: JSON.stringify({
        organizationId: "org-1",
        nombreCompleto: "M",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("al menos 2 letras");
  });
});
