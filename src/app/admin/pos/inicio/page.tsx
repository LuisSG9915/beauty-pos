import { notFound, redirect } from "next/navigation";

import { getAdminContext } from "@/lib/admin-context";
import { cargarConfiguracionPos, existeConfiguracionPos } from "@/modules/pos/queries";
import { buildAdminHref } from "@/lib/url-context";
import { PosInicioSeleccion } from "./seleccion";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string;
  error?: string;
}>;

export default async function PosInicioPage({
  searchParams,
}: { searchParams: SearchParams }) {
  const params = await searchParams;
  const organizationId = params.organizationId;
  if (!organizationId) notFound();

  const context = await getAdminContext({ organizationId });
  if (!context.organization) notFound();

  // Si la organización ya completó la selección, ir directo al POS.
  const yaConfigurado = await existeConfiguracionPos(organizationId);
  if (yaConfigurado) {
    redirect(buildAdminHref("/pos", { organizationId }));
  }

  const configuracionInicial = await cargarConfiguracionPos(organizationId);

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {params.error === "no-acceso" && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-op-xs text-destructive">
          No tienes acceso a esta organización.
        </div>
      )}
      {params.error === "seleccion-invalida" && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-op-xs text-destructive">
          La selección no es válida. Inténtalo de nuevo.
        </div>
      )}
      <PosInicioSeleccion
        organizationId={organizationId}
        negocioNombre={context.organization.nombre}
        configuracionInicial={configuracionInicial}
      />
    </div>
  );
}
