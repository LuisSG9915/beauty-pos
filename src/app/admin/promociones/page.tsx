import Link from "next/link";
import { and, asc, desc, eq, ilike } from "drizzle-orm";

import { PromotionForm } from "@/app/admin/promociones/promotion-form";
import { togglePromotion } from "@/app/admin/promociones/actions";
import { AdminNavCompact } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { promociones } from "@/db/schema/catalogs";
import { miembrosOrganizaciones, organizaciones } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; q?: string; tipo?: string; estado?: string; edit?: string }>;

const TIPO_LABEL: Record<string, string> = { porcentaje: "Porcentaje", monto: "Monto fijo", "2x1": "2x1", paquete: "Paquete" };
const APLICA_LABEL: Record<string, string> = { producto: "Productos", servicio: "Servicios", ambos: "Ambos" };

export default async function PromotionsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizations = user.esAdministradorPlataforma
    ? await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(organizaciones).orderBy(asc(organizaciones.nombre))
    : await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(miembrosOrganizaciones).innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id)).where(and(eq(miembrosOrganizaciones.usuarioId, user.id), eq(miembrosOrganizaciones.estado, "activo")));
  const organizationId = params.organizationId && organizations.some((organization) => organization.id === params.organizationId) ? params.organizationId : organizations[0]?.id;
  if (!organizationId) return <main className="min-h-screen bg-[#f8f7f5] p-8"><h1 className="text-3xl font-semibold">Promociones</h1><p className="mt-3 text-[#625b55]">No tienes una organización asignada.</p></main>;
  await requireOrganizationAccess(organizationId);

  const query = params.q?.trim() ?? "";
  const tipo = params.tipo ?? "";
  const estado = params.estado ?? "";

  const filters = [eq(promociones.organizacionId, organizationId)];
  if (query) filters.push(ilike(promociones.nombre, `%${query}%`));
  if (tipo) filters.push(eq(promociones.tipo, tipo as "porcentaje" | "monto" | "2x1" | "paquete"));
  if (estado === "activo") filters.push(eq(promociones.activo, true));
  if (estado === "oculto") filters.push(eq(promociones.activo, false));

  const promotionRows = await db.select({ id: promociones.id, clave: promociones.clave, nombre: promociones.nombre, tipo: promociones.tipo, valor: promociones.valor, aplica: promociones.aplica, vigenciaDesde: promociones.vigenciaDesde, vigenciaHasta: promociones.vigenciaHasta, activo: promociones.activo }).from(promociones).where(and(...filters)).orderBy(desc(promociones.createdAt)).limit(100);

  const editing = params.edit ? (await db.select().from(promociones).where(and(eq(promociones.id, params.edit), eq(promociones.organizacionId, organizationId))).limit(1))[0] : undefined;
  const editingData = editing ? {
    id: editing.id,
    organizacionId: editing.organizacionId,
    clave: editing.clave,
    nombre: editing.nombre,
    descripcion: editing.descripcion,
    tipo: editing.tipo,
    valor: editing.valor,
    aplica: editing.aplica,
    vigenciaDesde: editing.vigenciaDesde,
    vigenciaHasta: editing.vigenciaHasta,
  } : undefined;

  const filterHref = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams({ organizationId });
    if (query) sp.set("q", query);
    if (tipo) sp.set("tipo", tipo);
    if (estado) sp.set("estado", estado);
    for (const [key, val] of Object.entries(next)) {
      if (val === undefined || val === "") sp.delete(key);
      else sp.set(key, val);
    }
    return `/admin/promociones?${sp.toString()}`;
  };

  return (
    <main className="min-h-screen bg-[#f8f7f5] text-[#2d2926]">
      <header className="border-b border-[#ded8d2] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div>
            <Link className="text-sm text-[#8a5140]" href="/admin">← Panel</Link>
            <h1 className="mt-2 text-2xl font-semibold">Promociones</h1>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-6"><AdminNavCompact organizationId={organizationId} /></div>
        <div className="mb-6 flex flex-wrap gap-2">
          {organizations.map((organization) => (
            <Link className={organization.id === organizationId ? "rounded-full border border-[#8a5140] bg-[#f2e3dc] px-3 py-1.5 text-xs font-medium text-[#60392e]" : "rounded-full border border-[#ded8d2] bg-white px-3 py-1.5 text-xs text-[#625b55]"} href={`/admin/promociones?organizationId=${organization.id}`} key={organization.id}>{organization.nombre} · {organization.slug}</Link>
          ))}
        </div>

        <form className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-[#ded8d2] bg-white p-4" method="get">
          <input name="organizationId" type="hidden" value={organizationId} />
          <input className="h-10 min-w-[200px] flex-1 rounded-xl border border-[#ded8d2] px-3 text-sm" defaultValue={query} name="q" placeholder="Buscar promoción" />
          <select className="h-10 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={tipo} name="tipo">
            <option value="">Todos los tipos</option>
            <option value="porcentaje">Porcentaje</option>
            <option value="monto">Monto fijo</option>
            <option value="2x1">2x1</option>
            <option value="paquete">Paquete</option>
          </select>
          <select className="h-10 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={estado} name="estado">
            <option value="">Todos los estados</option>
            <option value="activo">Activas</option>
            <option value="oculto">Ocultas</option>
          </select>
          <button className="rounded-xl bg-[#8a5140] px-4 text-sm font-medium text-white" type="submit">Filtrar</button>
          {(query || tipo || estado) && (
            <Link className="rounded-xl border border-[#ded8d2] px-4 py-2 text-sm text-[#625b55]" href={`/admin/promociones?organizationId=${organizationId}`}>Limpiar</Link>
          )}
        </form>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <PromotionForm initial={editingData} organizationId={organizationId} />
          <section className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Promociones registradas</h2>
                <p className="mt-1 text-sm text-[#625b55]">{promotionRows.length} resultado(s)</p>
              </div>
              <Link className="rounded-xl bg-[#8a5140] px-3 py-2 text-sm font-medium text-white" href={`/admin/promociones?organizationId=${organizationId}`}>Nueva</Link>
            </div>
            {promotionRows.length === 0 ? (
              <div className="mt-5"><EmptyState description="Crea descuentos, promociones 2x1 o paquetes para tus productos y servicios." title="No hay promociones" /></div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                    <tr>
                      <th className="py-2 pr-4">Clave</th>
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Tipo</th>
                      <th className="py-2 pr-4">Valor</th>
                      <th className="py-2 pr-4">Aplica</th>
                      <th className="py-2 pr-4">Vigencia</th>
                      <th className="py-2 pr-4">Estado</th>
                      <th className="py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotionRows.map((promo) => (
                      <tr className="border-b border-[#f1eeea]" key={promo.id}>
                        <td className="py-3 pr-4 font-mono text-xs">{promo.clave}</td>
                        <td className="py-3 pr-4 font-medium">{promo.nombre}</td>
                        <td className="py-3 pr-4"><span className="rounded-full bg-[#f1eeea] px-2.5 py-1 text-xs text-[#625b55]">{TIPO_LABEL[promo.tipo] ?? promo.tipo}</span></td>
                        <td className="py-3 pr-4 tabular-nums">{promo.tipo === "porcentaje" ? `${promo.valor}%` : promo.tipo === "2x1" ? "—" : `$${promo.valor}`}</td>
                        <td className="py-3 pr-4 text-xs text-[#625b55]">{APLICA_LABEL[promo.aplica] ?? promo.aplica}</td>
                        <td className="py-3 pr-4 text-xs text-[#625b55]">{promo.vigenciaDesde}{promo.vigenciaHasta ? ` → ${promo.vigenciaHasta}` : " → ∞"}</td>
                        <td className="py-3 pr-4"><StatusBadge active={promo.activo} /></td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" href={filterHref({ edit: promo.id })}>Editar</Link>
                            <form action={togglePromotion}>
                              <input name="organizacionId" type="hidden" value={organizationId} />
                              <input name="id" type="hidden" value={promo.id} />
                              <input name="activo" type="hidden" value={String(promo.activo)} />
                              <button className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" type="submit">{promo.activo ? "Ocultar" : "Activar"}</button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
