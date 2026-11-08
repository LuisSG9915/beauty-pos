"use client";

import Link from "next/link";

import { ClientForm } from "@/app/admin/client-form";
import { ClientImport } from "@/app/admin/client-import";
import { ClientSheet } from "@/app/admin/clientes/client-sheet";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { AdaptiveList, createRowRenderer, type RowRenderer } from "@/components/admin/row-renderer";
import type { DataTableColumn } from "@/components/admin/data-table";
import type { ViewportPreference } from "@/lib/viewport-preference";

import { UserPlus, Users } from "lucide-react";

type ClientRow = {
  id: string;
  nombre: string;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  telefono: string | null;
  correo: string | null;
  activo: boolean;
  ultimaVisita: string | null;
  totalGastado: string | null;
  citasProximas: number;
};

type EditingClient = {
  id: string;
  organizacionId: string;
  nombre: string;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  telefono: string | null;
  correo: string | null;
  fechaNacimiento: string | null;
  notasOperativas: string | null;
  rfc: string | null;
  razonSocial: string | null;
  codigoPostalFiscal: string | null;
  regimenFiscal: string | null;
  usoCfdi: string | null;
  updatedAt: Date | null;
};

type ClientesListProps = {
  rows: ClientRow[];
  organizationId: string;
  paginaActual: number;
  totalPaginas: number;
  totalFiltrado: number;
  puedeEditar: boolean;
  timeZone: string;
  currency: string;
  query: string;
  modoNuevo: boolean;
  editingClient?: EditingClient;
  modoImportar: boolean;
  viewport: ViewportPreference | null;
};

function nombreCompletoDe(client: ClientRow) {
  return [client.nombre, client.apellidoPaterno, client.apellidoMaterno].filter(Boolean).join(" ");
}

function hrefBase(
  organizationId: string,
  extra?: Record<string, string | null>
) {
  return buildAdminHref("/clientes", {
    organizationId,
    extra: { ...extra },
  });
}

