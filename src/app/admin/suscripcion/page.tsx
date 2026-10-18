import { sql } from "drizzle-orm";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CambioPlanForm, CancelacionForm } from "@/app/admin/suscripcion/suscripcion-forms";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { CAPACIDADES, planCatalogoPorClave, type CapacidadClave } from "@/modules/billing/capacidades";
import { getPlanesActivos, getSuscripcionActualCache } from "@/modules/billing/queries";
import { diasRestantesTrial, estadoEfectivoSuscripcion, type EstadoEfectivo } from "@/modules/billing/rules";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const ESTADO_TONO: Record<EstadoEfectivo, "success" | "destructive"> = {
  vigente: "success",
  vencida: "destructive",
};

const EVENTO_LABEL: Record<string, string> = {
  "trial.iniciado": "Prueba iniciada",
  "pago.confirmado": "Pago confirmado",
  "plan.cambio_solicitado": "Cambio de plan solicitado",
  "cancelacion.solicitada": "Cancelación solicitada",
};

function estadoTexto(efectivo: EstadoEfectivo, estadoDb: string, diasTrial: number | null, termina: Date | null) {
  if (efectivo === "vencida") return "Vencida — datos en solo lectura";
  if (estadoDb === "trialing") {
    return `Prueba gratuita${diasTrial !== null ? ` · quedan ${diasTrial} día(s)` : ""}`;
  }
  if (estadoDb === "past_due") return "Pago pendiente (periodo de gracia)";
  return `Activa${termina ? ` · próximo corte ${termina.toISOString().slice(0, 10)}` : ""}`;
}

