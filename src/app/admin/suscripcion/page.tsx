import { and, count, desc, eq } from "drizzle-orm";
import { Check, Minus } from "lucide-react";
import { notFound } from "next/navigation";

import { CambioPlanForm, CancelacionForm } from "@/app/admin/suscripcion/suscripcion-forms";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { invitacionesUsuarios } from "@/db/schema/access";
import { billingEventos, pagosSuscripcion } from "@/db/schema/billing";
import { miembrosOrganizaciones, sucursales } from "@/db/schema/core";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { CAPACIDADES, type CapacidadClave } from "@/modules/billing/capacidades";
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

  const [actual, planesCatalogo, uso, sucursalesActivas, pagos, eventos] = await Promise.all([
    getSuscripcionActualCache(organizationId),
    getPlanesActivos(),
    db
      .select({
        miembros: count(miembrosOrganizaciones.id),
      })
      .from(miembrosOrganizaciones)
      .where(
        and(
          eq(miembrosOrganizaciones.organizacionId, organizationId),
          eq(miembrosOrganizaciones.estado, "activo"),
        ),
      )
      .then((rows) => rows[0] ?? { miembros: 0 }),
    db
      .select({ activas: count() })
      .from(sucursales)
      .where(and(eq(sucursales.organizacionId, organizationId), eq(sucursales.activo, true)))
      .then((rows) => rows[0]?.activas ?? 0),
    db
      .select()
      .from(pagosSuscripcion)
      .where(eq(pagosSuscripcion.organizacionId, organizationId))
      .orderBy(desc(pagosSuscripcion.createdAt))
      .limit(10),
    db
      .select()
      .from(billingEventos)
      .where(eq(billingEventos.organizacionId, organizationId))
      .orderBy(desc(billingEventos.createdAt))
      .limit(10),
  ]);

  const [{ invitacionesPendientes }] = await db
    .select({ invitacionesPendientes: count() })
    .from(invitacionesUsuarios)
    .where(
      and(
        eq(invitacionesUsuarios.organizacionId, organizationId),
        eq(invitacionesUsuarios.estado, "pendiente"),
      ),
    );

  const efectivo = estadoEfectivoSuscripcion(actual, ahora);
  const diasTrial = diasRestantesTrial(actual, ahora);
  const capacidades = new Set(actual?.capacidades ?? []);
  const usuariosUsados = uso.miembros + invitacionesPendientes;
  const fmt = (v: string | number) => formatCurrency(Number(v), { currency: context.currency });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Plan contratado, uso actual y solicitudes de cambio."
        title="Suscripción"
      />

      <div className="grid gap-4 lg:grid-cols-2">
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
                  <p className="text-lg font-semibold text-[#2d2926]">{actual.planNombre ?? "Plan desconocido"}</p>
                  <p className="text-sm text-[#81746c]">
                    {actual.periodicidad === "anual" ? "Facturación anual" : "Facturación mensual"} ·{" "}
                    {actual.sucursalesFacturadas} sucursal(es) cubierta(s)
                  </p>
                  {actual.precioUnitario ? (
                    <p className="text-xs text-[#95877e]">
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
                <p className="rounded-xl border border-[#ecd9c4] bg-[#fdf7ef] px-3 py-2 text-xs text-[#7a4f22]">
                  Cancelación registrada{actual.canceladaAt ? ` el ${actual.canceladaAt.toISOString().slice(0, 10)}` : ""}.
                  Conservas el acceso hasta el fin del periodo ya cubierto.
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-[#faf6f3] px-3 py-2">
                  <dt className="text-xs text-[#95877e]">Usuarios (activos + invitaciones)</dt>
                  <dd className="font-semibold text-[#2d2926]">
                    {usuariosUsados} / {actual.maxUsuarios ?? "∞"}
                  </dd>
                </div>
                <div className="rounded-xl bg-[#faf6f3] px-3 py-2">
                  <dt className="text-xs text-[#95877e]">Sucursales activas</dt>
                  <dd className="font-semibold text-[#2d2926]">
                    {sucursalesActivas} / {actual.maxSucursales ?? "∞"}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </AdminCard>

        <AdminCard description="Lo que incluye tu plan vigente" title="Capacidades">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {(Object.keys(CAPACIDADES) as CapacidadClave[]).map((clave) => {
              const incluida = capacidades.has(clave);
              return (
                <li className="flex items-start gap-2 text-sm" key={clave}>
                  {incluida ? (
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#2f6a4b]" />
                  ) : (
                    <Minus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[#c9beb6]" />
                  )}
                  <span className={incluida ? "text-[#403a35]" : "text-[#a89b92]"}>
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
        title="Cambiar de plan"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {planesCatalogo.map((plan) => {
            const esActual = actual?.planClave === plan.clave;
            return (
              <div
                className={`rounded-2xl border p-4 ${plan.recomendado ? "border-[#b8795d] bg-[#fdf7f2]" : "border-[#eee6e0] bg-white"}`}
                key={plan.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-[#2d2926]">{plan.nombre}</p>
                  {esActual ? <StatusBadge tone="neutral">Actual</StatusBadge> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-[#81746c]">{plan.descripcion}</p>
                <p className="mt-3 text-lg font-semibold text-[#2d2926]">
                  {fmt(plan.precioMensual)} <span className="text-xs font-normal text-[#81746c]">/mes</span>
                </p>
                <p className="text-xs text-[#81746c]">
                  Incluye {plan.sucursalesIncluidas} sucursal(es)
                  {plan.precioSucursalExtra
                    ? ` · ${fmt(plan.precioSucursalExtra)}/mes por sucursal adicional`
                    : plan.maxSucursales != null && plan.maxSucursales > plan.sucursalesIncluidas
                      ? ` (máx. ${plan.maxSucursales})`
                      : ""}
                </p>
                {plan.precioAnual ? (
                  <p className="text-xs text-[#81746c]">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard description="Pagos confirmados de la suscripción" title="Historial de pagos">
          {pagos.length === 0 ? (
            <EmptyState description="Todavía no hay pagos registrados." title="Sin pagos" />
          ) : (
            <ul className="divide-y divide-[#f2ece7] text-sm">
              {pagos.map((pago) => (
                <li className="flex flex-wrap items-center justify-between gap-2 py-2.5" key={pago.id}>
                  <div>
                    <p className="font-medium text-[#2d2926]">{fmt(pago.monto)} {pago.moneda}</p>
                    <p className="text-xs text-[#95877e]">
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
            <ul className="divide-y divide-[#f2ece7] text-sm">
              {eventos.map((evento) => (
                <li className="flex items-center justify-between gap-2 py-2.5" key={evento.id}>
                  <span className="text-[#403a35]">{EVENTO_LABEL[evento.tipo] ?? evento.tipo}</span>
                  <span className="text-xs text-[#95877e]">{formatDateTime(evento.createdAt)}</span>
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
