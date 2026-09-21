import { Compass, FlaskConical, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { buildAdminHref } from "@/lib/url-context";
import { cargarEstadoNegocio, cargarProgresoGuia } from "@/modules/onboarding/queries";
import { evaluarPasos, pasosParaPermisos, resumenGuia } from "@/modules/onboarding/rules";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const cardClass =
  "rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6";
const iconClass =
  "flex size-10 items-center justify-center rounded-xl bg-muted/60 text-primary";

/** Centro de ayuda: guía de configuración, práctica segura y soporte. */
export default async function AyudaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { user, organization, branch, organizationId, sucursalId, access } = context;
  if (!organization || !branch || !organizationId || !sucursalId) notFound();

  const pasos = pasosParaPermisos(access.esPlataforma ? null : access.permissions);
  const db = getDatabase();
  const [estado, progreso] = await Promise.all([
    cargarEstadoNegocio(db, organizationId, sucursalId),
    cargarProgresoGuia(db, organizationId, user.id),
  ]);
  const resumen = resumenGuia(evaluarPasos(pasos, estado));
  const guiaHref = buildAdminHref("/guia", { organizationId, sucursalId });
  const practicaHref = buildAdminHref("/practica", { organizationId, sucursalId });

  const guiaAccion =
    pasos.length === 0
      ? null
      : resumen.terminada
        ? { label: "Repetir guía", badge: "Completada" as const }
        : progreso?.estado === "omitida"
          ? { label: "Reanudar guía", badge: "Omitida" as const }
          : { label: "Continuar guía", badge: `${resumen.completados} de ${resumen.total}` };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Aprende el sistema a tu ritmo: practica con datos de ejemplo o sigue la guía sobre tu negocio real."
        title="Ayuda"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {guiaAccion ? (
          <section className={cardClass}>
            <div className={iconClass}><Compass aria-hidden="true" className="size-5" /></div>
            <div className="mt-4 flex items-center gap-2">
              <h2 className="font-semibold text-foreground">Guía de configuración</h2>
              <StatusBadge tone={guiaAccion.badge === "Completada" ? "success" : "neutral"}>
                {guiaAccion.badge}
              </StatusBadge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Paso a paso sobre tu negocio real: servicios, horario, primera cita y primer cobro.
              Los pasos se marcan solos cuando existen en el sistema.
            </p>
            <Button className="mt-4" nativeButton={false} render={<Link href={guiaHref} />}>
              {guiaAccion.label}
            </Button>
          </section>
        ) : null}

        <section className={cardClass}>
          <div className={iconClass}><FlaskConical aria-hidden="true" className="size-5" /></div>
          <h2 className="mt-4 font-semibold text-foreground">Práctica</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Recorrido con datos de ejemplo: agenda una cita, cóbrala y ve el ticket.
            No toca tus ventas, tu caja ni tu inventario, y puedes repetirlo las veces que quieras.
          </p>
          <Button className="mt-4" nativeButton={false} render={<Link href={practicaHref} />} variant="outline">
            Empezar práctica
          </Button>
        </section>

        <section className={cardClass}>
          <div className={iconClass}><LifeBuoy aria-hidden="true" className="size-5" /></div>
          <h2 className="mt-4 font-semibold text-foreground">Soporte</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            ¿Algo no cuadra o necesitas cambiar permisos? Contacta a quien administra tu
            organización; puede ajustar tu rol desde <strong>Equipo</strong>.
          </p>
        </section>
      </div>
    </div>
  );
}
