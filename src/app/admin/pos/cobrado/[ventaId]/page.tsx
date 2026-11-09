import { notFound, redirect } from "next/navigation";

import { getAdminContext } from "@/lib/admin-context";
import { canAccessBranch, requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref } from "@/lib/url-context";
import { getTicketData } from "@/modules/pos/ticket";
import { VentaCobrada } from "./venta-cobrada";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string;
  sucursalId?: string;
}>;

type Params = Promise<{
  ventaId: string;
}>;

/**
 * Pantalla "Venta cobrada": confirmación post-cobro con total, formas de
 * pago, cambio a entregar, WhatsApp, impresión del comprobante y acciones
 * para ver la venta o abrir una nueva.
 */
export default async function CobradoPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { ventaId } = await params;
  const { organizationId, sucursalId } = await searchParams;

  if (!organizationId || !sucursalId || !ventaId) notFound();

  const context = await getAdminContext({ organizationId });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "ventas.ver");

  const ticket = await getTicketData(organizationId, ventaId);
  if (!ticket || !canAccessBranch(context.access, ticket.venta.sucursalId)) notFound();
  if (ticket.venta.sucursalId !== sucursalId) notFound();
  if (ticket.venta.estado !== "completada") {
    redirect(
      buildAdminHref("/pos", {
        organizationId,
        sucursalId,
      }),
    );
  }

  return (
    <div className="min-w-0 max-w-full">
      <VentaCobrada
        clienteNombre={ticket.venta.clienteNombre}
        clienteTelefono={ticket.venta.clienteTelefono}
        currency={context.currency}
        fecha={ticket.venta.cobradaAt ?? undefined}
        lineasMembresias={ticket.lineasMembresias}
        lineasPaquetes={ticket.lineasPaquetes}
        lineasProductos={ticket.lineasProductos}
        lineasServicios={ticket.lineasServicios}
        negocioNombre={context.organization.nombre}
        organizationId={organizationId}
        pagos={ticket.pagos}
        propina={ticket.venta.propina}
        subtotal={ticket.venta.subtotal}
        sucursalId={sucursalId}
        total={ticket.venta.total}
        ventaId={ventaId}
      />
    </div>
  );
}
