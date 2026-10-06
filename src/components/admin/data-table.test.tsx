import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataTable, dataTableColumnClass, type DataTableColumn } from "@/components/admin/data-table";

describe("dataTableColumnClass", () => {
  it("columna base sin alineación, ocultamiento ni sticky", () => {
    expect(dataTableColumnClass({})).toBe("");
  });

  it("aplica alineación derecha", () => {
    expect(dataTableColumnClass({ align: "right" })).toBe("text-right");
  });

  it("alineación izquierda es el default (sin clase)", () => {
    expect(dataTableColumnClass({ align: "left" })).toBe("");
  });

  it("oculta la columna por debajo del punto de corte", () => {
    expect(dataTableColumnClass({ hideBelow: "md" })).toBe("hidden md:table-cell");
    expect(dataTableColumnClass({ hideBelow: "lg" })).toBe("hidden lg:table-cell");
  });

  it("marca la columna de acciones como sticky al final", () => {
    expect(dataTableColumnClass({ stickyEnd: true })).toContain("sticky right-0");
  });
});

describe("DataTable", () => {
  type Row = { id: string; nombre: string };
  const columns: Array<DataTableColumn<Row>> = [
    { id: "nombre", header: "Nombre", cell: (row) => row.nombre },
    { id: "extra", header: "Detalle", cell: () => "x", hideBelow: "lg" },
    { id: "acciones", header: "Acciones", cell: () => "Editar", align: "right", stickyEnd: true },
  ];

  it("renderiza encabezados y celdas declarativas", () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} rowKey={(row) => row.id} rows={[{ id: "1", nombre: "Corte" }]} />,
    );
    expect(html).toContain("Nombre");
    expect(html).toContain("Corte");
    expect(html).toContain("hidden lg:table-cell");
    expect(html).toContain("sticky right-0");
    expect(html).toContain("text-op-xs");
  });

  it("muestra la fila vacía cuando no hay registros", () => {
    const html = renderToStaticMarkup(
      <DataTable columns={columns} emptyMessage="Sin registros de prueba." rowKey={(row) => row.id} rows={[]} />,
    );
    expect(html).toContain("Sin registros de prueba.");
    expect(html).toContain(`colSpan="${columns.length}"`);
  });
});
