import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";

import { CategoryForm } from "@/app/admin/categorias-servicios/category-form";
import { toggleServiceCategory } from "@/app/admin/categorias-servicios/actions";
import { AdminNavCompact } from "@/components/admin-nav";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { catCategoriasServicios } from "@/db/schema/catalogs";
import { miembrosOrganizaciones, organizaciones } from "@/db/schema/core";
import { requireAuthenticatedUser, requireOrganizationAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ organizationId?: string; edit?: string }>;

export default async function ServiceCategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireAuthenticatedUser();
  const params = await searchParams;
  const db = getDatabase();
  const organizations = user.esAdministradorPlataforma ? await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(organizaciones).orderBy(asc(organizaciones.nombre)) : await db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug }).from(miembrosOrganizaciones).innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id)).where(and(eq(miembrosOrganizaciones.usuarioId, user.id), eq(miembrosOrganizaciones.estado, "activo")));
  const organizationId = params.organizationId && organizations.some((item) => item.id === params.organizationId) ? params.organizationId : organizations[0]?.id;
  if (!organizationId) return <main className="min-h-screen bg-[#f8f7f5] p-8"><h1 className="text-3xl font-semibold">Categorías de servicios</h1><p className="mt-3 text-[#625b55]">No tienes una organización asignada.</p></main>;
  await requireOrganizationAccess(organizationId);
  const categories = await db.select({ id: catCategoriasServicios.id, clave: catCategoriasServicios.clave, nombre: catCategoriasServicios.nombre, descripcion: catCategoriasServicios.descripcion, activo: catCategoriasServicios.activo }).from(catCategoriasServicios).where(eq(catCategoriasServicios.organizacionId, organizationId)).orderBy(asc(catCategoriasServicios.nombre));
  const editing = params.edit ? (await db.select({ id: catCategoriasServicios.id, clave: catCategoriasServicios.clave, nombre: catCategoriasServicios.nombre, descripcion: catCategoriasServicios.descripcion }).from(catCategoriasServicios).where(and(eq(catCategoriasServicios.id, params.edit), eq(catCategoriasServicios.organizacionId, organizationId))).limit(1))[0] : undefined;

  return <main className="min-h-screen bg-[#f8f7f5] text-[#2d2926]"><header className="border-b border-[#ded8d2] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><div><Link className="text-sm text-[#8a5140]" href="/admin">← Panel</Link><h1 className="mt-2 text-2xl font-semibold">Categorías de servicios</h1></div><Link className="text-sm text-[#8a5140]" href={`/admin/servicios?organizationId=${organizationId}`}>Ver servicios →</Link></div></header><section className="mx-auto max-w-7xl px-6 py-10 lg:px-10"><div className="mb-6"><AdminNavCompact organizationId={organizationId} /></div><div className="mb-6 flex flex-wrap gap-2">{organizations.map((organization) => <Link className={organization.id === organizationId ? "rounded-full border border-[#8a5140] bg-[#f2e3dc] px-3 py-1.5 text-xs font-medium text-[#60392e]" : "rounded-full border border-[#ded8d2] bg-white px-3 py-1.5 text-xs text-[#625b55]"} href={`/admin/categorias-servicios?organizationId=${organization.id}`} key={organization.id}>{organization.nombre} · {organization.slug}</Link>)}</div><div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"><CategoryForm initial={editing} organizationId={organizationId} /><section className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Categorías registradas</h2><p className="mt-1 text-sm text-[#625b55]">{categories.length} resultado(s)</p></div><Link className="rounded-xl bg-[#8a5140] px-3 py-2 text-sm font-medium text-white" href={`/admin/categorias-servicios?organizationId=${organizationId}`}>Nueva</Link></div>{categories.length === 0 ? <div className="mt-5"><EmptyState description="Crea categorías para organizar los servicios del salón." title="No hay categorías" /></div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]"><tr><th className="px-3 py-3 font-medium">Categoría</th><th className="px-3 py-3 font-medium">Estado</th><th className="px-3 py-3 font-medium">Acciones</th></tr></thead><tbody>{categories.map((category) => <tr className="border-b border-[#f1eeea] last:border-0" key={category.id}><td className="px-3 py-4"><p className="font-medium">{category.nombre}</p><p className="text-xs text-[#625b55]">{category.clave}</p></td><td className="px-3 py-4"><StatusBadge active={category.activo} /></td><td className="px-3 py-4"><div className="flex gap-3"><Link className="font-medium text-[#8a5140]" href={`/admin/categorias-servicios?organizationId=${organizationId}&edit=${category.id}`}>Editar</Link><form action={toggleServiceCategory}><input name="organizacionId" type="hidden" value={organizationId} /><input name="id" type="hidden" value={category.id} /><input name="activo" type="hidden" value={String(category.activo)} /><button className="text-[#625b55]" type="submit">{category.activo ? "Ocultar" : "Activar"}</button></form></div></td></tr>)}</tbody></table></div>}</section></div></section></main>;
}
