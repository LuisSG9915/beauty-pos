import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Calendar, CalendarPlus, ShoppingCart, Users, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { GuiaChecklistCard } from "@/app/admin/guia/checklist-card";
import { InvitationForm } from "@/app/admin/invitation-form";
import { OrganizationForm } from "@/app/admin/organization-form";
import { RenombrarSucursalCard } from "@/app/admin/renombrar-sucursal-card";
import { SuscripcionAdminRow, type EstadoSuscripcionAdmin } from "@/app/admin/suscripcion-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { catRoles } from "@/db/schema/access";
import { billingEventos, planes, suscripciones } from "@/db/schema/billing";
import { organizaciones, sucursales } from "@/db/schema/core";
import { ventas } from "@/db/schema/operations";
import { telemetriaEventos } from "@/db/schema/telemetry";
import { getSessionOrRedirect, requirePlatformAdmin } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import { canAccessBranch, hasPermission, resolveAccessSafe, resolveSessionContext } from "@/lib/auth/authorization";
import { leerNombreSucursalOmitida, leerSucursalCookie } from "@/lib/sucursal-cookie";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { cargarAlertas, type AlertaOperativa } from "@/modules/alertas/queries";
import { diasRestantesTrial, estadoEfectivoSuscripcion } from "@/modules/billing/rules";
import { cargarEstadoNegocio, cargarProgresoGuia } from "@/modules/onboarding/queries";
import { evaluarPasos, pasosParaPermisos, resumenGuia } from "@/modules/onboarding/rules";
import type { ResumenGuia } from "@/modules/onboarding/types";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  "permiso-denegado": "No tienes permiso para acceder a esa sección.",
  "organization-access-denied": "No tienes acceso a ese negocio.",
};