/** Suscripción del negocio: plan vigente, uso vs límites, cambio y historial. */
export default async function SuscripcionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "organizaciones.ver");
  const organizationId = context.organization.id;
  const puedeEditar = hasPermission(context.access, "organizaciones.editar");
  const db = getDatabase();
  const ahora = new Date();

  type PagoJson = {
    id: string;
    monto: string;
    moneda: string;
    proveedor: string;
    periodoDesde: string | null;
    periodoHasta: string | null;
    estado: string;
    createdAt: string;
  };
  type EventoJson = { id: string; tipo: string; createdAt: string };
  type SuscripcionSqlRow = {
    miembros_activos: number;
    sucursales_activas: number;
    invitaciones_pendientes: number;
    pagos: PagoJson[];
    eventos: EventoJson[];
  };

  // Uso (miembros + invitaciones + sucursales) y los últimos pagos/eventos en
  // UNA sola consulta SQL (antes eran 5 consultas en 2 rondas secuenciales).
  const [actual, planesCatalogo, datosResult] = await Promise.all([
    getSuscripcionActualCache(organizationId),
    getPlanesActivos(),
    db.execute<SuscripcionSqlRow>(sql`
      select
        (
          select count(*)::int from miembros_organizaciones mo
          where mo.organizacion_id = ${organizationId} and mo.estado = 'activo'
        ) as miembros_activos,
        (
          select count(*)::int from sucursales s
          where s.organizacion_id = ${organizationId} and s.activo = true
        ) as sucursales_activas,
        (
          select count(*)::int from invitaciones_usuarios iu
          where iu.organizacion_id = ${organizationId} and iu.estado = 'pendiente'
        ) as invitaciones_pendientes,
        coalesce((
          select jsonb_agg(t) from (
            select
              p.id,
              p.monto::text as monto,
              p.moneda,
              p.proveedor,
              p.periodo_desde::text as "periodoDesde",
              p.periodo_hasta::text as "periodoHasta",
              p.estado,
              to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
            from pagos_suscripcion p
            where p.organizacion_id = ${organizationId}
            order by p.created_at desc
            limit 10
          ) t
        ), '[]'::jsonb) as pagos,
        coalesce((
          select jsonb_agg(t) from (
            select
              e.id,
              e.tipo,
              to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
            from billing_eventos e
            where e.organizacion_id = ${organizationId}
            order by e.created_at desc
            limit 10
          ) t
        ), '[]'::jsonb) as eventos
    `),
  ]);

  const datos = datosResult.rows[0];
  const uso = { miembros: datos?.miembros_activos ?? 0 };
  const sucursalesActivas = datos?.sucursales_activas ?? 0;
  const invitacionesPendientes = datos?.invitaciones_pendientes ?? 0;
  const pagos = (datos?.pagos ?? []).map((p) => ({ ...p, createdAt: new Date(p.createdAt) }));
  const eventos = (datos?.eventos ?? []).map((e) => ({ ...e, createdAt: new Date(e.createdAt) }));

  const efectivo = estadoEfectivoSuscripcion(actual, ahora);
  const diasTrial = diasRestantesTrial(actual, ahora);
  const capacidades = new Set(actual?.capacidades ?? []);
  const usuariosUsados = uso.miembros + invitacionesPendientes;
  const fmt = (v: string | number) => formatCurrency(Number(v), { currency: context.currency });

  // Tarifa fundador: el snapshot contratado quedó por debajo del precio de
  // lista del plan (la condición se conserva mientras la suscripción siga).
  const planActual = actual?.planClave ? planCatalogoPorClave(actual.planClave) : undefined;
  const listaActual = planActual
    ? actual?.periodicidad === "anual"
      ? planActual.precioListaAnual
      : planActual.precioListaMensual
    : null;
  const esTarifaFundador =
    actual?.precioUnitario != null &&
    listaActual != null &&
    Number(actual.precioUnitario) < Number(listaActual);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          puedeEditar && planesCatalogo.length > 0 ? (
            <Button
              data-action-clave="1"
              data-action-id="suscripcion.plan.ver_opciones"
              nativeButton={false}
              render={<Link href={`${buildAdminHref("/suscripcion", { organizationId })}#cambiar-plan`} />}
              size="lg"
              variant="outline"
            >
              Ver opciones de plan
            </Button>
          ) : undefined
        }
        description="Plan contratado, uso actual y solicitudes de cambio."
        title="Suscripción"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminCard description="Tu plan y el estado de la suscripción" title="Plan actual">
          {!actual ? (
            <EmptyState
              description="Esta organización opera sin suscripción registrada (cuenta histórica o creada por soporte)."
              title="Sin suscripción"
            />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-foreground">{actual.planNombre ?? "Plan desconocido"}</p>
                    {esTarifaFundador ? (
                      <span className="rounded-full bg-accent px-2.5 py-0.5 text-op-xs font-semibold text-primary">
                        Tarifa fundador
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {actual.periodicidad === "anual" ? "Facturación anual" : "Facturación mensual"} ·{" "}
                    {actual.sucursalesFacturadas} sucursal(es) cubierta(s)
                    {esTarifaFundador ? " · precio protegido mientras siga activa" : ""}
                  </p>
                  {actual.precioUnitario ? (
                    <p className="text-op-xs text-muted-foreground">
                      Contratado: {fmt(actual.precioUnitario)} por periodo
                      {actual.sucursalesIncluidas != null ? ` (incluye ${actual.sucursalesIncluidas})` : ""}
                      {actual.precioSucursalExtra ? ` + ${fmt(actual.precioSucursalExtra)} por adicional` : ""}
                    </p>
                  ) : null}
                </div>
                <StatusBadge tone={ESTADO_TONO[efectivo]}>
                  {estadoTexto(efectivo, actual.estado, diasTrial, actual.periodoTerminaAt)}
                </StatusBadge>
              </div>
              {actual.motivoCancelacion || actual.canceladaAt ? (
                <p className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-op-xs text-warning-soft-foreground">
                  Cancelación registrada{actual.canceladaAt ? ` el ${actual.canceladaAt.toISOString().slice(0, 10)}` : ""}.
                  Conservas el acceso hasta el fin del periodo ya cubierto.
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-muted/60 px-3 py-2">
                  <dt className="text-op-xs text-muted-foreground">Usuarios (activos + invitaciones)</dt>
                  <dd className="font-semibold text-foreground">
                    {usuariosUsados} / {actual.maxUsuarios ?? "∞"}
                  </dd>
                </div>
                <div className="rounded-xl bg-muted/60 px-3 py-2">
                  <dt className="text-op-xs text-muted-foreground">Sucursales activas</dt>
                  <dd className="font-semibold text-foreground">
                    {sucursalesActivas} / {actual.maxSucursales ?? "∞"}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </AdminCard>

        <AdminCard description="Lo que incluye tu plan vigente" title="Capacidades">
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {(Object.keys(CAPACIDADES) as CapacidadClave[]).map((clave) => {
              const incluida = capacidades.has(clave);
              return (
                <li className="flex items-start gap-2 text-sm" key={clave}>
                  {incluida ? (
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <Minus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className={incluida ? "text-foreground" : "text-muted-foreground"}>
                    {CAPACIDADES[clave].nombre}
                  </span>
                </li>
              );
            })}
          </ul>
        </AdminCard>
      </div>

      <AdminCard
        description="El precio base incluye sucursales según el plan; cada adicional tiene su precio. IVA incluido. El cambio se confirma por transferencia antes de aplicarse."
        id="cambiar-plan"
        title="Cambiar de plan"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {planesCatalogo.map((plan) => {
            const esActual = actual?.planClave === plan.clave;
            return (
              <div
                className={`rounded-2xl border p-4 ${plan.recomendado ? "border-primary bg-accent/70" : "border-border bg-card"}`}
                key={plan.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{plan.nombre}</p>
                  {esActual ? <StatusBadge tone="neutral">Actual</StatusBadge> : null}
                </div>
                <p className="mt-1 text-op-xs leading-5 text-muted-foreground">{plan.descripcion}</p>
                <p className="mt-3 text-lg font-semibold text-foreground">
                  {fmt(plan.precioMensual)} <span className="text-op-xs font-normal text-muted-foreground">/mes</span>
                </p>
                <p className="text-op-xs text-muted-foreground">
                  Incluye {plan.sucursalesIncluidas} sucursal(es)
                  {plan.precioSucursalExtra
                    ? ` · ${fmt(plan.precioSucursalExtra)}/mes por sucursal adicional`
                    : plan.maxSucursales != null && plan.maxSucursales > plan.sucursalesIncluidas
                      ? ` (máx. ${plan.maxSucursales})`
                      : ""}
                </p>
                {plan.precioAnual ? (
                  <p className="text-op-xs text-muted-foreground">
                    o {fmt(plan.precioAnual)} /año (equivale a {fmt(Number(plan.precioAnual) / 12)}/mes)
                  </p>
                ) : null}
                {puedeEditar && !esActual ? (
                  <div className="mt-4">
                    <CambioPlanForm
                      organizacionId={organizationId}
                      periodicidadActual={actual?.periodicidad ?? "mensual"}
                      planClave={plan.clave}
                      sucursalesActuales={actual?.sucursalesFacturadas ?? sucursalesActivas}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </AdminCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminCard description="Pagos confirmados de la suscripción" title="Historial de pagos">
          {pagos.length === 0 ? (
            <EmptyState description="Todavía no hay pagos registrados." title="Sin pagos" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {pagos.map((pago) => (
                <li className="flex flex-wrap items-center justify-between gap-2 py-2.5" key={pago.id}>
                  <div>
                    <p className="font-medium text-foreground">{fmt(pago.monto)} {pago.moneda}</p>
                    <p className="text-op-xs text-muted-foreground">
                      {formatDateTime(pago.createdAt)} · {pago.proveedor}
                      {pago.periodoDesde && pago.periodoHasta
                        ? ` · cubre ${pago.periodoDesde} → ${pago.periodoHasta}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge tone={pago.estado === "confirmado" ? "success" : "neutral"}>{pago.estado}</StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard description="Movimientos de la suscripción" title="Actividad">
          {eventos.length === 0 ? (
            <EmptyState description="Sin actividad registrada." title="Sin eventos" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {eventos.map((evento) => (
                <li className="flex items-center justify-between gap-2 py-2.5" key={evento.id}>
                  <span className="text-foreground">{EVENTO_LABEL[evento.tipo] ?? evento.tipo}</span>
                  <span className="text-op-xs text-muted-foreground">{formatDateTime(evento.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>

      {puedeEditar && actual && efectivo === "vigente" ? (
        <AdminCard
          description="La cancelación detiene cobros futuros; conservas el acceso hasta el fin del periodo ya cubierto y tus datos permanecen."
          title="Cancelar suscripción"
        >
          <CancelacionForm organizacionId={organizationId} />
        </AdminCard>
      ) : null}
    </div>
  );
}
