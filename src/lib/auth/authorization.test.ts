import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DB falsa para las pruebas de autorización: cada `db.select()` consume la
 * siguiente respuesta encolada en `mocks.state.results`, sin importar la
 * cadena de métodos (`.from().innerJoin().where().limit()...`). El proxy es
 * "thenable" para que `await query` resuelva el resultado.
 */
const mocks = vi.hoisted(() => {
  function chainable(result: unknown[]): unknown {
    const proxy: unknown = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === "then") {
          return (
            resolve: (v: unknown) => unknown,
            reject?: (e: unknown) => unknown,
          ) => Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "catch") {
          return (fn: (e: unknown) => unknown) => Promise.resolve(result).catch(fn);
        }
        return () => proxy;
      },
      apply() {
        return proxy;
      },
    });
    return proxy;
  }
  const state = { results: [] as unknown[][] };
  return {
    state,
    selectCalls: { count: 0 },
    db: {
      select: () => {
        mocks.selectCalls.count += 1;
        return chainable(state.results.shift() ?? []);
      },
    },
  };
});

vi.mock("@/db/client", () => ({ getDatabase: () => mocks.db }));

import {
  assertBranchScope,
  canAccessBranch,
  hasPermission,
  resolveAccessSafe,
  type ResolvedAccess,
} from "@/lib/auth/authorization";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const SUC_A1 = "33333333-3333-4333-8333-333333333333";
const SUC_A2 = "44444444-4444-4444-8444-444444444444";
const SUC_B1 = "55555555-5555-4555-8555-555555555555";
const USER_ID = "66666666-6666-4666-8666-666666666666";

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    esAdministradorPlataforma: false,
    ...overrides,
  } as never;
}

function accessOf(partial: Partial<ResolvedAccess>): ResolvedAccess {
  return {
    user: member() as never,
    organizationId: ORG_A,
    membershipId: "mem-1",
    permissions: new Set(),
    branchIds: null,
    esPlataforma: false,
    ...partial,
  };
}

beforeEach(() => {
  mocks.state.results = [];
  mocks.selectCalls.count = 0;
});

describe("hasPermission", () => {
  it("plataforma siempre tiene permiso", () => {
    const access = accessOf({ esPlataforma: true });
    expect(hasPermission(access, "ventas.cobrar")).toBe(true);
  });

  it("miembro con el permiso lo tiene; sin él, no", () => {
    const access = accessOf({ permissions: new Set(["agenda.ver"]) });
    expect(hasPermission(access, "agenda.ver")).toBe(true);
    expect(hasPermission(access, "ventas.cobrar")).toBe(false);
  });

  it("miembro sin roles queda sin permisos (fail-closed)", () => {
    const access = accessOf({ permissions: new Set() });
    expect(hasPermission(access, "clientes.ver")).toBe(false);
  });
});

describe("canAccessBranch", () => {
  it("branchIds null = alcance de toda la organización", () => {
    const access = accessOf({ branchIds: null });
    expect(canAccessBranch(access, SUC_A1)).toBe(true);
    expect(canAccessBranch(access, SUC_B1)).toBe(true);
  });

  it("con asignaciones solo permite las sucursales listadas", () => {
    const access = accessOf({ branchIds: new Set([SUC_A1]) });
    expect(canAccessBranch(access, SUC_A1)).toBe(true);
    expect(canAccessBranch(access, SUC_A2)).toBe(false);
    expect(canAccessBranch(access, SUC_B1)).toBe(false);
  });
});

describe("resolveAccessSafe", () => {
  it("admin de plataforma obtiene acceso total sin consultar la base", async () => {
    const user = member({ esAdministradorPlataforma: true });
    const access = await resolveAccessSafe(ORG_A, user);
    expect(access?.esPlataforma).toBe(true);
    expect(access?.branchIds).toBeNull();
    expect(mocks.selectCalls.count).toBe(0);
  });

  it("usuario sin membresía activa en la organización → null", async () => {
    mocks.state.results = [[]]; // sin fila de membresía
    const access = await resolveAccessSafe(ORG_B, member());
    expect(access).toBeNull();
  });

  it("miembro sin roles: permisos vacíos", async () => {
    mocks.state.results = [
      [{ id: "mem-1" }], // membresía
      [], // permisos
      [], // asignaciones de sucursal
    ];
    const access = await resolveAccessSafe(ORG_A, member());
    expect(access).not.toBeNull();
    expect(access?.permissions.size).toBe(0);
    expect(access?.branchIds).toBeNull(); // sin asignaciones = org-wide
  });

  it("miembro con roles: unión de permisos y sucursales asignadas", async () => {
    mocks.state.results = [
      [{ id: "mem-1" }],
      [{ clave: "agenda.ver" }, { clave: "ventas.crear" }],
      [{ sucursalId: SUC_A1 }],
    ];
    const access = await resolveAccessSafe(ORG_A, member());
    expect(access?.permissions.has("agenda.ver")).toBe(true);
    expect(access?.permissions.has("ventas.crear")).toBe(true);
    expect(access?.permissions.has("ventas.cobrar")).toBe(false);
    expect(access?.branchIds?.has(SUC_A1)).toBe(true);
    expect(canAccessBranch(access!, SUC_A2)).toBe(false);
  });
});

describe("assertBranchScope", () => {
  it("rechaza una sucursal fuera de las asignadas sin tocar la base", async () => {
    const access = accessOf({ branchIds: new Set([SUC_A1]) });
    expect(await assertBranchScope(access, SUC_A2)).toBe(false);
    expect(mocks.selectCalls.count).toBe(0);
  });

  it("rechaza una sucursal que no pertenece a la organización", async () => {
    mocks.state.results = [[]]; // la sucursal no existe en ORG_A
    const access = accessOf({ branchIds: null });
    expect(await assertBranchScope(access, SUC_B1)).toBe(false);
  });

  it("rechaza una sucursal asignada pero inactiva/inexistente en la org", async () => {
    mocks.state.results = [[]];
    const access = accessOf({ branchIds: new Set([SUC_A1]) });
    expect(await assertBranchScope(access, SUC_A1)).toBe(false);
  });

  it("acepta una sucursal válida dentro del alcance", async () => {
    mocks.state.results = [[{ id: SUC_A1 }]];
    const access = accessOf({ branchIds: new Set([SUC_A1]) });
    expect(await assertBranchScope(access, SUC_A1)).toBe(true);
  });
});
