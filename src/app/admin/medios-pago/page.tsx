import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";

import { PaymentMethodForm } from "@/app/admin/medios-pago/payment-method-form";
import { togglePaymentMethod } from "@/app/admin/medios-pago/actions";
import { AdminNavCompact } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { miembrosOrganizaciones, organizaciones } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; categoria?: string; edit?: string }>;

const CATEGORIA_LABEL: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", wallet: "Wallet", otro: "Otro" };
const CATEGORIA_COLOR: Record<string, string> = {
  efectivo: "bg-[#eaf5ed] text-[#347052]",
  tarjeta: "bg-[#f2e3dc] text-[#8a5140]",
  transferencia: "bg-[#eef0f5] text-[#4a5a7a]",
  wallet: "bg-[#f5eee8] text-[#986b16]",
  otro: "bg-[#f1eeea] text-[#625b55]",
};

export default async function PaymentMethodsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizations = user.esAdministradorPlataforma
    ? await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(organizaciones).orderBy(asc(organizaciones.nombre))
    : await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(miembrosOrganizaciones).innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id)).where(and(eq(miembrosOrganizaciones.usuarioId, user.id), eq(miembrosOrganizaciones.estado, "activo")));
  const organizationId = params.organizationId && organizations.some((item) => item.id === params.organizationId) ? params.organizationId : organizations[0]?.id;
  if (!organizationId) return <main className="min-h-screen bg-[#f8f7f5] p-8"><h1 className="text-3xl font-semibold">Medios de pago</h1><p className="mt-3 text-[#625b55]">No tienes una organización asignada.</p></main>;
  await requireOrganizationAccess(organizationId);

  const categoriaFilter = params.categoria ?? "";
  const filters = [eq(catMediosPago.organizacionId, organizationId)];
  if (categoriaFilter) filters.push(eq(catMediosPago.categoria, categoriaFilter as "efectivo" | "tarjeta" | "transferencia" | "wallet" | "otro"));

  const methods = await db.select({ id: catMediosPago.id, clave: catMediosPago.clave, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria, activo: catMediosPago.activo }).from(catMediosPago).where(and(...filters)).orderBy(asc(catMediosPago.nombre));
  const editing = params.edit ? (await db.select({ id: catMediosPago.id, clave: catMediosPago.clave, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria }).from(catMediosPago).where(and(eq(catMediosPago.id, params.edit), eq(catMediosPago.organizacionId, organizationId))).limit(1))[0] : undefined;

  return (
    <main className="min-h-screen bg-[#f8f7f5] text-[#2d2926]">
      <header className="border-b border-[#ded8d2] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div>
            <Link className="text-sm text-[#8a5140]" href="/admin">← Panel</Link>
            <h1 className="mt-2 text-2xl font-semibold">Medios de pago</h1>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-6"><AdminNavCompact organizationId={organizationId} /></div>
        <div className="mb-6 flex flex-wrap gap-2">
          {organizations.map((organization) => (
            <Link className={organization.id === organizationId ? "rounded-full border border-[#8a5140] bg-[#f2e3dc] px-3 py-1.5 text-xs font-medium text-[#60392e]" : "rounded-full border border-[#ded8d2] bg-white px-3 py-1.5 text-xs text-[#625b55]"} href={`/admin/medios-pago?organizationId=${organization.id}`} key={organization.id}>{organization.nombre} · {organization.slug}</Link>
          ))}
        </div>

        <form className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-[#ded8d2] bg-white p-4" method="get">
          <input name="organizationId" type="hidden" value={organizationId} />
          <select className="h-10 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={categoriaFilter} name="categoria">
            <option value="">Todas las categorías</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="wallet">Wallet</option>
            <option value="otro">Otro</option>
          </select>
          <button className="rounded-xl bg-[#8a5140] px-4 text-sm font-medium text-white" type="submit">Filtrar</button>
          {categoriaFilter && <Link className="rounded-xl border border-[#ded8d2] px-4 py-2 text-sm text-[#625b55]" href={`/admin/medios-pago?organizationId=${organizationId}`}>Limpiar</Link>}
        </form>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <PaymentMethodForm initial={editing} organizationId={organizationId} />
          <section className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Medios registrados</h2>
                <p className="mt-1 text-sm text-[#625b55]">{methods.length} resultado(s)</p>
              </div>
              <Link className="rounded-xl bg-[#8a5140] px-3 py-2 text-sm font-medium text-white" href={`/admin/medios-pago?organizationId=${organizationId}`}>Nuevo</Link>
            </div>
            {methods.length === 0 ? (
              <div className="mt-5"><EmptyState description="Crea medios de pago como efectivo, tarjeta o transferencia para el POS." title="No hay medios de pago" /></div>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
                    <tr>
                      <th className="py-2 pr-4">Clave</th>
                      <th className="py-2 pr-4">Nombre</th>
                      <th className="py-2 pr-4">Categoría</th>
                      <th className="py-2 pr-4">Estado</th>
                      <th className="py-2">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {methods.map((method) => (
                      <tr className="border-b border-[#f1eeea]" key={method.id}>
                        <td className="py-3 pr-4 font-mono text-xs">{method.clave}</td>
                        <td className="py-3 pr-4 font-medium">{method.nombre}</td>
                        <td className="py-3 pr-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CATEGORIA_COLOR[method.categoria] ?? CATEGORIA_COLOR.otro}`}>{CATEGORIA_LABEL[method.categoria] ?? method.categoria}</span></td>
                        <td className="py-3 pr-4"><StatusBadge active={method.activo} /></td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" href={`/admin/medios-pago?organizationId=${organizationId}&edit=${method.id}`}>Editar</Link>
                            <form action={togglePaymentMethod}>
                              <input name="organizacionId" type="hidden" value={organizationId} />
                              <input name="id" type="hidden" value={method.id} />
                              <input name="activo" type="hidden" value={String(method.activo)} />
                              <button className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#625b55]" type="submit">{method.activo ? "Ocultar" : "Activar"}</button>
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
