import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Punto de corte mínimo en que una columna secundaria se muestra. En móvil la
 * tabla cede el lugar a las tarjetas (`RegistroList`), pero entre `md` y el
 * escritorio amplio conviene ocultar columnas secundarias para que la fila
 * siga legible sin scroll horizontal agresivo.
 */
export type DataTableBreakpoint = "sm" | "md" | "lg" | "xl";

export type DataTableColumn<Row> = {
  /** Identidad estable de la columna (clave de React). */
  id: string;
  /** Encabezado visible, en español de salón (`src/lib/glosario.ts`). */
  header: ReactNode;
  /** Contenido de la celda para cada fila. */
  cell: (row: Row, index: number) => ReactNode;
  /** Oculta la columna por debajo de este punto de corte. */
  hideBelow?: DataTableBreakpoint;
  /** Alineación horizontal de encabezado y celdas (default `left`). */
  align?: "left" | "right" | "center";
  /** Fija la columna al borde derecho durante el scroll horizontal. */
  stickyEnd?: boolean;
  /** Clases extra para el `<th>`. */
  headerClassName?: string;
  /** Clases extra para cada `<td>`. */
  cellClassName?: string;
};

const HIDE_BELOW_CLASS: Record<DataTableBreakpoint, string> = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

const ALIGN_CLASS = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

/**
 * Clases resueltas de una columna (alineación, ocultamiento y sticky). Se
 * exporta para probarlas sin renderizar React.
 */
export function dataTableColumnClass(
  column: Pick<DataTableColumn<unknown>, "align" | "hideBelow" | "stickyEnd">,
): string {
  return cn(
    column.align && column.align !== "left" ? ALIGN_CLASS[column.align] : null,
    column.hideBelow ? HIDE_BELOW_CLASS[column.hideBelow] : null,
    // El fondo sólido evita que las celdas de atrás se vean bajo la columna
    // fija durante el scroll horizontal dentro de la tarjeta.
    column.stickyEnd ? "sticky right-0 bg-card" : null,
  );
}

/**
 * Tabla administrativa compacta (`text-op-xs`, 13px) con columnas declarativas.
 * Renderiza el contenedor de scroll horizontal; la página decide cuándo es
 * visible (el patrón del proyecto es `hidden md:block` + `RegistroList` en
 * móvil). La entrada escalonada (`anim-entrada`) replica la de las filas
 * escritas a mano.
 */
export function DataTable<Row>({
  columns,
  emptyMessage = "Sin registros.",
  minWidth = "640px",
  rowKey,
  rows,
  className,
}: {
  columns: Array<DataTableColumn<Row>>;
  /** Mensaje de la fila única cuando `rows` viene vacío. */
  emptyMessage?: string;
  /** Ancho mínimo antes de activar scroll horizontal. */
  minWidth?: string;
  rowKey: (row: Row, index: number) => string;
  rows: Row[];
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left text-op-xs leading-5" style={{ minWidth }}>
        <thead className="border-b border-border uppercase tracking-wide text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th
                className={cn(
                  "px-4 py-2.5 font-medium",
                  dataTableColumnClass(column),
                  column.headerClassName,
                )}
                key={column.id}
                scope="col"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              className="anim-entrada border-b border-border transition-colors last:border-0 hover:bg-muted/60"
              key={rowKey(row, index)}
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
            >
              {columns.map((column) => (
                <td
                  className={cn(
                    "px-4 py-3",
                    dataTableColumnClass(column),
                    column.cellClassName,
                  )}
                  key={column.id}
                >
                  {column.cell(row, index)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-10 text-center text-muted-foreground" colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
