import { desc, eq } from "drizzle-orm";

import { AdminNav } from "@/components/admin-nav";
import { InvitationForm } from "@/app/admin/invitation-form";
import { OrganizationForm } from "@/app/admin/organization-form";
import { getDatabase } from "@/db/client";
import { catRoles } from "@/db/schema/access";
import { organizaciones, relUsuariosSucursales, sucursales } from "@/db/schema/core";
import { requireAuthenticatedUser, requirePlatformAdmin } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

function MemberDashboard({ name, email, access }: { name: string; email: string; access: Array<{ organization: string; branch: string; branchKey: string; organizationId: string }> }) {
  const firstOrgId = access[0]?.organizationId;
  return (
    <main className="min-h-screen bg-[#faf9f7] text-[#292522]">
      <header className="border-b border-[#eee6e0] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-[#2c2522] text-sm font-semibold text-[#f6eadf]">BP</div>
            <div><p className="font-semibold tracking-tight">Beauty POS</p><p className="text-xs text-[#8a7b72]">Panel de operación</p></div>
          </div>
          <div className="text-right"><p className="text-sm font-medium">{name}</p><p className="text-xs text-[#8a7b72]">{email}</p></div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b8795d]">Mi operación</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Bienvenido, {name}</h1>
        <p className="mt-4 max-w-2xl text-[#81746c]">Tu acceso fue configurado correctamente. Estas son las sucursales asignadas.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {access.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#ded2c9] bg-white px-5 py-8 text-sm text-[#81746c]">Tu cuenta todavía no tiene una sucursal asignada.</div>
          ) : access.map((item) => (
            <div className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm" key={`${item.organization}-${item.branch}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8795d]">Organización</p>
              <h2 className="mt-2 text-xl font-semibold">{item.organization}</h2>
              <p className="mt-3 text-sm text-[#81746c]">Sucursal: {item.branch} ({item.branchKey})</p>
            </div>
          ))}
        </div>
        <div className="mt-12">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Módulos y catálogos</h2>
          <p className="mt-2 text-sm text-[#81746c]">Accede a las diferentes secciones del sistema.</p>
          <div className="mt-6"><AdminNav organizationId={firstOrgId} /></div>
        </div>
      </section>
    </main>
  );
}

export default async function AdminPage() {
  const { session, user } = await requireAuthenticatedUser();
  const db = getDatabase();

  if (!user.esAdministradorPlataforma) {
    const access = await db
      .select({ organization: organizaciones.nombre, branch: sucursales.nombre, branchKey: sucursales.clave, organizationId: organizaciones.id })
      .from(relUsuariosSucursales)
      .innerJoin(organizaciones, eq(relUsuariosSucursales.organizacionId, organizaciones.id))
      .innerJoin(sucursales, eq(relUsuariosSucursales.sucursalId, sucursales.id))
      .where(eq(relUsuariosSucursales.usuarioId, user.id));

    return <MemberDashboard name={session.user.name} email={session.user.email} access={access} />;
  }

  const { session: platformSession } = await requirePlatformAdmin();
  const [organizations, roles, branches] = await Promise.all([
    db.select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug, activo: organizaciones.activo, createdAt: organizaciones.createdAt }).from(organizaciones).orderBy(desc(organizaciones.createdAt)),
    db.select({ id: catRoles.id, organizacionId: catRoles.organizacionId, nombre: catRoles.nombre }).from(catRoles),
    db.select({ id: sucursales.id, organizacionId: sucursales.organizacionId, nombre: sucursales.nombre, clave: sucursales.clave }).from(sucursales),
  ]);

  return (
    <main className="min-h-screen bg-[#faf9f7] text-[#292522]">
      <header className="border-b border-[#eee6e0] bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-2xl bg-[#2c2522] text-sm font-semibold text-[#f6eadf]">BP</div><div><p className="font-semibold tracking-tight">Beauty POS</p><p className="text-xs text-[#8a7b72]">Panel de plataforma</p></div></div><div className="text-right"><p className="text-sm font-medium">{platformSession.user.name}</p><p className="text-xs text-[#8a7b72]">{platformSession.user.email}</p></div></div></header>
      <section className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b8795d]">Administración</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Organizaciones y sucursales</h1>
        <p className="mt-4 max-w-2xl text-[#81746c]">Crea los negocios que utilizarán Beauty POS y prepara su primera sucursal.</p>
        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]"><OrganizationForm /><section className="rounded-2xl border border-[#eadfd8] bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold">Organizaciones registradas</h2><p className="mt-1 text-sm text-[#81746c]">{organizations.length} organización(es)</p></div><span className="rounded-full bg-[#f8eee8] px-3 py-1 text-xs font-medium text-[#a76348]">Plataforma</span></div><div className="mt-6 space-y-3">{organizations.length === 0 ? <div className="rounded-xl border border-dashed border-[#ded2c9] px-4 py-8 text-center text-sm text-[#95877e]">Todavía no hay organizaciones. Crea la primera desde el formulario.</div> : organizations.map((organization) => <div className="flex items-center justify-between rounded-xl border border-[#eee6e0] px-4 py-3" key={organization.id}><div><p className="font-medium">{organization.nombre}</p><p className="mt-1 text-xs text-[#95877e]">{organization.slug}</p></div><span className="rounded-full bg-[#edf6ef] px-2.5 py-1 text-xs font-medium text-[#4c875f]">{organization.activo ? "Activa" : "Inactiva"}</span></div>)}</div></section></div>
        <div className="mt-6"><InvitationForm organizations={organizations} roles={roles} branches={branches} /></div>
        <div className="mt-14 border-t border-[#eadfd8] pt-12">
          <h2 className="text-2xl font-semibold tracking-[-0.02em]">Módulos y catálogos</h2>
          <p className="mt-2 text-sm text-[#81746c]">Accede a las diferentes secciones del sistema. Selecciona una organización dentro de cada módulo.</p>
          <div className="mt-6"><AdminNav platformAdmin /></div>
        </div>
      </section>
    </main>
  );
}
