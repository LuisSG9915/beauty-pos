import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";

import { TaxForm } from "@/app/admin/impuestos/tax-form";
import { toggleTax } from "@/app/admin/impuestos/actions";
import { AdminNavCompact } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { catImpuestos } from "@/db/schema/catalogs";
import { miembrosOrganizaciones, organizaciones } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; edit?: string }>;

const TIPO_LABEL: Record<string, string> = { agregado: "Agregado", incluido: "Incluido", exento: "Exento" };

export default async function TaxesPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizations = user.esAdministradorPlataforma
    ? await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(organizaciones).orderBy(asc(organizaciones.nombre))
    : await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(miembrosOrganizaciones).innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id)).where(and(eq(miembrosOrganizaciones.usuarioId, user.id), eq(miembrosOrganizaciones.estado, "activo")));
  const organizationId = params.organizationId && organizations.some((item) => item.id === params.organizationId) ? params.organizationId : organizations[0]?.id;
  if (!organizationId) return <main className="min-h-screen bg-[#f8f7f5] p-8"><h1 className="text-3xl font-semibold">Impuestos</h1><p className="mt-3 text-[#625b55]">No tienes una organización asignada.</p></main>;
  await requireOrganizationAccess(organizationId);
  const taxes = await db.select({ id: catImpuestos.id, clave: catImpuestos.clave, nombre: catImpuestos.nombre, tasa: catImpuestos.tasa, tipo: catImpuestos.tipo, activo: catImpuestos.activo }).from(catImpuestos).where(eq(catImpuestos.organizacionId, organizationId)).orderBy(asc(catImpuestos.nombre));
  const editing = params.edit ? (await db.select({ id: catImpuestos.id, clave: catImpuestos.clave, nombre: catImpuestos.nombre, tasa: catImpuestos.tasa, tipo: catImpuestos.tipo }).from(catImpuestos).where(and(eq(catImpuestos.id, params.edit), eq(catImpuestos.organizacionId, organizationId))).limit(1))[0] : undefined;

  return (
    <main className="min-h-screen bg-[#f8f7f5] text-[#2d2926]">
      <header className="border-b border-[#ded8d2] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div>
            <Link className="text-sm text-[#8a5140]" href="/admin">← Panel</Link>
            <h1 className="mt-2 text-2xl font-semibold">Impuestos</h1>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-6"><AdminNavCompact organizationId={organizationId} /></div>
        <div className="mb-6 flex flex-wrap gap-2">
          {organizations.map((organization) => (
            <Link className={organization.id === organizationId ? "rounded-full border border-[#8a5140] bg-[#f2e3dc] px-3 py-1.5 text-xs font-medium text-[#60392e]" : "rounded-full border border-[#ded8d2] bg-white px-3 py-1.5 text-xs text-[#625b55]"} href={`/admin/impuestos?organizationId=${organization.id}`} key={organization.id}>{organization.nombre} · {organization.slug}</Link>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <TaxForm initial={editing} organizationId={organizationId} />
          <section className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Impuestos registrados</h2>
                <p className="mt-1 text-sm text-[#625b55]">{taxes.length} resultado(s)</p>
              </div>
              <Link className="rounded-xl bg-[#8a5140] px-3 py-2 text-sm font-medium text-white" href={`/admin/impuestos?organizationId=${organizationId}`}>Nuevo</Link>
            </div>
            {taxes.length === 0 ? (
              <div className="mt-5"><EmptyState description="Crea impuestos como IVA (16%) o IEPS para aplicarlos en el POS." title="No hay impuestos" /></div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                    <tr>
                      <th className="py-2 pr-4">Clave</th>
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Tasa</th>
                      <th className="py-2 pr-4">Tipo</th>
                      <th className="py-2 pr-4">Estado</th>
                      <th className="py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxes.map((tax) => (
                      <tr className="border-b border-[#f1eeea]" key={tax.id}>
                        <td className="py-3 pr-4 font-mono text-xs">{tax.clave}</td>
                        <td className="py-3 pr-4 font-medium">{tax.nombre}</td>
                        <td className="py-3 pr-4 tabular-nums">{tax.tasa}%</td>
                        <td className="py-3 pr-4"><span className="rounded-full bg-[#f1eeea] px-2.5 py-1 text-xs text-[#625b55]">{TIPO_LABEL[tax.tipo] ?? tax.tipo}</span></td>
                        <td className="py-3 pr-4"><StatusBadge active={tax.activo} /></td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" href={`/admin/impuestos?organizationId=${organizationId}&edit=${tax.id}`}>Editar</Link>
                            <form action={toggleTax}>
                              <input name="organizacionId" type="hidden" value={organizationId} />
                              <input name="id" type="hidden" value={tax.id} />
                              <input name="activo" type="hidden" value={String(tax.activo)} />
                              <button className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" type="submit">{tax.activo ? "Ocultar" : "Activar"}</button>
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
