import { Map } from "lucide-react";

import { PlanoBoard } from "@/app/admin/plano/plano-board";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { getAdminContext } from "@/lib/admin-context";
import { hasPermission } from "@/lib/auth/authorization";
import { redirect } from "next/navigation";
import { firstParam } from "@/lib/url-context";
import { cargarPlano } from "@/modules/plano";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string | string[];
  sucursalId?: string | string[];
  /** Producto a resaltar en el mapa (ancla de «Ver en el mapa» de inventario). */
  producto?: string | string[];
}>;

/**
 * Plano del salón: pisos, ubicaciones de mercancía y mobiliario sobre una
 * cuadrícula SVG. Vista con `sucursales.ver` o `inventario.ver`; la edición
 * exige `sucursales.editar` y las cantidades `inventario.editar` (plan 11).
 */
export default async function PlanoPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, organizationId } = context;

  if (!organization) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="Ubicaciones, mercancía y muebles de la sucursal." title="Plano del salón" />
        <EmptyState description="Tu cuenta no tiene un negocio activo asignado." title="Sin negocio" />
      </div>
    );
  }

  const puedeVer =
    hasPermission(context.access, "sucursales.ver") || hasPermission(context.access, "inventario.ver");
  if (!puedeVer) {
    redirect(`/admin?error=permiso-denegado&permiso=${encodeURIComponent("plano")}`);
  }

  if (!branch) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="Ubicaciones, mercancía y muebles de la sucursal." title="Plano del salón" />
        <EmptyState
          description={`${organization.nombre} no tiene sucursales activas.`}
          icon={Map}
          title="Sin sucursal activa"
        />
      </div>
    );
  }

  // Una sola consulta fusionada: pisos + ubicaciones (con productos) +
  // mobiliario (con recurso y foto) + productos con stock + recursos.
  const datos = await cargarPlano(getDatabase(), {
    organizacionId: organization.id,
    sucursalId: branch.id,
  });

  const soloLectura = context.access.soloLectura;
  const puedeEditarPlano = hasPermission(context.access, "sucursales.editar") && !soloLectura;
  const puedeEditarCantidades = hasPermission(context.access, "inventario.editar") && !soloLectura;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`${branch.nombre} · ubicaciones de mercancía y mobiliario por piso.`}
        title="Plano del salón"
      />
      <PlanoBoard
        datos={datos}
        organizationId={organizationId ?? organization.id}
        puedeEditarCantidades={puedeEditarCantidades}
        puedeEditarPlano={puedeEditarPlano}
        productoInicial={firstParam(params.producto)}
        sucursalId={branch.id}
      />
    </div>
  );
}
