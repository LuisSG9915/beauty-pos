import Link from "next/link";
import { Users } from "lucide-react";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { ClientForm } from "@/app/admin/client-form";
import { ClientImport } from "@/app/admin/client-import";
import { AdminNavCompact } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { clientes, miembrosOrganizaciones, organizaciones } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; q?: string; sort?: string; direction?: string; edit?: string }>;

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizationOptions = user.esAdministradorPlataforma
    ? await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(organizaciones).orderBy(asc(organizaciones.nombre))
    : await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(miembrosOrganizaciones).innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id)).where(and(eq(miembrosOrganizaciones.usuarioId, user.id), eq(miembrosOrganizaciones.estado, "activo")));
  const organizationId = params.organizationId && organizationOptions.some((organization) => organization.id === params.organizationId) ? params.organizationId : organizationOptions[0]?.id;

  if (!organizationId) {
    return <main className="min-h-screen bg-[#faf9f7] p-8 text-[#292522]"><h1 className="text-3xl font-semibold">Clientes</h1><p className="mt-3 text-[#81746c]">No tienes una organización asignada.</p></main>;
  }

  await requireOrganizationAccess(organizationId);
  const query = params.q?.trim() ?? "";
  const sort = params.sort === "createdAt" ? clientes.createdAt : clientes.nombre;
  const direction = params.direction === "desc" ? desc(sort) : asc(sort);
  const filters = [eq(clientes.organizacionId, organizationId)];

  if (query) {
    filters.push(or(ilike(clientes.nombre, `%${query}%`), ilike(clientes.apellidoPaterno, `%${query}%`), ilike(clientes.correo, `%${query}%`), ilike(clientes.telefono, `%${query}%`))!);
  }

  const clientRows = await db.select({ id: clientes.id, nombre: clientes.nombre, apellidoPaterno: clientes.apellidoPaterno, apellidoMaterno: clientes.apellidoMaterno, telefono: clientes.telefono, correo: clientes.correo, activo: clientes.activo, createdAt: clientes.createdAt }).from(clientes).where(and(...filters)).orderBy(direction).limit(100);
  const editingClient = params.edit ? (await db.select().from(clientes).where(and(eq(clientes.id, params.edit), eq(clientes.organizacionId, organizationId))).limit(1))[0] : undefined;
  const selectedOrganization = organizationOptions.find((organization) => organization.id === organizationId);

  return (
    <main className="min-h-screen bg-[#faf9f7] text-[#292522]">
      <header className="border-b border-[#eee6e0] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><div><Link className="text-sm text-[#a76348]" href="/admin">← Panel</Link><h1 className="mt-2 text-2xl font-semibold">Clientes</h1></div><p className="text-sm text-[#81746c]">{selectedOrganization?.nombre} · {selectedOrganization?.slug}</p></div></header>
      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-6"><AdminNavCompact organizationId={organizationId} /></div>
        <div className="mb-4 flex justify-end">
          <a className="rounded-xl border border-[#e3d9d1] bg-white px-4 py-2 text-sm font-medium text-[#a76348]" href={`/admin/clientes/export?organizationId=${organizationId}`}>Exportar CSV para Excel</a>
        </div>
        <form className="mb-6 grid gap-3 rounded-2xl border border-[#eadfd8] bg-white p-4 md:grid-cols-[1fr_220px_160px_auto]" method="get">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input className="h-10 rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" defaultValue={query} name="q" placeholder="Buscar por nombre, teléfono o correo" />
          <select className="h-10 rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm" defaultValue={params.sort ?? "nombre"} name="sort"><option value="nombre">Ordenar por nombre</option><option value="createdAt">Más recientes</option></select>
          <select className="h-10 rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm" defaultValue={params.direction ?? "asc"} name="direction"><option value="asc">Ascendente</option><option value="desc">Descendente</option></select>
          <button className="h-10 rounded-xl bg-[#2c2522] px-4 text-sm font-medium text-white" type="submit">Buscar</button>
        </form>
        {user.esAdministradorPlataforma && organizationOptions.length > 1 ? <div className="mb-6 flex flex-wrap gap-2">{organizationOptions.map((organization) => <Link className={`rounded-full border px-3 py-1.5 text-xs ${organization.id === organizationId ? "border-[#b8795d] bg-[#f8eee8] text-[#a76348]" : "border-[#e3d9d1] bg-white text-[#81746c]"}`} href={`/admin/clientes?organizationId=${organization.id}`} key={organization.id}>{organization.nombre} · {organization.slug}</Link>)}</div> : null}
        <ClientImport organizationId={organizationId} />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <ClientForm organizationId={organizationId} initial={editingClient} />
          <section className="rounded-2xl border border-[#eadfd8] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div><h2 className="font-semibold">Clientes registrados</h2><p className="mt-1 text-sm text-[#625b55]">{clientRows.length} resultado(s)</p></div>
              <Link className="rounded-xl bg-[#8a5140] px-3 py-2 text-sm font-medium text-white" href={`/admin/clientes?organizationId=${organizationId}`}>Nuevo</Link>
            </div>
            <div className="mt-5 overflow-x-auto">
              {clientRows.length === 0 ? <EmptyState description="Prueba con otra búsqueda o registra tu primer cliente." icon={Users} title="No hay clientes" /> : <table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]"><tr><th className="px-3 py-3 font-medium">Cliente</th><th className="px-3 py-3 font-medium">Contacto</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 font-medium">Acción</th></tr></thead><tbody>{clientRows.map((client) => <tr className="border-b border-[#f1eeea] last:border-0" key={client.id}><td className="px-3 py-4 font-medium">{[client.nombre, client.apellidoPaterno, client.apellidoMaterno].filter(Boolean).join(" ")}</td><td className="px-3 py-4 text-[#625b55]">{client.telefono || "Sin teléfono"}<br />{client.correo || "Sin correo"}</td><td className="px-3 py-4"><StatusBadge active={client.activo} /></td><td className="px-3 py-4"><Link className="font-medium text-[#8a5140] hover:underline" href={`/admin/clientes?organizationId=${organizationId}&edit=${client.id}`}>Editar</Link></td></tr>)}</tbody></table>}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
