import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/page-header";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { buildAdminHref } from "@/lib/url-context";

import { PracticaFlow } from "./practica-flow";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

/**
 * Recorrido de práctica 100 % en memoria: no crea citas, ventas,
 * movimientos de caja ni envía correos. Solo enseña el flujo.
 */
export default async function PracticaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, organizationId, sucursalId } = context;
  if (!organization || !branch || !organizationId || !sucursalId) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Un recorrido corto con datos de ejemplo para conocer el sistema sin tocar tu negocio."
        title="Práctica"
      />
      <PracticaFlow
        ayudaHref={buildAdminHref("/ayuda", { organizationId, sucursalId })}
        historialHref={buildAdminHref("/ventas", { organizationId, sucursalId })}
      />
    </div>
  );
}
