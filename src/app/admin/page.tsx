import { and, asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";

import { GuiaChecklistCard } from "@/app/admin/guia/checklist-card";
import { InvitationForm } from "@/app/admin/invitation-form";
import { OrganizationForm } from "@/app/admin/organization-form";
import { SuscripcionAdminRow, type EstadoSuscripcionAdmin } from "@/app/admin/suscripcion-form";
import { AdminNav } from "@/components/admin-nav";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { catRoles } from "@/db/schema/access";
import { billingEventos, planes, suscripciones } from "@/db/schema/billing";
import { organizaciones, sucursales } from "@/db/schema/core";
import { getAccessibleOrganizations } from "@/lib/admin-context";
import { requireAuthenticatedUser, requirePlatformAdmin } from "@/lib/auth/access";
import { resolveAccessSafe } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { CAPACIDADES } from "@/modules/billing/capacidades";
import { getSuscripcionActual } from "@/modules/billing/queries";
import { diasRestantesTrial, estadoEfectivoSuscripcion } from "@/modules/billing/rules";
import { cargarEstadoNegocio, cargarProgresoGuia } from "@/modules/onboarding/queries";
import { evaluarPasos, pasosParaPermisos, resumenGuia } from "@/modules/onboarding/rules";
import type { ResumenGuia } from "@/modules/onboarding/types";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  "permiso-denegado": "No tienes permiso para acceder a esa sección.",
  "organization-access-denied": "No tienes acceso a esa organización.",
};

function AccessError({ error }: { error?: string }) {
  const message = error ? ERROR_MESSAGES[error] : undefined;
  if (!message) return null;
  return (
    <p className="rounded-xl border border-[#f0c8be] bg-[#fdf1ee] px-4 py-3 text-sm text-[#a8443a]" role="alert">
      {message}
    </p>
  );
}

