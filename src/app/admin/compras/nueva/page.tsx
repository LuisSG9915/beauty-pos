import { notFound } from "next/navigation";

import { NuevaCompra } from "@/app/admin/compras/nueva/nueva-compra";
import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

/**
 * Punto de entrada de una compra (plan 10): "Tomar foto del ticket" dispara
 * la cámara y sube la foto con la compra en una sola petición
 * (`POST /api/compras`); "Capturar sin foto" crea el borrador vacío. Tras
 * crear se navega al detalle, que lanza el análisis de IA.
 */
export default async function NuevaCompraPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch } = context;

  if (!organization) notFound();
  requireAccessPermission(context.access, "compras.editar");

  if (!branch) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="Tickets de proveedores y recepción de mercancía." title="Nueva compra" />
        <EmptyState description={`${organization.nombre} no tiene sucursales activas.`} title="Sin sucursal activa" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          { label: "Compras", href: buildAdminHref("/compras", { organizationId: organization.id, sucursalId: branch.id }) },
          { label: "Nueva compra" },
        ]}
        description={`${branch.nombre} · registra el ticket del proveedor.`}
        title="Nueva compra"
      />
      <NuevaCompra organizacionId={organization.id} sucursalId={branch.id} />
    </div>
  );
}
