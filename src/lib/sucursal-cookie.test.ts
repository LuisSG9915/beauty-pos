import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getClientSucursalCookie,
  getClientSucursalesMap,
  setClientSucursalCookie,
  sucursalCookieName,
  SUCURSAL_COOKIE_PREFIX,
} from "@/lib/sucursal-cookie-client";

describe("sucursal-cookie-client", () => {
  const orgId1 = "11111111-1111-1111-1111-111111111111";
  const orgId2 = "22222222-2222-2222-2222-222222222222";
  const sucId1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const sucId2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  let mockCookie = "";

  beforeEach(() => {
    mockCookie = "";
    (globalThis as unknown as { document: { cookie: string } }).document = {
      get cookie() {
        return mockCookie;
      },
      set cookie(val: string) {
        const [cookiePair] = val.split(";");
        const [name, value] = cookiePair.split("=");
        const currentCookies = mockCookie
          ? mockCookie.split("; ").filter((c) => !c.startsWith(`${name.trim()}=`))
          : [];
        if (value !== undefined) {
          currentCookies.push(`${name.trim()}=${value.trim()}`);
        }
        mockCookie = currentCookies.join("; ");
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { document?: unknown }).document;
  });

  it("genera el nombre de cookie con el prefijo correcto", () => {
    expect(sucursalCookieName(orgId1)).toBe(`${SUCURSAL_COOKIE_PREFIX}${orgId1}`);
  });

  it("escribe y lee la sucursal preferida desde document.cookie", () => {
    setClientSucursalCookie(orgId1, sucId1);
    expect(getClientSucursalCookie(orgId1)).toBe(sucId1);
  });

  it("diferencia entre múltiples organizaciones en el cliente", () => {
    setClientSucursalCookie(orgId1, sucId1);
    setClientSucursalCookie(orgId2, sucId2);

    expect(getClientSucursalCookie(orgId1)).toBe(sucId1);
    expect(getClientSucursalCookie(orgId2)).toBe(sucId2);

    const map = getClientSucursalesMap();
    expect(map[orgId1]).toBe(sucId1);
    expect(map[orgId2]).toBe(sucId2);
  });

  it("actualizar una sucursal sobrescribe el valor previo", () => {
    setClientSucursalCookie(orgId1, sucId1);
    expect(getClientSucursalCookie(orgId1)).toBe(sucId1);

    setClientSucursalCookie(orgId1, sucId2);
    expect(getClientSucursalCookie(orgId1)).toBe(sucId2);
  });

  it("devuelve undefined para organizaciones sin cookie establecida", () => {
    expect(getClientSucursalCookie("99999999-9999-9999-9999-999999999999")).toBeUndefined();
  });
});
