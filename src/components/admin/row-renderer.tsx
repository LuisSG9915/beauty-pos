"use client";

import type { ReactNode } from "react";

import { DataTable, type DataTableColumn } from "./data-table";
import { RegistroCard, RegistroList, type RegistroCampo } from "./registro-lista";
import { VistaAdaptativaClient } from "./vista-adaptativa-client";
import type { ViewportPreference } from "@/lib/viewport-preference";

/**
 * Configuración única para renderizar una fila tanto en tabla (escritorio)
 * como en tarjeta (móvil). Elimina la duplicación de definir `columns`
 * y `campos` por separado en cada página.
 */
export type RowRenderer<Row> = {
  /** Columnas para DataTable (escritorio). */
  columns: Array<DataTableColumn<Row>>;
  /** Genera los campos para RegistroCard (móvil) a partir de una fila. */
  getCampos: (row: Row) => RegistroCampo[];
  /** Título principal de la tarjeta (móvil). */
  getTitulo: (row: Row) => ReactNode;
  /** Subtítulo opcional bajo el título (móvil). */
  getSubtitulo?: (row: Row) => ReactNode;
  /** Badge/insignia de estado alineada a la derecha (móvil). */
  getBadge?: (row: Row) => ReactNode;
  /** Acciones al pie de la tarjeta (móvil). */
  getAcciones?: (row: Row) => ReactNode;
  /** Clave única de la fila (para `rowKey` en DataTable y `key` en RegistroCard). */
  getKey: (row: Row) => string;
};

/**
 * Renderiza una lista adaptativa (tabla en escritorio, tarjetas en móvil)
 * a partir de una configuración única `RowRenderer`.
 *
 * Recibe `viewport` como prop (resuelta en Server Component y pasada al cliente).
 * Uso típico en Server Component:
 * ```tsx
 * const renderer = createClientRenderer<ClienteRow>({
 *   columns: [...],
 *   getCampos: (row) => [...],
 *   getTitulo: (row) => <Link>{row.nombre}</Link>,
 *   getKey: (row) => row.id,
 * });
 * // En Server Component page:
 * const viewport = await leerViewportPreference();
 * return <AdaptiveList rows={rows} renderer={renderer} viewport={viewport} />;
 * ```
 */
export function AdaptiveList<Row>({
  rows,
  renderer,
  className,
  emptyMessage = "Sin registros.",
  loading = false,
  minWidth = "640px",
  ariaLabel,
  viewport,
}: {
  rows: Row[];
  renderer: RowRenderer<Row>;
  className?: string;
  emptyMessage?: string;
  loading?: boolean;
  minWidth?: string;
  ariaLabel?: string;
  viewport: ViewportPreference | null;
}) {
  return (
    <VistaAdaptativaClient viewport={viewport} className={className}>
      <RegistroList className="p-3 md:hidden">
        {rows.map((row) => (
          <RegistroCard
            key={renderer.getKey(row)}
            titulo={renderer.getTitulo(row)}
            subtitulo={renderer.getSubtitulo?.(row)}
            badge={renderer.getBadge?.(row)}
            campos={renderer.getCampos(row)}
            acciones={renderer.getAcciones?.(row)}
          />
        ))}
      </RegistroList>
      <div className="hidden md:block">
        <DataTable
          columns={renderer.columns}
          rows={rows}
          rowKey={(row) => renderer.getKey(row)}
          emptyMessage={emptyMessage}
          loading={loading}
          minWidth={minWidth}
          ariaLabel={ariaLabel}
        />
      </div>
    </VistaAdaptativaClient>
  );
}

/**
 * Helper para crear un RowRenderer con tipado inferido.
 * Útil en Server Components donde se define la config y se pasa al cliente.
 */
export function createRowRenderer<Row>(config: RowRenderer<Row>): RowRenderer<Row> {
  return config;
}