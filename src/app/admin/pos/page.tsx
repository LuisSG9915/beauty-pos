import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { crearVentaDirecta } from "@/app/admin/pos/actions";
import { OfflineCatalogoCache } from "@/app/admin/pos/offline-cache";
import { VentaDirectaSubmit } from "@/app/admin/pos/venta-directa-submit";
import { VentaTicket } from "@/app/admin/pos/venta-ticket";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { ventas } from "@/db/schema/operations";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { canAccessBranch, hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatTime } from "@/lib/format";
import { GLOSARIO } from "@/lib/glosario";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { dayBoundsUtc, dayKey } from "@/modules/agenda/timezone";
import { getTicketData } from "@/modules/pos/ticket";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

function safeReturnTo(value: string | undefined, fallback: string) {
  return value?.startsWith("/admin/") && !value.startsWith("//") ? value : fallback;
}

export default async function PosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "ventas.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const citaId = firstParam(params.citaId);
  const ventaIdParam = firstParam(params.ventaId);
  if (!ventaIdParam && citaId) {
    const [venta] = await db
      .select({ id: ventas.id, sucursalId: ventas.sucursalId })
      .from(ventas)
      .where(and(eq(ventas.citaId, citaId), eq(ventas.organizacionId, organizationId), eq(ventas.activo, true)))
      .limit(1);
    if (!venta) notFound();
    const returnTo = safeReturnTo(firstParam(params.returnTo), buildAdminHref("/agenda", { organizationId }));
    redirect(
      buildAdminHref("/pos", {
        organizationId,
        sucursalId: venta.sucursalId ?? undefined,
        extra: { ventaId: venta.id, returnTo },
      }),
    );
  }

  if (!ventaIdParam) return <PosIndex context={context} />;

  const ticket = await getTicketData(organizationId, ventaIdParam);
  if (!ticket || !canAccessBranch(context.access, ticket.venta.sucursalId)) notFound();

  const fallbackReturnTo = ticket.venta.citaId
    ? buildAdminHref("/agenda", { organizationId, sucursalId: ticket.venta.sucursalId })
    : buildAdminHref("/pos", { organizationId, sucursalId: ticket.venta.sucursalId });
  const returnTo = safeReturnTo(firstParam(params.returnTo), fallbackReturnTo);

  return (
    <div className="space-y-6">
      <OfflineCatalogoCache
        catalogo={{
          organizacionId: organizationId,
          sucursalId: ticket.venta.sucursalId,
          sucursalNombre: context.branches.find((b) => b.id === ticket.venta.sucursalId)?.nombre ?? "",
          moneda: context.currency,
          guardadoAt: "",
          servicios: ticket.catalogoServicios.map((s) => ({ id: s.id, nombre: s.nombre, precio: s.precio })),
          productos: ticket.catalogoProductos.map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio })),
          mediosPago: ticket.mediosPago,
          staff: ticket.staff,
        }}
      />
      <AdminPageHeader
        breadcrumbs={[
          { label: "Cobrar", href: buildAdminHref("/pos", { organizationId, sucursalId: ticket.venta.sucursalId }) },
          { label: "Ticket" },
        ]}
        description="Revisa el ticket, agrega líneas y confirma el cobro."
        title="Cobrar"
      />
      <VentaTicket
        anticipoAplicado={ticket.anticipoAplicado}
        anticipoPorAplicar={ticket.anticipoPorAplicar}
        anticipos={ticket.anticipos}
        catalogoClientes={ticket.catalogoClientes}
        catalogoMembresias={ticket.catalogoMembresias}
        catalogoPaquetes={ticket.catalogoPaquetes}
        catalogoProductos={ticket.catalogoProductos}
        catalogoServicios={ticket.catalogoServicios}
        comisiones={ticket.comisiones}
        currency={context.currency}
        devoluciones={ticket.devoluciones}
        devueltoPorDetalle={ticket.devueltoPorDetalle}
        lineasMembresias={ticket.lineasMembresias}
        lineasPaquetes={ticket.lineasPaquetes}
        lineasProductos={ticket.lineasProductos}
        lineasServicios={ticket.lineasServicios}
        mediosPago={ticket.mediosPago}
        membresiasCliente={ticket.membresiasCliente}
        organizationId={organizationId}
        pagos={ticket.pagos}
        paquetesCliente={ticket.paquetesCliente}
        promocionesDisponibles={ticket.promocionesDisponibles}
        propinas={ticket.propinas}
        clienteFiscal={ticket.clienteFiscal}
        comprobante={ticket.comprobante}
        facturacionConfigurada={ticket.facturacionConfigurada}
        puedeCancelar={hasPermission(context.access, "ventas.cancelar")}
        puedeAjustarPago={hasPermission(context.access, "ventas.ajustar_pago") || hasPermission(context.access, "ventas.cancelar")}
        puedeFacturar={hasPermission(context.access, "facturacion.emitir")}
        returnTo={returnTo}
        staff={ticket.staff}
        venta={ticket.venta}
      />
    </div>
  );
}