function AccessError({ error }: { error?: string }) {
  const message = error ? ERROR_MESSAGES[error] : undefined;
  if (!message) return null;
  return (
    <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

function MemberDashboard({
  name,
  access,
  activeAccess,
  alertasByOrg,
  error,
  permissionsByOrg,
  checklist,
  renombrar,
}: {
  name: string;
  access: Array<{ organization: string; branch: string; branchKey: string; organizationId: string; branchId: string }>;
  activeAccess?: { organization: string; branch: string; branchKey: string; organizationId: string; branchId: string };
  alertasByOrg: Record<string, AlertaOperativa[]>;
  error?: string;
  permissionsByOrg: Record<string, string[]>;
  checklist: ResumenGuia | null;
  /** Tarjeta "¿Cómo se llama tu salón?" para la sucursal genérica única. */
  renombrar: { organizationId: string; sucursalId: string; nombreSugerido: string } | null;
}) {
  const current = activeAccess ?? access[0];
  return (
    <div className="space-y-6">
      <AccessError error={error} />
      <AdminPageHeader
        actions={
          current ? (
            <Button data-action-clave="1" nativeButton={false} render={<Link href={buildAdminHref("/agenda", { organizationId: current.organizationId, sucursalId: current.branchId })} />} size="lg">
              Ir a la agenda
            </Button>
          ) : undefined
        }
        description="Esto pasa hoy en tu salón. Toca una sucursal para abrir su agenda."
        title={`Hola, ${name}`}
      />
      {renombrar ? (
        <RenombrarSucursalCard
          nombreSugerido={renombrar.nombreSugerido}
          organizationId={renombrar.organizationId}
          sucursalId={renombrar.sucursalId}
        />
      ) : null}
      {current && checklist ? (
        <GuiaChecklistCard
          organizationId={current.organizationId}
          resumen={checklist}
          sucursalId={current.branchId}
        />
      ) : null}
      {/* Tablero central de alertas: conteos accionables por organización,
          solo de módulos que el usuario puede ver. */}
      {access
        .filter((item, index, lista) => lista.findIndex((otro) => otro.organizationId === item.organizationId) === index)
        .map((item) => {
          const alertas = alertasByOrg[item.organizationId] ?? [];
          if (alertas.length === 0) return null;
          return (
            <AdminCard
              description="Puntos operativos que necesitan atención en tu alcance."
              key={item.organizationId}
              title={`Alertas · ${item.organization}`}
            >
              <ul className="space-y-2">
                {alertas.map((alerta) => (
                  <li key={alerta.clave}>
                    <Link
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-accent-foreground/30"
                      href={buildAdminHref(alerta.href, {
                        organizationId: item.organizationId,
                        sucursalId: item.branchId,
                      })}
                    >
                      <span className="text-sm font-medium text-foreground">{alerta.titulo}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          alerta.tono === "critico"
                            ? "bg-destructive-soft text-destructive-soft-foreground"
                            : "bg-accent/70 text-primary"
                        }`}
                      >
                        {alerta.cantidad}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </AdminCard>
          );
        })}
      {access.length === 0 ? (
        <EmptyState description="Tu cuenta todavía no tiene una sucursal asignada. Contacta al administrador." title="Sin sucursal asignada" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {access.map((item) => {
            const isSelected = item.branchId === current?.branchId;
            return (
              <Link
                className={`rounded-2xl border p-5 shadow-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border bg-card hover:border-accent-foreground/30"
                }`}
                href={buildAdminHref("/agenda", { organizationId: item.organizationId, sucursalId: item.branchId })}
                key={`${item.organizationId}-${item.branchId}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{item.organization}</p>
                  {isSelected ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-op-xs font-medium text-primary">
                      Activa
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 text-xl font-semibold text-foreground">{item.branch}</h2>
                <p className="mt-3 text-sm text-muted-foreground">Toca para abrir la agenda de hoy</p>
              </Link>
            );
          })}
        </div>
      )}
      {/* Acciones de hoy: verbos grandes y directos para el flujo diario; el
          resto de secciones queda en "Más opciones" de la navegación. */}
      {current ? (
        <AdminCard title="¿Qué vas a hacer?">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {ACCIONES_HOY.filter(
              (accion) =>
                tienePermisoNav(accion.permiso, permissionsByOrg[current.organizationId]),
            ).map((accion) => (
              <Link
                className="flex min-h-20 flex-col items-start justify-between gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-accent-foreground/30 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                data-action-id={`inicio.accion.${accion.id}`}
                href={buildAdminHref(accion.href, {
                  organizationId: current.organizationId,
                  sucursalId: current.branchId,
                  extra: accion.extra,
                })}
                key={accion.id}
              >
                <accion.icon aria-hidden="true" className="size-5 text-primary" strokeWidth={1.9} />
                <span className="text-sm font-semibold text-foreground">{accion.label}</span>
                <span className="text-xs leading-4 text-muted-foreground">{accion.ayuda}</span>
              </Link>
            ))}
          </div>
        </AdminCard>
      ) : null}
    </div>
  );
}

type PermisoNav = string | readonly string[] | undefined;

function tienePermisoNav(permiso: PermisoNav, permissions: readonly string[] | undefined): boolean {
  if (!permiso) return true;
  if (!permissions) return false;
  const set = new Set(permissions);
  return Array.isArray(permiso)
    ? (permiso as readonly string[]).some((clave) => set.has(clave))
    : set.has(permiso as string);
}

const ACCIONES_HOY: Array<{
  id: string;
  href: "/agenda" | "/pos" | "/caja" | "/clientes";
  label: string;
  ayuda: string;
  icon: LucideIcon;
  permiso: string;
  extra?: Record<string, string>;
}> = [
  { id: "agenda", href: "/agenda", label: "Ver la agenda", ayuda: "Citas de hoy", icon: Calendar, permiso: "agenda.ver" },
  { id: "nueva_cita", href: "/agenda", label: "Nueva cita", ayuda: "Agenda a un cliente", icon: CalendarPlus, permiso: "agenda.ver", extra: { nueva: "1" } },
  { id: "cobrar", href: "/pos", label: "Cobrar", ayuda: "Venta o pago de cita", icon: ShoppingCart, permiso: "ventas.ver" },
  { id: "caja", href: "/caja", label: "Caja", ayuda: "Abrir o cerrar el turno", icon: Wallet, permiso: "caja.ver" },
  { id: "clientes", href: "/clientes", label: "Clientes", ayuda: "Buscar o registrar", icon: Users, permiso: "clientes.ver" },
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = firstParam(params.error);
  const session = await getSessionOrRedirect();
  const db = getDatabase();

  // Usuario + organizaciones en la consulta de contexto única.
  const contextRow = await resolveSessionContext(session.user.id, null);
  const user = contextRow.usuario;
  if (!user) {
    redirect("/login?error=account-not-configured");
  }

  if (!user.esAdministradorPlataforma) {
    const organizations = contextRow.organizaciones;
    const access: Array<{ organization: string; branch: string; branchKey: string; organizationId: string; branchId: string }> = [];
    const permissionsByOrg: Record<string, string[]> = {};
    const alertasByOrg: Record<string, AlertaOperativa[]> = {};

    // Todas las organizaciones en paralelo: el acceso ya trae las sucursales
    // activas embebidas, así que no hace falta consultar `sucursales` otra vez.
    const porOrganizacion = await Promise.all(
      organizations.map(async (org) => {
        const resolved = await resolveAccessSafe(org.id, user);
        const alertas = resolved
          ? await cargarAlertas(db, {
              organizacionId: org.id,
              sucursalIds: resolved.branchIds ? [...resolved.branchIds] : null,
              permisos: resolved.permissions,
            })
          : [];
        return { org, resolved, alertas };
      }),
    );

    for (const { org, resolved, alertas } of porOrganizacion) {
      permissionsByOrg[org.id] = resolved ? [...resolved.permissions] : [];
      alertasByOrg[org.id] = alertas;
      // null = alcance de toda la organización; Set = solo asignadas.
      if (resolved?.branchIds && resolved.branchIds.size === 0) continue;
      const branchRows = (resolved?.sucursalesActivas ?? []).filter(
        (branch) => resolved?.branchIds == null || resolved.branchIds.has(branch.id),
      );
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

    // Sucursal activa/preferida para checklist y accesos directos
    const requestedSucursalId = firstParam(params.sucursalId);
    let activeAccess = access[0];
    if (access.length > 0) {
      const orgId = access[0].organizationId;
      const preferidaId = requestedSucursalId ?? (orgId ? await leerSucursalCookie(orgId) : undefined);
      if (preferidaId) {
        activeAccess = access.find((item) => item.branchId === preferidaId) ?? access[0];
      }
    }

    // Checklist de primera configuración sobre la sucursal activa:
    // se muestra mientras queden pasos requeridos y la guía no esté omitida.
    let checklist: ResumenGuia | null = null;
    if (activeAccess) {
      const pasos = pasosParaPermisos(new Set(permissionsByOrg[activeAccess.organizationId] ?? []));
      if (pasos.length > 0) {
        const [estadoNegocio, progreso] = await Promise.all([
          cargarEstadoNegocio(db, activeAccess.organizationId, activeAccess.branchId),
          cargarProgresoGuia(db, activeAccess.organizationId, user.id),
        ]);
        const resumen = resumenGuia(evaluarPasos(pasos, estadoNegocio));
        if (!resumen.terminada && progreso?.estado !== "omitida") {
          checklist = resumen;
        }
      }
    }

    // Tarjeta "¿Cómo se llama tu salón?": la primera organización con una
    // única sucursal activa que aún se llame "Sucursal principal", si el
    // usuario puede editarla y no la descartó (cookie por sucursal).
    let renombrar: { organizationId: string; sucursalId: string; nombreSugerido: string } | null = null;
    for (const { org, resolved } of porOrganizacion) {
      if (renombrar) break;
      if (!resolved || resolved.sucursalesActivas.length !== 1) continue;
      const unica = resolved.sucursalesActivas[0];
      if (!unica || unica.nombre !== "Sucursal principal") continue;
      if (!hasPermission(resolved, "sucursales.editar") || !canAccessBranch(resolved, unica.id)) continue;
      if (await leerNombreSucursalOmitida(unica.id)) continue;
      renombrar = { organizationId: org.id, sucursalId: unica.id, nombreSugerido: org.nombre };
    }

    return (
      <MemberDashboard
        access={access}
        activeAccess={activeAccess}
        alertasByOrg={alertasByOrg}
        checklist={checklist}
        error={error}
        name={session.user.name}
        permissionsByOrg={permissionsByOrg}
        renombrar={renombrar}
      />
    );
  }

  const { session: platformSession } = await requirePlatformAdmin();
  const ahora = new Date();
  const hace30d = new Date(ahora.getTime() - 30 * 24 * 60 * 60_000);
  const [organizations, roles, branches, suscripcionRows, solicitudes, planesCatalogo, orgsConVenta, adquisicionRows, adquisicionPorOrigen] = await Promise.all([
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
      .select({
        clave: planes.clave,
        nombre: planes.nombre,
        precioMensual: planes.precioMensual,
        precioAnual: planes.precioAnual,
        sucursalesIncluidas: planes.sucursalesIncluidas,
        precioSucursalExtra: planes.precioSucursalExtra,
      })
      .from(planes)
      .where(eq(planes.activo, true))
      .orderBy(planes.orden),
    // Activación: organizaciones que ya cobraron al menos una venta.
    db
      .select({ organizacionId: ventas.organizacionId })
      .from(ventas)
      .where(and(eq(ventas.estado, "completada"), eq(ventas.activo, true)))
      .groupBy(ventas.organizacionId),
    // Adquisición 30d: visitas únicas (vid), registros y atribución vid→registro.
    db
      .select({
        visitas: sql<number>`count(distinct ${telemetriaEventos.vid}) filter (where ${telemetriaEventos.tipo} = 'visita')`,
        registros: sql<number>`count(*) filter (where ${telemetriaEventos.tipo} = 'registro_completado')`,
        atribuidos: sql<number>`count(*) filter (where ${telemetriaEventos.tipo} = 'registro_completado' and ${telemetriaEventos.vid} in (select vid from telemetria_eventos where tipo = 'visita' and vid is not null))`,
      })
      .from(telemetriaEventos)
      .where(gte(telemetriaEventos.createdAt, hace30d)),
    db
      .select({
        origen: telemetriaEventos.origen,
        unicas: sql<number>`count(distinct ${telemetriaEventos.vid})`,
      })
      .from(telemetriaEventos)
      .where(and(eq(telemetriaEventos.tipo, "visita"), gte(telemetriaEventos.createdAt, hace30d)))
      .groupBy(telemetriaEventos.origen),
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
  // Embudo del piloto: registro → trial → activación (primer cobro) →
  // conversión (suscripción activa). Métricas derivadas de datos reales —
  // sin eventos sintéticos.
  const activadas = new Set(orgsConVenta.map((row) => row.organizacionId)).size;
  let trialsVigentes = 0;
  let convertidas = 0;
  let vencidasOCanceladas = 0;
  for (const row of suscripcionPorOrg.values()) {
    if (row.estado === "trialing" && estadoEfectivoSuscripcion(row, ahora) === "vigente") {
      trialsVigentes += 1;
    } else if (row.estado === "activa" && estadoEfectivoSuscripcion(row, ahora) === "vigente") {
      convertidas += 1;
    } else if (estadoEfectivoSuscripcion(row, ahora) === "vencida" || row.estado === "cancelada" || row.estado === "vencida") {
      vencidasOCanceladas += 1;
    }
  }
  const registradas = organizations.length;
  const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);
  const embudo = [
    { etiqueta: "Registradas", valor: registradas },
    { etiqueta: "En prueba ahora", valor: trialsVigentes, pct: pct(trialsVigentes, registradas) },
    { etiqueta: "Activadas (1er cobro)", valor: activadas, pct: pct(activadas, registradas) },
    // Conversión sobre las activadas: de las que ya cobraron algo, cuántas
    // quedaron pagando. Es la tasa que importa comercialmente.
    { etiqueta: "Convertidas (pagando)", valor: convertidas, pct: pct(convertidas, Math.max(activadas, 1)) },
    { etiqueta: "Vencidas / canceladas", valor: vencidasOCanceladas },
  ];

  return (
    <div className="space-y-6">
      <AccessError error={error} />
      <AdminPageHeader
        description={`Hola, ${platformSession.user.name}. Crea negocios y prepara su primera sucursal.`}
        title="Organizaciones y sucursales"
      />
      <AdminCard
        description="Registro → prueba → primer cobro → pago. Sobre datos reales de suscripciones y ventas."
        title="Embudo del piloto"
      >
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          {embudo.map((etapa) => (
            <div className="rounded-xl bg-muted/60 px-3 py-2" key={etapa.etiqueta}>
              <dt className="text-op-xs uppercase tracking-wide text-muted-foreground">{etapa.etiqueta}</dt>
              <dd className="mt-0.5 text-lg font-semibold text-foreground">
                {etapa.valor}
                {etapa.pct != null ? <span className="ml-1 text-xs font-normal text-muted-foreground">{etapa.pct}%</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </AdminCard>
      <AdminCard
        description="Visitas al landing/precios → registro completado. Atribución por visitante anónimo (sin IPs ni datos personales)."
        title="Adquisición (últimos 30 días)"
      >
        {(() => {
          const tot = adquisicionRows[0] ?? { visitas: 0, registros: 0, atribuidos: 0 };
          const conversion = tot.visitas > 0 ? Math.round((tot.atribuidos / tot.visitas) * 100) : 0;
          return (
            <>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                {[
                  { etiqueta: "Visitas únicas", valor: tot.visitas },
                  { etiqueta: "Registros", valor: tot.registros },
                  { etiqueta: "Atribuidos a visita", valor: tot.atribuidos },
                  { etiqueta: "Conversión visita→registro", valor: `${conversion}%` },
                ].map((etapa) => (
                  <div className="rounded-xl bg-muted/60 px-3 py-2" key={etapa.etiqueta}>
                    <dt className="text-op-xs uppercase tracking-wide text-muted-foreground">{etapa.etiqueta}</dt>
                    <dd className="mt-0.5 text-lg font-semibold text-foreground">{etapa.valor}</dd>
                  </div>
                ))}
              </dl>
              {adquisicionPorOrigen.length > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Por origen:{" "}
                  {adquisicionPorOrigen.map((o) => `${o.origen} ${o.unicas}`).join(" · ")}
                </p>
              ) : null}
            </>
          );
        })()}
      </AdminCard>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
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
                  <div className="rounded-xl border border-border px-4 py-3" key={organization.id}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{organization.nombre}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{organization.slug}</p>
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
          <ul className="divide-y divide-border text-sm">
            {solicitudes.map((solicitud) => {
              const payload = (solicitud.payload ?? {}) as Record<string, unknown>;
              return (
                <li className="flex flex-wrap items-center justify-between gap-2 py-2.5" key={solicitud.id}>
                  <div>
                    <p className="font-medium text-foreground">{solicitud.organizacion}</p>
                    <p className="text-xs text-muted-foreground">
                      {solicitud.tipo === "plan.cambio_solicitado"
                        ? `Cambio a ${String(payload.planNombre ?? payload.planClave ?? "?")} (${String(payload.periodicidad ?? "mensual")}${typeof payload.sucursales === "number" ? ` · ${payload.sucursales} sucursal(es)` : ""})`
                        : `Cancelación${payload.motivo ? ` — ${String(payload.motivo)}` : ""}`}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">{solicitud.createdAt.toISOString().slice(0, 10)}</span>
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
