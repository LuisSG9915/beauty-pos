import { CheckCircle2, Circle, FlaskConical } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { buildAdminHref } from "@/lib/url-context";
import { cargarEstadoNegocio, cargarProgresoGuia } from "@/modules/onboarding/queries";
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
  const [estado, progreso] = await Promise.all([
    cargarEstadoNegocio(db, organizationId, sucursalId),
    cargarProgresoGuia(db, organizationId, user.id),
  ]);
  const resumen = resumenGuia(evaluarPasos(pasos, estado));
  const omitida = progreso?.estado === "omitida";

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

      <AdminCard>
        <div className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-foreground">
              {resumen.completados} de {resumen.total} pasos listos
            </p>
            {resumen.terminada ? <StatusBadge tone="success">Configuración completa</StatusBadge> : null}
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

        <ol className="divide-y divide-border">
          {resumen.pasos.map((paso, index) => (
            <li className="flex items-center gap-4 py-4 first:pt-0 last:pb-0" key={paso.clave}>
              <span
                aria-hidden="true"
                className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                  paso.hecho ? "bg-[#d4efe9] text-success" : "bg-muted/60 text-muted-foreground"
                }`}
              >
                {paso.hecho ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                  {index + 1}. {paso.titulo}
                  {paso.opcional ? <StatusBadge tone="neutral">Opcional</StatusBadge> : null}
                </p>
                <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{paso.descripcion}</p>
              </div>
              <Button
                nativeButton={false}
                render={<Link href={buildAdminHref(paso.href, { organizationId, sucursalId })} />}
                size="sm"
                variant={paso.hecho ? "ghost" : "outline"}
              >
                {paso.hecho ? "Ver" : "Ir"}
              </Button>
            </li>
          ))}
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
          className="text-sm font-medium text-primary hover:underline"
          href={buildAdminHref("/ayuda", { organizationId, sucursalId })}
        >
          Ir a Ayuda
        </Link>
      </div>
    </div>
  );
}
