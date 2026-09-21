import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ClientForm } from "@/app/admin/client-form";
import { ClientImport } from "@/app/admin/client-import";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
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

type SearchParams = Promise<AdminSearchParams>;

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "clientes.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const sortParam = firstParam(params.sort);
  const directionParam = firstParam(params.direction);
  const sort = sortParam === "createdAt" ? clientes.createdAt : clientes.nombre;
  const direction = directionParam === "desc" ? desc(sort) : asc(sort);
  const filters = [eq(clientes.organizacionId, organizationId)];

  if (query) {
    filters.push(or(ilike(clientes.nombre, `%${query}%`), ilike(clientes.apellidoPaterno, `%${query}%`), ilike(clientes.correo, `%${query}%`), ilike(clientes.telefono, `%${query}%`))!);
  }

  const clientRows = await db
    .select({ id: clientes.id, nombre: clientes.nombre, apellidoPaterno: clientes.apellidoPaterno, apellidoMaterno: clientes.apellidoMaterno, telefono: clientes.telefono, correo: clientes.correo, activo: clientes.activo })
    .from(clientes)
    .where(and(...filters))
    .orderBy(direction)
    .limit(100);
  const editId = firstParam(params.edit);
  const editingClient = editId
    ? (await db.select().from(clientes).where(and(eq(clientes.id, editId), eq(clientes.organizacionId, organizationId))).limit(1))[0]
    : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          hasPermission(context.access, "clientes.exportar") ? (
            <Button
              nativeButton={false}
              render={<Link href={`/admin/clientes/export?organizationId=${organizationId}`} />}
              variant="outline"
            >
              Exportar CSV para Excel
            </Button>
          ) : null
        }
        description="Directorio de clientes de la organización."
        title="Clientes"
      />

      <form className="grid gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field>
          <FieldLabel>Buscar cliente</FieldLabel>
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre, teléfono o correo" />
        </Field>
        <Button className="rounded-xl" type="submit">Buscar</Button>
        {/* Ordenación plegada: ajuste secundario, no parte del flujo diario. */}
        <details className="sm:col-span-2">
          <summary className="cursor-pointer list-none text-sm font-medium text-[#625b55] hover:text-[#8a5140]">
            Cambiar el orden de la lista
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

      {/* Importar es una acción de arranque (una vez), no del trabajo diario. */}
      <details className="rounded-2xl border border-[#eadfd8] bg-white p-4 shadow-sm">
        <summary className="cursor-pointer list-none text-sm font-semibold text-[#403a35] hover:text-[#8a5140]">
          Importar clientes desde Excel (opcional)
        </summary>
        <div className="mt-4">
          <ClientImport organizationId={organizationId} />
        </div>
      </details>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <ClientForm initial={editingClient} key={`${editingClient?.id ?? "nuevo"}-${editingClient?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        <AdminCard
          actions={
            <Button nativeButton={false} render={<Link href={buildAdminHref("/clientes", { organizationId })} />}>
              Nuevo
            </Button>
          }
          className="self-start"
          description={`${clientRows.length} resultado(s)`}
          title="Clientes registrados"
        >
          {clientRows.length === 0 ? (
            <EmptyState description="Prueba con otra búsqueda o registra tu primer cliente." icon={Users} title="No hay clientes" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                  <tr>
                    <th className="px-3 py-3 font-medium">Cliente</th>
                    <th className="px-3 py-3 font-medium">Contacto</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-3 py-3 font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {clientRows.map((client) => (
                    <tr className="border-b border-[#f1eeea] last:border-0" key={client.id}>
                      <td className="px-3 py-4 font-medium">
                        <Link className="hover:text-[#8a5140] hover:underline" href={buildAdminHref(`/clientes/${client.id}`, { organizationId })}>
                          {[client.nombre, client.apellidoPaterno, client.apellidoMaterno].filter(Boolean).join(" ")}
                        </Link>
                      </td>
                      <td className="px-3 py-4 text-[#625b55]">
                        {client.telefono || "Sin teléfono"}
                        <br />
                        {client.correo || "Sin correo"}
                      </td>
                      <td className="px-3 py-4"><StatusBadge active={client.activo} /></td>
                      <td className="px-3 py-4">
                        <Link className="inline-flex min-h-9 items-center font-medium text-[#8a5140] hover:underline" href={buildAdminHref("/clientes", { organizationId, extra: { edit: client.id, q: query || null } })}>
                          Editar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
