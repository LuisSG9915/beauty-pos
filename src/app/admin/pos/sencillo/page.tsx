import { notFound } from "next/navigation";

import { getAdminContext } from "@/lib/admin-context";
import { canAccessBranch, requireAccessPermission } from "@/lib/auth/authorization";
import { crearVentaSencilla } from "./actions";
import { getTicketData } from "@/modules/pos/ticket";
import { cargarConfiguracionPos } from "@/modules/pos/queries";
import { CobroSencillo } from "./cobro-sencillo";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string;
  sucursalId?: string;
  ventaId?: string;
  error?: string;
}>;

export default async function PosSencilloPage({
  searchParams,
}: { searchParams: SearchParams }) {
  const params = await searchParams;
  const organizationId = params.organizationId;
  const ventaId = params.ventaId;
  if (!organizationId) notFound();

  const context = await getAdminContext({ organizationId });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "ventas.ver");

  // Si no hay venta, mostrar botón para crear una (redirige con ventaId).
  if (!ventaId) {
    return (
      <div className="min-w-0 max-w-full space-y-6">
        <div className="rounded-xl border border-background bg-card p-6 shadow-sm">
          <h2 className="text-op-sm font-semibold mb-2">
            Punto de venta sencillo
          </h2>
          <p className="text-op-xs text-muted-foreground mb-4">
            Crea una venta directa y empieza a cobrar.
          </p>
          <form action={crearVentaSencilla}>
            <input name="organizacionId" type="hidden" value={organizationId} />
            <button
              className="w-full min-h-11 rounded-xl font-semibold bg-primary text-primary-foreground"
              type="submit"
            >
              Nueva venta
            </button>
          </form>
        </div>
        {params.error === "no-acceso" && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-op-xs text-destructive">
            No tienes acceso a esta organización.
          </div>
        )}
        {params.error === "sin-sucursal" && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-op-xs text-destructive">
            No hay una sucursal activa para esta organización.
          </div>
        )}
      </div>
    );
  }

  const sucursalId = params.sucursalId;
  if (!sucursalId) notFound();

  const ticket = await getTicketData(organizationId, ventaId);
  if (!ticket || ticket.venta.sucursalId !== sucursalId) notFound();
  if (!canAccessBranch(context.access, ticket.venta.sucursalId)) notFound();

  const configuracion = await cargarConfiguracionPos(organizationId);

  return (
    <CobroSencillo
      organizationId={organizationId}
      sucursalId={sucursalId}
      venta={ticket.venta}
      lineasServicios={ticket.lineasServicios}
      lineasProductos={ticket.lineasProductos}
      catalogoServicios={ticket.catalogoServicios}
      catalogoProductos={ticket.catalogoProductos}
      mediosPago={ticket.mediosPago}
      configuracion={configuracion}
      currency={context.currency}
    />
  );
}
