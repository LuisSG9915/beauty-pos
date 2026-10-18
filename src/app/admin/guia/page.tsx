import { ArrowRight, Calendar, CheckCircle2, Circle, CreditCard, FlaskConical, PartyPopper, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { buildAdminHref } from "@/lib/url-context";
import { cargarEstadoYProgresoGuia } from "@/modules/onboarding/queries";
import { evaluarPasos, pasosParaPermisos, resumenGuia } from "@/modules/onboarding/rules";

import { actualizarGuia } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

/** La acción concreta viaja como campo oculto `accion` (validada por zod). */
async function enviarAccionGuia(formData: FormData) {
  "use server";
  await actualizarGuia(formData);
}

/** Guía de primera configuración con pasos derivados del negocio real. */
export default async function GuiaPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { user, organization, branch, organizationId, sucursalId, access } = context;
  if (!organization || !branch || !organizationId || !sucursalId) notFound();

  const pasos = pasosParaPermisos(access.esPlataforma ? null : access.permissions);
  const db = getDatabase();
  const { estadoNegocio: estado, progresoGuia: progreso } = await cargarEstadoYProgresoGuia(
    db,
    organizationId,
    sucursalId,
    user.id,
  );
  const resumen = resumenGuia(evaluarPasos(pasos, estado));
  const omitida = progreso?.estado === "omitida";
  const siguientePaso = resumen.pasos.find((paso) => !paso.hecho) ?? null;

  const camposContexto = (accion: "omitir" | "reanudar" | "reiniciar") => (
    <>
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />
      <input name="accion" type="hidden" value={accion} />
    </>
  );

  if (pasos.length === 0) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          description="Los pasos de configuración se adaptan a tu rol."
          title="Prepara tu negocio"
        />
        <EmptyState
          action={
            <Button nativeButton={false} render={<Link href={buildAdminHref("/practica", { organizationId, sucursalId })} />} variant="outline">
              Ir a la práctica
            </Button>
          }
          description="Tu rol no incluye pasos de configuración. Si quieres conocer el sistema, puedes hacer el recorrido de práctica sin tocar datos reales."
          title="No hay pasos para tu rol"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <Button nativeButton={false} render={<Link href={buildAdminHref("/practica", { organizationId, sucursalId })} />} variant="outline">
            <FlaskConical aria-hidden="true" className="size-4" />
            Practicar primero
          </Button>
        }
        description={`${branch.nombre} · Los pasos se marcan solos según lo que ya existe en tu negocio. Puedes omitir la guía y retomarla desde Ayuda.`}
        title="Prepara tu negocio"
      />

      {omitida && !resumen.terminada ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/60 px-5 py-4">
          <p className="text-sm text-muted-foreground">
            Omitiste la guía. Puedes retomarla cuando quieras; tu avance se conserva.
          </p>
          <form action={enviarAccionGuia}>
            {camposContexto("reanudar")}
            <Button size="sm" type="submit">Reanudar guía</Button>
          </form>
        </div>
      ) : null}

      {resumen.terminada ? (
        <div className="rounded-2xl border border-success/30 bg-success-soft/30 p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <PartyPopper className="size-5 text-success" />
                <h2 className="text-lg font-semibold text-foreground">¡Todo listo para operar tu salón!</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Has completado la configuración inicial recomendada. Tu equipo ya puede recibir citas, cobrar y gestionar clientes con total tranquilidad.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href={buildAdminHref("/mi-dia", { organizationId, sucursalId })} />} size="sm">
                Ir a Mi Día
              </Button>
              <Button nativeButton={false} render={<Link href={buildAdminHref("/agenda", { organizationId, sucursalId })} />} size="sm" variant="outline">
                <Calendar className="size-4" />
                Agenda
              </Button>
              <Button nativeButton={false} render={<Link href={buildAdminHref("/pos", { organizationId, sucursalId })} />} size="sm" variant="outline">
                <CreditCard className="size-4" />
                Cobrar / Caja
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminCard>
        <div className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {resumen.completados} de {resumen.total} pasos listos
              </p>
              <p className="text-op-xs text-muted-foreground">
                Detección automática en vivo según la base de datos de tu sucursal.
              </p>
            </div>
            {resumen.terminada ? (
              <StatusBadge tone="success">Configuración completa</StatusBadge>
            ) : (
              <span className="text-op-xs font-medium text-muted-foreground">
                {Math.round((resumen.completados / resumen.total) * 100)}% completado
              </span>
            )}
          </div>
          <div
            aria-label="Progreso de la guía"
            aria-valuemax={resumen.total}
            aria-valuemin={0}
            aria-valuenow={resumen.completados}
            className="mt-3 h-2 overflow-hidden rounded-full bg-muted/60"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round((resumen.completados / resumen.total) * 100)}%` }}
            />
          </div>
        </div>

        {siguientePaso ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-op-xs font-semibold uppercase tracking-wider text-primary">
                Siguiente paso recomendado
              </p>
              <p className="text-sm font-medium text-foreground">{siguientePaso.titulo}</p>
            </div>
            <Button
              data-action-clave="1"
              data-action-id="guia.paso.ir"
              nativeButton={false}
              render={<Link href={buildAdminHref(siguientePaso.href, { organizationId, sucursalId })} />}
              size="touch"
            >
              Configurar ahora
              <ArrowRight className="ml-1 size-4" />
            </Button>
          </div>
        ) : null}

        <ol className="divide-y divide-border/60">
          {resumen.pasos.map((paso, index) => {
            const esSiguiente = !paso.hecho && resumen.pasos.slice(0, index).every((p) => p.hecho);
            return (
              <li
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 px-3 rounded-xl transition-colors ${
                  esSiguiente ? "bg-primary/5 border border-primary/20 shadow-xs" : ""
                }`}
                key={paso.clave}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
                      paso.hecho
                        ? "bg-success/10 text-success"
                        : esSiguiente
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-muted/70 text-muted-foreground"
                    }`}
                  >
                    {paso.hecho ? (
                      <CheckCircle2 className="size-5" />
                    ) : esSiguiente ? (
                      <span className="text-sm">{index + 1}</span>
                    ) : (
                      <Circle className="size-5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {index + 1}. {paso.titulo}
                      </span>
                      {esSiguiente ? <StatusBadge tone="info">Paso recomendado ahora</StatusBadge> : null}
                      {paso.opcional ? <StatusBadge tone="neutral">Opcional</StatusBadge> : null}
                      {paso.hecho && paso.detalleDetectadoTexto ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-op-xs font-medium text-success-soft-foreground">
                          <Sparkles className="size-3" />
                          {paso.detalleDetectadoTexto}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{paso.descripcion}</p>
                    {!paso.hecho && paso.detalleDetectadoTexto ? (
                      <p className="text-op-xs font-medium text-muted-foreground/80">
                        Progreso actual: {paso.detalleDetectadoTexto}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-end shrink-0 pl-12 sm:pl-0">
                  <Button
                    data-action-id={esSiguiente ? "guia.paso.ir" : undefined}
                    nativeButton={false}
                    render={<Link href={buildAdminHref(paso.href, { organizationId, sucursalId })} />}
                    size={esSiguiente ? "touch" : "sm"}
                    variant={paso.hecho ? "ghost" : esSiguiente ? "default" : "outline"}
                  >
                    {paso.hecho ? (
                      "Revisar"
                    ) : esSiguiente ? (
                      <>
                        Configurar ahora
                        <ArrowRight className="size-4 ml-1" />
                      </>
                    ) : (
                      "Configurar"
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </AdminCard>

      <div className="flex flex-wrap items-center gap-3">
        {resumen.terminada || omitida ? (
          <form action={enviarAccionGuia}>
            {camposContexto("reiniciar")}
            <Button type="submit" variant="outline">Reiniciar guía</Button>
          </form>
        ) : (
          <form action={enviarAccionGuia}>
            {camposContexto("omitir")}
            <Button type="submit" variant="ghost">Omitir por ahora</Button>
          </form>
        )}
        <Link
          className="inline-flex min-h-6 items-center text-sm font-medium text-primary hover:underline"
          href={buildAdminHref("/ayuda", { organizationId, sucursalId })}
        >
          Ir a Ayuda
        </Link>
      </div>
    </div>
  );
}
