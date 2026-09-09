import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";

import { UnitForm } from "@/app/admin/unidades-medida/unit-form";
import { toggleUnit } from "@/app/admin/unidades-medida/actions";
import { AdminNavCompact } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { catUnidadesMedida } from "@/db/schema/catalogs";
import { miembrosOrganizaciones, organizaciones } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; edit?: string }>;

export default async function UnitsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizations = user.esAdministradorPlataforma
    ? await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(organizaciones).orderBy(asc(organizaciones.nombre))
    : await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(miembrosOrganizaciones).innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id)).where(and(eq(miembrosOrganizaciones.usuarioId, user.id), eq(miembrosOrganizaciones.estado, "activo")));
  const organizationId = params.organizationId && organizations.some((item) => item.id === params.organizationId) ? params.organizationId : organizations[0]?.id;
  if (!organizationId) return <main className="min-h-screen bg-[#f8f7f5] p-8"><h1 className="text-3xl font-semibold">Unidades de medida</h1><p className="mt-3 text-[#625b55]">No tienes una organización asignada.</p></main>;
  await requireOrganizationAccess(organizationId);
  const units = await db.select({ id: catUnidadesMedida.id, clave: catUnidadesMedida.clave, nombre: catUnidadesMedida.nombre, activo: catUnidadesMedida.activo }).from(catUnidadesMedida).where(eq(catUnidadesMedida.organizacionId, organizationId)).orderBy(asc(catUnidadesMedida.nombre));
  const editing = params.edit ? (await db.select({ id: catUnidadesMedida.id, clave: catUnidadesMedida.clave, nombre: catUnidadesMedida.nombre }).from(catUnidadesMedida).where(and(eq(catUnidadesMedida.id, params.edit), eq(catUnidadesMedida.organizacionId, organizationId))).limit(1))[0] : undefined;

  return (
    <main className="min-h-screen bg-[#f8f7f5] text-[#2d2926]">
      <header className="border-b border-[#ded8d2] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div>
            <Link className="text-sm text-[#8a5140]" href="/admin">← Panel</Link>
            <h1 className="mt-2 text-2xl font-semibold">Unidades de medida</h1>
          </div>
          <Link className="text-sm text-[#8a5140]" href={`/admin/productos?organizationId=${organizationId}`}>Ver productos →</Link>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-6"><AdminNavCompact organizationId={organizationId} /></div>
        <div className="mb-6 flex flex-wrap gap-2">
          {organizations.map((organization) => (
            <Link className={organization.id === organizationId ? "rounded-full border border-[#8a5140] bg-[#f2e3dc] px-3 py-1.5 text-xs font-medium text-[#60392e]" : "rounded-full border border-[#ded8d2] bg-white px-3 py-1.5 text-xs text-[#625b55]"} href={`/admin/unidades-medida?organizationId=${organization.id}`} key={organization.id}>{organization.nombre} · {organization.slug}</Link>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <UnitForm initial={editing} organizationId={organizationId} />
          <section className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Unidades registradas</h2>
                <p className="mt-1 text-sm text-[#625b55]">{units.length} resultado(s)</p>
              </div>
              <Link className="rounded-xl bg-[#8a5140] px-3 py-2 text-sm font-medium text-white" href={`/admin/unidades-medida?organizationId=${organizationId}`}>Nueva</Link>
            </div>
            {units.length === 0 ? (
              <div className="mt-5"><EmptyState description="Crea unidades como pieza, litro, gramo o mililitro para el inventario." title="No hay unidades" /></div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[440px] text-left text-sm">
                  <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                    <tr>
                      <th className="py-2 pr-4">Clave</th>
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Estado</th>
                      <th className="py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((unit) => (
                      <tr className="border-b border-[#f1eeea]" key={unit.id}>
                        <td className="py-3 pr-4 font-mono text-xs">{unit.clave}</td>
                        <td className="py-3 pr-4 font-medium">{unit.nombre}</td>
                        <td className="py-3 pr-4"><StatusBadge active={unit.activo} /></td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" href={`/admin/unidades-medida?organizationId=${organizationId}&edit=${unit.id}`}>Editar</Link>
                            <form action={toggleUnit}>
                              <input name="organizacionId" type="hidden" value={organizationId} />
                              <input name="id" type="hidden" value={unit.id} />
                              <input name="activo" type="hidden" value={String(unit.activo)} />
                              <button className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" type="submit">{unit.activo ? "Ocultar" : "Activar"}</button>
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
