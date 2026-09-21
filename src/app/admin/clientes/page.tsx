import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Download, Upload, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientForm } from "@/app/admin/client-form";
import { ClientImport } from "@/app/admin/client-import";
import { ClientSheet } from "@/app/admin/clientes/client-sheet";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatCard, StatCardGrid } from "@/components/admin/stat-card";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type SearchParams = Promise<AdminSearchParams>;

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "clientes.ver");
  const organizationId = context.organization.id;
  const puedeEditar = hasPermission(context.access, "clientes.editar");
  const puedeExportar = hasPermission(context.access, "clientes.exportar");
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const sortParam = firstParam(params.sort);
  const directionParam = firstParam(params.direction);
  const sort = sortParam === "createdAt" ? clientes.createdAt : clientes.nombre;
  const direction = directionParam === "desc" ? desc(sort) : asc(sort);
  const pagina = Math.max(1, Number.parseInt(firstParam(params.pagina) ?? "1", 10) || 1);
  const filters = [eq(clientes.organizacionId, organizationId)];

  if (query) {
    filters.push(or(ilike(clientes.nombre, `%${query}%`), ilike(clientes.apellidoPaterno, `%${query}%`), ilike(clientes.correo, `%${query}%`), ilike(clientes.telefono, `%${query}%`))!);
  }

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [stats, totalRows, clientRows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        conTelefono: sql<number>`count(*) filter (where ${clientes.telefono} is not null and ${clientes.telefono} <> '')::int`,
        conCorreo: sql<number>`count(*) filter (where ${clientes.correo} is not null and ${clientes.correo} <> '')::int`,
        nuevosMes: sql<number>`count(*) filter (where ${clientes.createdAt} >= ${inicioMes})::int`,
      })
      .from(clientes)
      .where(eq(clientes.organizacionId, organizationId)),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(clientes)
      .where(and(...filters)),
    db
      .select({ id: clientes.id, nombre: clientes.nombre, apellidoPaterno: clientes.apellidoPaterno, apellidoMaterno: clientes.apellidoMaterno, telefono: clientes.telefono, correo: clientes.correo, activo: clientes.activo })
      .from(clientes)
      .where(and(...filters))
      .orderBy(direction)
      .limit(PAGE_SIZE)
      .offset((pagina - 1) * PAGE_SIZE),
  ]);

  const kpi = stats[0] ?? { total: 0, conTelefono: 0, conCorreo: 0, nuevosMes: 0 };
  const totalFiltrado = totalRows[0]?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / PAGE_SIZE));
  const paginaActual = Math.min(pagina, totalPaginas);

  const editId = firstParam(params.edit);
  const editingClient = editId
    ? (await db.select().from(clientes).where(and(eq(clientes.id, editId), eq(clientes.organizacionId, organizationId))).limit(1))[0]
    : undefined;
  const modoNuevo = firstParam(params.nuevo) === "1";
  const modoImportar = firstParam(params.importar) === "1";

  const hrefBase = (extra?: Record<string, string | null>) =>
    buildAdminHref("/clientes", {
      organizationId,
      extra: { q: query || null, sort: sortParam ?? null, direction: directionParam ?? null, ...extra },
    });
  const hrefCerrar = hrefBase({ nuevo: null, edit: null, importar: null, pagina: paginaActual > 1 ? String(paginaActual) : null });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <>
            {puedeExportar ? (
              // <a> nativo, no <Link>: una descarga no es navegación y nunca
              // debe prefetchearse — el handler registra auditoría por descarga.
              <Button
                nativeButton={false}
                render={<a download href={`/admin/clientes/export?organizationId=${organizationId}`} />}
                variant="outline"
              >
                <Download aria-hidden="true" />
                Exportar
              </Button>
            ) : null}
            {puedeEditar ? (
              <Button
                nativeButton={false}
                render={<Link href={hrefBase({ importar: "1" })} prefetch={false} />}
                variant="outline"
              >
                <Upload aria-hidden="true" />
                Importar
              </Button>
            ) : null}
            {puedeEditar ? (
              <Button
                data-action-clave="1"
                data-action-id="clientes.nuevo"
                nativeButton={false}
                render={<Link href={hrefBase({ nuevo: "1" })} prefetch={false} />}
                size="lg"
              >
                <UserPlus aria-hidden="true" />
                Nuevo cliente
              </Button>
            ) : null}
          </>
        }
        description="Contactos, historial y expedientes de tu salón."
        title="Clientes"
      />

      <StatCardGrid>
        <StatCard icon={Users} label="Clientes registrados" value={kpi.total} />
        <StatCard hint="Altas desde el día 1" label="Nuevos este mes" value={kpi.nuevosMes} />
        <StatCard hint="Listos para confirmar citas" label="Con teléfono" value={kpi.conTelefono} />
        <StatCard hint="A quienes puedes escribir" label="Con correo" value={kpi.conCorreo} />
      </StatCardGrid>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="min-w-56 flex-1">
          <FieldLabel>Buscar</FieldLabel>
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre, teléfono o correo" />
        </Field>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="secondary">Buscar</Button>
          {query ? (
            <Button nativeButton={false} render={<Link href={hrefBase({ pagina: null })} prefetch={false} />} variant="ghost">
              Limpiar
            </Button>
          ) : null}
        </div>
        {/* Ordenación plegada: ajuste secundario, no parte del flujo diario. */}
        <details className="w-full">
          <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
            Cambiar el orden de la lista
          </summary>
          <div className="mt-3 grid max-w-md gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Orden</FieldLabel>
              <Select defaultValue={sortParam ?? "nombre"} key={sortParam ?? "nombre"} name="sort">
                <option value="nombre">Por nombre</option>
                <option value="createdAt">Más recientes</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Dirección</FieldLabel>
              <Select defaultValue={directionParam ?? "asc"} key={directionParam ?? "asc"} name="direction">
                <option value="asc">Ascendente</option>
                <option value="desc">Descendente</option>
              </Select>
            </Field>
          </div>
        </details>
      </form>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {clientRows.length === 0 ? (
          <div className="p-6">
            <EmptyState
              action={puedeEditar ? (
                <Button
                  data-action-clave="1"
                  data-action-id="clientes.nuevo"
                  nativeButton={false}
                  render={<Link href={hrefBase({ nuevo: "1" })} prefetch={false} />}
                  size="lg"
                >
                  <UserPlus aria-hidden="true" />
                  Nuevo cliente
                </Button>
              ) : undefined}
              description={query ? "Ningún cliente coincide con la búsqueda." : "Registra tu primer cliente para agendar y cobrar más rápido."}
              icon={Users}
              title={query ? "Sin resultados" : "No hay clientes"}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Correo</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.map((client) => (
                  <tr className="border-b border-border transition-colors last:border-0 hover:bg-muted/60" key={client.id}>
                    <td className="px-4 py-3.5 font-medium">
                      <Link className="inline-flex min-h-6 items-center hover:text-primary hover:underline" href={buildAdminHref(`/clientes/${client.id}`, { organizationId })} prefetch={false}>
                        {[client.nombre, client.apellidoPaterno, client.apellidoMaterno].filter(Boolean).join(" ")}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">{client.telefono || "—"}</td>
                    <td className="max-w-56 truncate px-4 py-3.5 text-muted-foreground">{client.correo || "—"}</td>
                    <td className="px-4 py-3.5"><StatusBadge active={client.activo} /></td>
                    <td className="px-4 py-3.5 text-right">
                      <Link className="inline-flex min-h-9 items-center font-medium text-primary hover:underline" href={hrefBase({ edit: client.id, pagina: String(paginaActual) })} prefetch={false}>
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPaginas > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
            <span>
              Página {paginaActual} de {totalPaginas} · {totalFiltrado} cliente(s)
            </span>
            <div className="flex items-center gap-2">
              {paginaActual > 1 ? (
                <Button nativeButton={false} render={<Link href={hrefBase({ pagina: String(paginaActual - 1) })} prefetch={false} />} size="sm" variant="outline">
                  Anterior
                </Button>
              ) : null}
              {paginaActual < totalPaginas ? (
                <Button nativeButton={false} render={<Link href={hrefBase({ pagina: String(paginaActual + 1) })} prefetch={false} />} size="sm" variant="outline">
                  Siguiente
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      {/* Alta, edición e importación comparten el mismo panel lateral; el modo
          activo lo define la URL para que sea enlazable y sobreviva SSR. */}
      <ClientSheet
        closeHref={hrefCerrar}
        description="Solo el nombre es obligatorio; el teléfono ayuda a confirmar citas."
        key={`${modoNuevo}-${editingClient?.id ?? ""}-${editingClient?.updatedAt?.getTime() ?? ""}`}
        open={modoNuevo || Boolean(editingClient)}
        title={editingClient ? "Editar cliente" : "Nuevo cliente"}
      >
        <ClientForm initial={editingClient} organizationId={organizationId} />
      </ClientSheet>
      <ClientSheet
        closeHref={hrefCerrar}
        description="Carga un CSV guardado desde Excel con tus clientes."
        key="importar"
        open={modoImportar}
        title="Importar clientes"
      >
        <ClientImport organizationId={organizationId} />
      </ClientSheet>
    </div>
  );
}