function createClientRenderer(
  organizationId: string,
  paginaActual: number,
  puedeEditar: boolean,
  timeZone: string,
  currency: string
): RowRenderer<ClientRow> {
  const columns: Array<DataTableColumn<ClientRow>> = [
    {
      id: "cliente",
      header: "Cliente",
      cell: (client) => (
        <Link
          className="inline-flex min-h-6 items-center font-medium hover:text-primary hover:underline"
          href={buildAdminHref(`/clientes/${client.id}`, { organizationId })}
          prefetch={false}
        >
          {nombreCompletoDe(client)}
        </Link>
      ),
    },
    {
      id: "telefono",
      header: "Teléfono",
      cell: (client) => <span className="text-muted-foreground">{client.telefono || "—"}</span>,
    },
    {
      id: "correo",
      header: "Correo",
      cell: (client) => <span className="block max-w-56 truncate text-muted-foreground">{client.correo || "—"}</span>,
      hideBelow: "lg",
    },
    {
      id: "ultimaVisita",
      header: "Última visita",
      cell: (client) =>
        client.ultimaVisita ? (
          <span className="whitespace-nowrap text-muted-foreground">{formatDate(client.ultimaVisita, { timeZone })}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "totalGastado",
      header: "Total gastado",
      cell: (client) => <span className="tabular-nums">{formatCurrency(client.totalGastado, { currency })}</span>,
      align: "right",
    },
    {
      id: "proximas",
      header: "Próximas citas",
      cell: (client) => <span className="tabular-nums">{client.citasProximas}</span>,
      align: "right",
      hideBelow: "lg",
    },
    { id: "estado", header: "Estado", cell: (client) => <StatusBadge active={client.activo} /> },
    ...(puedeEditar
      ? [
          {
            id: "acciones",
            header: "Acciones",
            cell: (client: ClientRow) => (
              <Link
                className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs font-medium text-primary hover:bg-muted/60"
                data-action-id="clientes.editar"
                href={hrefBase(organizationId, { edit: client.id, pagina: String(paginaActual) })}
                prefetch={false}
              >
                Editar
              </Link>
            ),
            align: "right",
            stickyEnd: true,
          } satisfies DataTableColumn<ClientRow>,
        ]
      : []),
  ];

  return createRowRenderer<ClientRow>({
    columns,
    getKey: (client) => client.id,
    getTitulo: (client) => (
      <Link
        className="inline-flex min-h-11 items-center hover:text-primary hover:underline font-medium"
        href={buildAdminHref(`/clientes/${client.id}`, { organizationId })}
        prefetch={false}
      >
        {nombreCompletoDe(client)}
      </Link>
    ),
    getBadge: (client) => <StatusBadge active={client.activo} />,
    getCampos: (client) => [
      { label: "Teléfono", value: client.telefono || "—" },
      { label: "Correo", value: <span className="break-all">{client.correo || "—"}</span> },
      ...(client.ultimaVisita
        ? [{ label: "Última visita", value: formatDate(client.ultimaVisita, { timeZone }) }]
        : []),
      ...(client.totalGastado !== null
        ? [{ label: "Total gastado", value: formatCurrency(client.totalGastado, { currency }) }]
        : []),
      { label: "Próximas citas", value: String(client.citasProximas) },
    ],
    getAcciones: puedeEditar
      ? (client) => (
          <Link
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-3 text-op-xs text-muted-foreground hover:bg-muted/60"
            data-action-id="clientes.editar"
            href={hrefBase(organizationId, { edit: client.id, pagina: String(paginaActual) })}
            prefetch={false}
          >
            Editar
          </Link>
        )
      : undefined,
  });
}

export function ClientesList({
  rows,
  organizationId,
  paginaActual,
  totalPaginas,
  totalFiltrado,
  puedeEditar,
  timeZone,
  currency,
  query,
  modoNuevo,
  editingClient,
  modoImportar,
  viewport,
}: ClientesListProps) {
  const renderer = createClientRenderer(organizationId, paginaActual, puedeEditar, timeZone, currency);
  const hrefCerrar = hrefBase(organizationId, { nuevo: null, edit: null, importar: null, pagina: paginaActual > 1 ? String(paginaActual) : null });

  return (
    <div className="space-y-6">
      {rows.length === 0 ? (
        <div className="p-6">
          <div
            className="anim-entrada flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"
          >
            <Users aria-hidden="true" className="size-8 text-primary" strokeWidth={1.7} />
            <h3 className="mt-4 font-semibold text-foreground">{query ? "Sin resultados" : "No hay clientes"}</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {query ? "Ningún cliente coincide con la búsqueda." : "Registra tu primer cliente para agendar y cobrar más rápido."}
            </p>
            {puedeEditar ? (
              <div className="mt-5">
                <Button
                  data-action-id="clientes.nuevo"
                  nativeButton={false}
                  render={<Link href={hrefBase(organizationId, { nuevo: "1" })} prefetch={false} />}
                  size="lg"
                >
                  <UserPlus aria-hidden="true" />
                  Nuevo cliente
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <AdaptiveList
            rows={rows}
            renderer={renderer}
            emptyMessage={query ? "Ningún cliente coincide con la búsqueda." : "Registra tu primer cliente para agendar y cobrar más rápido."}
            minWidth="880px"
            ariaLabel="Lista de clientes"
            viewport={viewport}
          />
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                Página {paginaActual} de {totalPaginas} · {totalFiltrado} cliente(s)
              </span>
              <div className="flex items-center gap-2">
                {paginaActual > 1 ? (
                  <Button
                    className="min-h-11"
                    nativeButton={false}
                    render={<Link href={hrefBase(organizationId, { pagina: String(paginaActual - 1) })} prefetch={false} />}
                    size="sm"
                    variant="outline"
                  >
                    Anterior
                  </Button>
                ) : null}
                {paginaActual < totalPaginas ? (
                  <Button
                    className="min-h-11"
                    nativeButton={false}
                    render={<Link href={hrefBase(organizationId, { pagina: String(paginaActual + 1) })} prefetch={false} />}
                    size="sm"
                    variant="outline"
                  >
                    Siguiente
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </>
      )}

      {/* Alta, edición e importación comparten el mismo panel lateral; el modo
          activo lo define la URL para que sea enlazable y sobreviva SSR. Solo
          se montan cuando están abiertos para ahorrar SSR e hidratación. */}
      {modoNuevo || Boolean(editingClient) ? (
        <ClientSheet
          closeHref={hrefCerrar}
          description="Solo el nombre es obligatorio; el teléfono ayuda a confirmar citas."
          key={`${modoNuevo}-${editingClient?.id ?? ""}-${editingClient?.updatedAt?.getTime() ?? ""}`}
          open
          title={editingClient ? "Editar cliente" : "Nuevo cliente"}
        >
          <ClientForm initial={editingClient} organizationId={organizationId} />
        </ClientSheet>
      ) : null}
      {modoImportar ? (
        <ClientSheet
          closeHref={hrefCerrar}
          description="Carga un CSV guardado desde Excel con tus clientes."
          key="importar"
          open
          title="Importar clientes"
        >
          <ClientImport organizationId={organizationId} />
        </ClientSheet>
      ) : null}
    </div>
  );
}