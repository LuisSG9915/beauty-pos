import { notFound, redirect } from "next/navigation";

import { getAdminContext } from "@/lib/admin-context";
import { getTicketData } from "@/modules/pos/ticket";
import { buildAdminHref } from "@/lib/url-context";
import { CobradoConfirmacion } from "./cobrado-cliente";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string;
  sucursalId?: string;
}>;

type Params = Promise<{
  ventaId: string;
}>;

/**
 * Página de confirmación post-cobro.
 * Se muestra tras cobrar una venta y ofrece enviar el ticket por WhatsApp,
 * imprimir, copiar enlace, ver la venta o empezar una nueva venta.
 * Al cerrar el modal, regresa al punto de venta.
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

  const ticket = await getTicketData(organizationId, ventaId);
  if (!ticket) notFound();
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
      <CobradoConfirmacion
        ventaId={ventaId}
        montoCobrado={Number(ticket.venta.total)}
        moneda={context.currency}
        organizacionId={organizationId}
        sucursalId={sucursalId}
      />
    </div>
  );
}