async function PosIndex({ context }: { context: Awaited<ReturnType<typeof getAdminContext>> }) {
  const organizationId = context.organization?.id;
  if (!organizationId) notFound();
  const db = getDatabase();
  const branches = context.branches;
  const sucursalId = context.sucursalId;
  const day = dayKey(new Date(), context.timeZone);
  const bounds = dayBoundsUtc(day, context.timeZone);
  const fechaVenta = sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;
  const ventasHoy =
    sucursalId && bounds
      ? await db
          .select({ id: ventas.id, estado: ventas.estado, total: ventas.total, fecha: fechaVenta, clienteNombre: clientes.nombre })
          .from(ventas)
          .leftJoin(clientes, eq(ventas.clienteId, clientes.id))
          .where(
            and(
              eq(ventas.organizacionId, organizationId),
              eq(ventas.sucursalId, sucursalId),
              eq(ventas.activo, true),
              gte(fechaVenta, bounds.iniciaAt),
              lt(fechaVenta, bounds.terminaAt),
            ),
          )
          .orderBy(desc(fechaVenta))
      : [];

  const currentHref = buildAdminHref("/pos", { organizationId, sucursalId });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button
            nativeButton={false}
            render={<Link href={buildAdminHref("/ventas", { organizationId, sucursalId })} />}
            variant="outline"
          >
            Ver historial
          </Button>
        }
        description="Abre una venta directa o continúa una venta del día en la sucursal seleccionada."
        title="Cobrar"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminCard description="Cobro al momento: productos y servicios sin cita agendada." title="Venta sin cita">
          <form action={crearVentaDirecta} className="flex flex-wrap items-end gap-3">
            <input name="organizacionId" type="hidden" value={organizationId} />
            <Field className="min-w-56 flex-1">
              <FieldLabel required>Sucursal</FieldLabel>
              <Select defaultValue={sucursalId ?? ""} name="sucursalId" required>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.nombre}
                  </option>
                ))}
              </Select>
            </Field>
            <VentaDirectaSubmit disabled={branches.length === 0} />
          </form>
          {branches.length === 0 ? (
            <p className="mt-3 text-sm font-medium text-warning">Necesitas una sucursal activa para vender.</p>
          ) : null}
        </AdminCard>

        <AdminCard
          actions={
            <form className="flex items-center gap-2" method="get">
              <input name="organizationId" type="hidden" value={organizationId} />
              <Field>
                <FieldLabel className="sr-only">Cambiar sucursal</FieldLabel>
                <Select defaultValue={sucursalId ?? ""} name="sucursalId">
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.nombre}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button className="rounded-xl" type="submit" variant="outline">
                Cambiar
              </Button>
            </form>
          }
          description={branches.find((branch) => branch.id === sucursalId)?.nombre ?? "Sin sucursal"}
          title="Ventas de hoy"
        >
          <div className="space-y-2">
            {ventasHoy.length === 0 ? (
              <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">Sin ventas hoy en esta sucursal.</p>
            ) : null}
            {ventasHoy.map((venta) => (
              <Link
                className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                href={buildAdminHref("/pos", {
                  organizationId,
                  sucursalId,
                  extra: { ventaId: venta.id, returnTo: currentHref },
                })}
                key={venta.id}
              >
                <span className="min-w-0 truncate">
                  {venta.clienteNombre ?? GLOSARIO.clienteDePaso} · {formatTime(venta.fecha, { timeZone: context.timeZone })}
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge
                    tone={
                      venta.estado === "en_proceso"
                        ? "warning"
                        : venta.estado === "cancelada"
                          ? "destructive"
                          : "success"
                    }
                  >
                    {venta.estado === "en_proceso" ? "En proceso" : venta.estado === "cancelada" ? "Cancelada" : "Completada"}
                  </StatusBadge>
                  <span className="tabular-nums">{formatCurrency(venta.total, { currency: context.currency })}</span>
                </span>
              </Link>
            ))}
          </div>
        </AdminCard>
      </div>
    </div>
  );
}
