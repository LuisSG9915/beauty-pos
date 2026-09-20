import { Lock } from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { CAPACIDADES, type CapacidadClave } from "@/modules/billing/capacidades";

/**
 * Estado de "mejora tu plan" para páginas cuya capacidad no está incluida en
 * la suscripción vigente (o cuando la suscripción está vencida). La decisión
 * se toma en el loader de la página con `contextoSuscripcion` antes de
 * ejecutar las consultas del módulo.
 */
export function PlanUpgradeNotice({
  capacidad,
  planNombre,
  suscripcionHref,
}: {
  capacidad: CapacidadClave;
  /** null/undefined cuando la organización no tiene suscripción cargada. */
  planNombre: string | null | undefined;
  suscripcionHref: string;
}) {
  const cap = CAPACIDADES[capacidad];
  return (
    <div className="space-y-6">
      <AdminPageHeader description={cap.descripcion} title={cap.nombre} />
      <EmptyState
        action={
          <Button nativeButton={false} render={<Link href={suscripcionHref} />}>
            Ver planes
          </Button>
        }
        description="Cambia de plan para activar esta función. Tu información y configuración se conservan."
        icon={Lock}
        title={
          planNombre
            ? `${cap.nombre} no está incluido en el plan ${planNombre}`
            : `${cap.nombre} requiere una suscripción vigente`
        }
      />
    </div>
  );
}
