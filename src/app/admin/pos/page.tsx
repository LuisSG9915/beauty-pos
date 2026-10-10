import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { WifiOff } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { crearVentaDirecta } from "@/app/admin/pos/actions";
import { OfflineCatalogoCache } from "@/app/admin/pos/offline-cache";
import { VentaDirectaSubmit } from "@/app/admin/pos/venta-directa-submit";
import { VentaTicket } from "@/app/admin/pos/venta-ticket";
import { AdminNavTabs, CAJA_VENTAS_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { clientes } from "@/db/schema/core";
import { ventas } from "@/db/schema/operations";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { canAccessBranch, hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatTime } from "@/lib/format";
import { GLOSARIO } from "@/lib/glosario";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { dayBoundsUtc, dayKey } from "@/modules/agenda/timezone";
import { catalogosTicketCached, getTicketData } from "@/modules/pos/ticket";

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

  // Si viene con `nueva=1` (ej. botón directo de nueva venta),
  // crea la venta de inmediato en la sucursal activa sin pasar por pasos intermedios.
  if (!ventaIdParam && firstParam(params.nueva) === "1" && context.sucursalId) {
    requireAccessPermission(context.access, "ventas.crear");
    const [nuevaVenta] = await db
      .insert(ventas)
      .values({
        organizacionId: organizationId,
        sucursalId: context.sucursalId,
        estado: "en_proceso",
        createdBy: context.user.id,
      })
      .returning({ id: ventas.id });
    redirect(
      buildAdminHref("/pos", {
        organizationId,
        sucursalId: context.sucursalId,
        extra: { ventaId: nuevaVenta.id },
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
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            sucursalId={ticket.venta.sucursalId}
            tabs={CAJA_VENTAS_TABS}
          />
        }
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
  const [ventasHoy, catalogos] = await Promise.all([
    sucursalId && bounds
      ? db
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
      : Promise.resolve([]),
    sucursalId ? catalogosTicketCached(organizationId, sucursalId) : Promise.resolve(null),
  ]);

  const currentHref = buildAdminHref("/pos", { organizationId, sucursalId });

  return (
    <div className="space-y-6">
      {catalogos && sucursalId ? (
        <OfflineCatalogoCache
          catalogo={{
            organizacionId: organizationId,
            sucursalId,
            sucursalNombre: context.branches.find((b) => b.id === sucursalId)?.nombre ?? "",
            moneda: context.currency,
            guardadoAt: "",
            servicios: catalogos.catalogoServicios.map((s) => ({ id: s.id, nombre: s.nombre, precio: s.precio })),
            productos: catalogos.catalogoProductos.map((p) => ({ id: p.id, nombre: p.nombre, precio: p.precio })),
            mediosPago: catalogos.mediosPago,
            staff: catalogos.staff,
          }}
        />
      ) : null}
      <AdminPageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              nativeButton={false}
              render={
                <Link
                  href={`/offline/venta?organizacionId=${organizationId}&sucursalId=${sucursalId || ""}`}
                  title="Cobrar en modo de contingencia si el internet falla"
                />
              }
              size="sm"
              variant="outline"
            >
              <WifiOff className="size-4 mr-1 text-muted-foreground" />
              Venta sin conexión
            </Button>
            <Button
              data-action-clave="1"
              nativeButton={false}
              render={
                <Link
                  href={buildAdminHref("/pos", {
                    organizationId,
                    sucursalId,
                    extra: { nueva: "1" },
                  })}
                />
              }
              size="lg"
            >
              Nueva venta rápida
            </Button>
            <Button
              nativeButton={false}
              render={<Link href={buildAdminHref("/ventas", { organizationId, sucursalId })} />}
              variant="outline"
            >
              Ver historial
            </Button>
          </div>
        }
        description="Abre una venta directa o continúa una venta del día en la sucursal seleccionada."
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            sucursalId={sucursalId}
            tabs={CAJA_VENTAS_TABS}
          />
        }
        title="Cobrar"
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AdminCard description="Cobro al momento: productos y servicios sin cita agendada." title="Venta sin cita">
          {/* La sucursal se cambia desde el selector global del shell; aquí
              solo se muestra la activa para que el cobro quede claro. */}
          {context.branch ? (
            <div className="mb-4">
              <StatusBadge tone="neutral">Vendiendo en {context.branch.nombre}</StatusBadge>
            </div>
          ) : null}
          <form action={crearVentaDirecta} className="flex flex-wrap items-end gap-3">
            <input name="organizacionId" type="hidden" value={organizationId} />
            {/* El servidor vuelve a validar la sucursal contra el alcance del
                usuario (contexto + cookie + primera activa); el input solo
                propaga la resolución ya hecha por la página. */}
            <input name="sucursalId" type="hidden" value={sucursalId ?? ""} />
            <VentaDirectaSubmit disabled={branches.length === 0} />
          </form>
          {branches.length === 0 ? (
            <p className="mt-3 text-sm font-medium text-warning">Necesitas una sucursal activa para vender.</p>
          ) : null}
        </AdminCard>

        <AdminCard
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
