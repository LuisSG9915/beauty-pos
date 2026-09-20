import { describe, expect, it } from "vitest";

import { getAdminNavSections } from "@/components/admin-nav";

function allPaths(sections: ReturnType<typeof getAdminNavSections>) {
  return sections.flatMap((section) => section.items.map((item) => item.path));
}

describe("getAdminNavSections", () => {
  it("admin de plataforma ve todo, incluida la sección Plataforma", () => {
    const sections = getAdminNavSections(true, null);
    const paths = allPaths(sections);
    expect(paths).toContain("/admin/agenda");
    expect(paths).toContain("/admin/pos");
    expect(paths).toContain("/admin/caja");
    expect(paths).toContain("/admin/inventario");
    expect(paths).toContain("/admin/gastos");
    expect(paths).toContain("/admin/comisiones");
    expect(paths).toContain("/admin");
    expect(sections.some((s) => s.title === "Plataforma")).toBe(true);
  });

  it("miembro sin permisos solo ve Ayuda", () => {
    const sections = getAdminNavSections(false, new Set());
    expect(allPaths(sections)).toEqual(["/admin/ayuda"]);
  });

  it("miembro con permisos parciales solo ve sus módulos", () => {
    const sections = getAdminNavSections(
      false,
      new Set(["agenda.ver", "clientes.ver"]),
    );
    const paths = allPaths(sections);
    expect(paths).toEqual(
      expect.arrayContaining(["/admin/agenda", "/admin/mi-dia", "/admin/clientes", "/admin/ayuda"]),
    );
    expect(paths).not.toContain("/admin/pos");
    expect(paths).not.toContain("/admin/caja");
    expect(paths).not.toContain("/admin/inventario");
    expect(paths).not.toContain("/admin/servicios");
    expect(paths).not.toContain("/admin/gastos");
    expect(paths).not.toContain("/admin/comisiones");
    expect(sections.some((s) => s.title === "Catálogos")).toBe(false);
  });

  it("oculta toda la sección Catálogos sin catalogos.ver", () => {
    const sections = getAdminNavSections(false, new Set(["ventas.ver"]));
    const catalogos = sections.find((s) => s.title === "Catálogos");
    expect(catalogos).toBeUndefined();
    const paths = allPaths(sections);
    expect(paths).toEqual(expect.arrayContaining(["/admin/pos", "/admin/ventas"]));
    expect(paths).not.toContain("/admin/servicios");
  });

  it("permissions null sin ser plataforma muestra módulos pero no Plataforma", () => {
    const sections = getAdminNavSections(false, null);
    const paths = allPaths(sections);
    expect(paths.length).toBeGreaterThan(5);
    expect(sections.some((s) => s.title === "Plataforma")).toBe(false);
  });
});