function MemberDashboard({
  name,
  access,
  error,
  permissionsByOrg,
  capacidadesFaltantesByOrg,
  checklist,
}: {
  name: string;
  email: string;
  access: Array<{ organization: string; branch: string; branchKey: string; organizationId: string; branchId: string }>;
  error?: string;
  permissionsByOrg: Record<string, string[]>;
  capacidadesFaltantesByOrg: Record<string, string[]>;
  checklist: ResumenGuia | null;
}) {
  const first = access[0];
  return (
    <div className="space-y-6">
      <AccessError error={error} />
      <AdminPageHeader
        actions={
          first ? (
            <Button nativeButton={false} render={<Link href={buildAdminHref("/agenda", { organizationId: first.organizationId, sucursalId: first.branchId })} />}>
              Ir a la agenda
            </Button>
          ) : undefined
        }
        description="Tu acceso fue configurado correctamente. Estas son las sucursales asignadas a tu cuenta."
        title={`Bienvenido, ${name}`}
      />
      {first && checklist ? (
        <GuiaChecklistCard
          organizationId={first.organizationId}
          resumen={checklist}
          sucursalId={first.branchId}
        />
      ) : null}
      {access.length === 0 ? (
        <EmptyState description="Tu cuenta todavía no tiene una sucursal asignada. Contacta al administrador." title="Sin sucursal asignada" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {access.map((item) => (
            <Link
              className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm transition-colors hover:border-[#c9a899] focus-visible:outline-2 focus-visible:outline-[#8a5140]"
              href={buildAdminHref("/agenda", { organizationId: item.organizationId, sucursalId: item.branchId })}
              key={`${item.organizationId}-${item.branchId}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8795d]">Organización</p>
              <h2 className="mt-2 text-xl font-semibold text-[#2d2926]">{item.organization}</h2>
              <p className="mt-3 text-sm text-[#81746c]">Sucursal: {item.branch} ({item.branchKey})</p>
            </Link>
          ))}
        </div>
      )}
      {first ? (
        <AdminNav
          capacidadesFaltantes={capacidadesFaltantesByOrg[first.organizationId] ?? []}
          organizationId={first.organizationId}
          permissions={permissionsByOrg[first.organizationId] ?? []}
          sucursalId={first.branchId}
        />
      ) : null}
    </div>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const { session, user } = await requireAuthenticatedUser();
  const db = getDatabase();

  if (!user.esAdministradorPlataforma) {
    const organizations = await getAccessibleOrganizations(db, user);
    const access: Array<{ organization: string; branch: string; branchKey: string; organizationId: string; branchId: string }> = [];
    const permissionsByOrg: Record<string, string[]> = {};
    const capacidadesFaltantesByOrg: Record<string, string[]> = {};

    for (const org of organizations) {
      const [resolved, suscripcion] = await Promise.all([
        resolveAccessSafe(org.id, user),
        getSuscripcionActual(org.id),
      ]);
      permissionsByOrg[org.id] = resolved ? [...resolved.permissions] : [];
      if (suscripcion && estadoEfectivoSuscripcion(suscripcion) === "vigente") {
        const incluidas = new Set(suscripcion.capacidades ?? []);
        capacidadesFaltantesByOrg[org.id] = Object.keys(CAPACIDADES).filter(
          (capacidad) => !incluidas.has(capacidad),
        );
      }
      const branchConditions = [eq(sucursales.organizacionId, org.id), eq(sucursales.activo, true)];
      // null = alcance de toda la organización; Set = solo asignadas.
      if (resolved?.branchIds) {
        if (resolved.branchIds.size === 0) continue;
        branchConditions.push(inArray(sucursales.id, [...resolved.branchIds]));
      }
      const branchRows = await db
        .select({ id: sucursales.id, nombre: sucursales.nombre, clave: sucursales.clave })
        .from(sucursales)
        .where(and(...branchConditions))
        .orderBy(asc(sucursales.nombre));
      for (const branch of branchRows) {
        access.push({
          organization: org.nombre,
          branch: branch.nombre,
          branchKey: branch.clave,
          organizationId: org.id,
          branchId: branch.id,
        });
      }
    }

    // Checklist de primera configuración sobre la primera sucursal visible:
    // se muestra mientras queden pasos requeridos y la guía no esté omitida.
    let checklist: ResumenGuia | null = null;
    const firstAccess = access[0];
    if (firstAccess) {
      const pasos = pasosParaPermisos(new Set(permissionsByOrg[firstAccess.organizationId] ?? []));
      if (pasos.length > 0) {
        const [estadoNegocio, progreso] = await Promise.all([
          cargarEstadoNegocio(db, firstAccess.organizationId, firstAccess.branchId),
          cargarProgresoGuia(db, firstAccess.organizationId, user.id),
        ]);
        const resumen = resumenGuia(evaluarPasos(pasos, estadoNegocio));
        if (!resumen.terminada && progreso?.estado !== "omitida") {
          checklist = resumen;
        }
      }
    }

    return <MemberDashboard access={access} capacidadesFaltantesByOrg={capacidadesFaltantesByOrg} checklist={checklist} email={session.user.email} error={error} name={session.user.name} permissionsByOrg={permissionsByOrg} />;
  }

  const { session: platformSession } = await requirePlatformAdmin();
  const [organizations, roles, branches, suscripcionRows, solicitudes, planesCatalogo] = await Promise.all([
    db
      .select({ id: organizaciones.id, nombre: organizaciones.nombre, slug: organizaciones.slug, activo: organizaciones.activo })
      .from(organizaciones)
      .orderBy(desc(organizaciones.createdAt)),
    db.select({ id: catRoles.id, organizacionId: catRoles.organizacionId, nombre: catRoles.nombre }).from(catRoles),
    db.select({ id: sucursales.id, organizacionId: sucursales.organizacionId, nombre: sucursales.nombre, clave: sucursales.clave }).from(sucursales),
    db
      .select({
        organizacionId: suscripciones.organizacionId,
        estado: suscripciones.estado,
        trialTerminaAt: suscripciones.trialTerminaAt,
        periodoTerminaAt: suscripciones.periodoTerminaAt,
      })
      .from(suscripciones)
      .orderBy(desc(suscripciones.createdAt)),
    db
      .select({
        id: billingEventos.id,
        tipo: billingEventos.tipo,
        payload: billingEventos.payload,
        createdAt: billingEventos.createdAt,
        organizacion: organizaciones.nombre,
        organizacionId: billingEventos.organizacionId,
      })
      .from(billingEventos)
      .innerJoin(organizaciones, eq(billingEventos.organizacionId, organizaciones.id))
      .where(inArray(billingEventos.tipo, ["plan.cambio_solicitado", "cancelacion.solicitada"]))
      .orderBy(desc(billingEventos.createdAt))
      .limit(20),
    db
      .select({ clave: planes.clave, nombre: planes.nombre, precioMensual: planes.precioMensual, precioAnual: planes.precioAnual })
      .from(planes)
      .where(eq(planes.activo, true))
      .orderBy(planes.orden),
  ]);

  // Última solicitud de cambio por organización: pre-llena el formulario del
  // admin con lo que el propietario pidió.
  const solicitudPorOrg = new Map<string, { planClave: string; periodicidad: "mensual" | "anual"; sucursales: number }>();
  for (const solicitud of solicitudes) {
    if (solicitud.tipo !== "plan.cambio_solicitado" || !solicitud.organizacionId) continue;
    if (solicitudPorOrg.has(solicitud.organizacionId)) continue;
    const payload = (solicitud.payload ?? {}) as Record<string, unknown>;
    if (typeof payload.planClave !== "string") continue;
    solicitudPorOrg.set(solicitud.organizacionId, {
      planClave: payload.planClave,
      periodicidad: payload.periodicidad === "anual" ? "anual" : "mensual",
      sucursales: typeof payload.sucursales === "number" ? payload.sucursales : 1,
    });
  }

  // Última suscripción por organización para el estado mostrado al admin.
  const suscripcionPorOrg = new Map<string, (typeof suscripcionRows)[number]>();
  for (const row of suscripcionRows) {
    if (!suscripcionPorOrg.has(row.organizacionId)) suscripcionPorOrg.set(row.organizacionId, row);
  }
  const ahora = new Date();

  return (
    <div className="space-y-6">
      <AccessError error={error} />
      <AdminPageHeader
        description={`Hola, ${platformSession.user.name}. Crea negocios y prepara su primera sucursal.`}
        title="Organizaciones y sucursales"
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <OrganizationForm />
        <AdminCard description={`${organizations.length} organización(es)`} title="Organizaciones registradas">
          {organizations.length === 0 ? (
            <EmptyState description="Todavía no hay organizaciones. Crea la primera desde el formulario." title="Sin organizaciones" />
          ) : (
            <div className="space-y-3">
              {organizations.map((organization) => {
                const suscripcion = suscripcionPorOrg.get(organization.id);
                const efectivo = estadoEfectivoSuscripcion(suscripcion ?? null, ahora);
                const estado: EstadoSuscripcionAdmin = !suscripcion
                  ? { tipo: "sin-suscripcion" }
                  : suscripcion.estado === "trialing" && efectivo === "vigente"
                    ? { tipo: "trialing", diasRestantes: diasRestantesTrial(suscripcion, ahora) }
                    : efectivo === "vigente"
                      ? {
                          tipo: "activa",
                          termina: suscripcion.periodoTerminaAt
                            ? suscripcion.periodoTerminaAt.toISOString().slice(0, 10)
                            : null,
                        }
                      : { tipo: "vencida" };
                return (
                  <div className="rounded-xl border border-[#eee6e0] px-4 py-3" key={organization.id}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{organization.nombre}</p>
                        <p className="mt-1 text-xs text-[#95877e]">{organization.slug}</p>
                      </div>
                      <StatusBadge tone={organization.activo ? "success" : "neutral"}>
                        {organization.activo ? "Activa" : "Inactiva"}
                      </StatusBadge>
                    </div>
                    <div className="mt-3">
                      <SuscripcionAdminRow
                        estado={estado}
                        organizationId={organization.id}
                        planes={planesCatalogo}
                        sugerida={solicitudPorOrg.get(organization.id)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>
      </div>
      {solicitudes.length > 0 ? (
        <AdminCard description="Últimas solicitudes de las organizaciones" title="Solicitudes de suscripción">
          <ul className="divide-y divide-[#f2ece7] text-sm">
            {solicitudes.map((solicitud) => {
              const payload = (solicitud.payload ?? {}) as Record<string, unknown>;
              return (
                <li className="flex flex-wrap items-center justify-between gap-2 py-2.5" key={solicitud.id}>
                  <div>
                    <p className="font-medium text-[#2d2926]">{solicitud.organizacion}</p>
                    <p className="text-xs text-[#81746c]">
                      {solicitud.tipo === "plan.cambio_solicitado"
                        ? `Cambio a ${String(payload.planNombre ?? payload.planClave ?? "?")} (${String(payload.periodicidad ?? "mensual")}${typeof payload.sucursales === "number" ? ` · ${payload.sucursales} sucursal(es)` : ""})`
                        : `Cancelación${payload.motivo ? ` — ${String(payload.motivo)}` : ""}`}
                    </p>
                  </div>
                  <span className="text-xs text-[#95877e]">{solicitud.createdAt.toISOString().slice(0, 10)}</span>
                </li>
              );
            })}
          </ul>
        </AdminCard>
      ) : null}
      <InvitationForm branches={branches} organizations={organizations} roles={roles} />
    </div>
  );
}
