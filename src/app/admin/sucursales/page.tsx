import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SucursalAsignacionForm } from "@/app/admin/sucursales/asignacion-form";
import { SucursalEditarForm, SucursalNuevaForm } from "@/app/admin/sucursales/sucursal-form";
import { SucursalToggleForm } from "@/app/admin/sucursales/toggle-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { planes } from "@/db/schema/billing";
import { miembrosOrganizaciones, relUsuariosSucursales, sucursales, usuarios } from "@/db/schema/core";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission } from "@/lib/auth/authorization";
import { formatCurrency } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { contextoSuscripcionCache, getSuscripcionActualCache } from "@/modules/billing/queries";
import { motivoBloqueoSucursal, puedeCrearOtraSucursal } from "@/modules/sucursales/rules";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<AdminSearchParams> };

/** Gestión de sucursales: alta, edición, políticas y asignación de miembros. */
export default async function SucursalesPage({ searchParams }: Props) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, currency } = context;
  if (!organization) notFound();
  if (!hasPermission(context.access, "sucursales.ver")) notFound();

  const puedeEditar = hasPermission(context.access, "sucursales.editar") && !context.access.soloLectura;
  const db = getDatabase();

  const [lista, miembros, asignaciones, ctx] = await Promise.all([
    db
      .select()
      .from(sucursales)
      .where(eq(sucursales.organizacionId, organization.id))
      .orderBy(asc(sucursales.nombre)),
    db
      .select({
        usuarioId: usuarios.id,
        nombre: usuarios.nombre,
        correo: usuarios.correo,
      })
      .from(miembrosOrganizaciones)
      .innerJoin(usuarios, eq(miembrosOrganizaciones.usuarioId, usuarios.id))
      .where(
        and(
          eq(miembrosOrganizaciones.organizacionId, organization.id),
          eq(miembrosOrganizaciones.estado, "activo"),
        ),
      )
      .orderBy(asc(usuarios.nombre)),
    db
      .select({
        usuarioId: relUsuariosSucursales.usuarioId,
        sucursalId: relUsuariosSucursales.sucursalId,
      })
      .from(relUsuariosSucursales)
      .where(eq(relUsuariosSucursales.organizacionId, organization.id)),
    contextoSuscripcionCache(organization.id),
  ]);

  const [planRow] = ctx.plan?.clave
    ? await db
        .select({
          precioMensual: planes.precioMensual,
          precioAnual: planes.precioAnual,
          sucursalesIncluidas: planes.sucursalesIncluidas,
          precioSucursalExtra: planes.precioSucursalExtra,
        })
        .from(planes)
        .where(eq(planes.clave, ctx.plan.clave))
        .limit(1)
    : [];

  const activas = lista.filter((row) => row.activo).length;
  const maxSucursales = ctx.plan?.maxSucursales ?? null;
  const suscripcion = ctx.plan ? await getSuscripcionActualCache(organization.id) : null;
  const cubiertas = suscripcion?.sucursalesFacturadas ?? null;
  const capacidad = { activas, maxSucursales, cubiertas };
  const puedeCrearOtra = puedeEditar && puedeCrearOtraSucursal(capacidad);
  const asignacionesPorSucursal = new Map<string, Set<string>>();
  const usuariosConAsignacion = new Set<string>();
  for (const row of asignaciones) {
    usuariosConAsignacion.add(row.usuarioId);
    const set = asignacionesPorSucursal.get(row.sucursalId) ?? new Set<string>();
    set.add(row.usuarioId);
    asignacionesPorSucursal.set(row.sucursalId, set);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          puedeCrearOtra ? (
            <Button
              data-action-clave="1"
              data-action-id="sucursales.sucursal.abrir_formulario"
              nativeButton={false}
              render={<Link href={buildAdminHref("/sucursales", { organizationId: organization.id, extra: { nuevo: "sucursal" } })} />}
              size="lg"
            >
              Nueva sucursal
            </Button>
          ) : undefined
        }
        description={`${organization.nombre} · ${activas} sucursal(es) activa(s)`}
        title="Sucursales"
      />

      <AdminCard
        description="Tu plan incluye sucursales en el precio base y cada adicional tiene su costo. Desactivar conserva todo el historial."
        title="Cobertura del plan"
      >
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Plan</dt>
            <dd className="mt-0.5 font-semibold text-foreground">{ctx.plan?.nombre ?? "Sin suscripción"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Sucursales activas</dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {activas}
              {maxSucursales != null ? ` de ${maxSucursales} permitidas` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Cobertura facturada</dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {cubiertas != null ? `${cubiertas} sucursal(es)` : "—"}
            </dd>
          </div>
        </dl>
        {planRow ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Tu plan: {formatCurrency(Number(planRow.precioMensual), { currency })} MXN/mes incluye{" "}
            {planRow.sucursalesIncluidas} sucursal(es)
            {planRow.precioSucursalExtra
              ? ` · ${formatCurrency(Number(planRow.precioSucursalExtra), { currency })} MXN/mes por adicional`
              : ""}
            {planRow.precioAnual ? ` · anual ${formatCurrency(Number(planRow.precioAnual), { currency })} MXN` : ""}.
          </p>
        ) : null}
        {maxSucursales != null && activas >= maxSucursales && ctx.efectivo === "vigente" ? (
          <p className="mt-4 rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            Tu plan permite hasta {maxSucursales} sucursal(es).{" "}
            <Link className="font-medium text-primary underline" href={`/admin/suscripcion?organizationId=${organization.id}`}>
              Cambia a Profesional
            </Link>{" "}
            para más sucursales y reportes consolidados.
          </p>
        ) : null}
        {cubiertas != null && activas >= cubiertas ? (
          <p className="mt-3 rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
            Ya usas las {cubiertas} sucursal(es) cubiertas por tu suscripción. Para activar o crear otra,
            solicita ampliar la cobertura en{" "}
            <Link className="font-medium text-primary underline" href={`/admin/suscripcion?organizationId=${organization.id}`}>
              Suscripción
            </Link>
            .
          </p>
        ) : null}
      </AdminCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {lista.map((sucursal) => (
            <AdminCard
              actions={<SucursalToggleForm activo={sucursal.activo} organizationId={organization.id} sucursalId={sucursal.id} />}
              description={`${sucursal.clave} · ${sucursal.zonaHoraria ?? "zona de la organización"}${sucursal.direccion ? ` · ${sucursal.direccion}` : ""}`}
              key={sucursal.id}
              title={`${sucursal.nombre}${sucursal.activo ? "" : " (inactiva)"}`}
            >
              {puedeEditar ? (
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-primary select-none">
                    Editar datos y políticas
                  </summary>
                  <div className="mt-4">
                    <SucursalEditarForm organizationId={organization.id} sucursal={sucursal} />
                  </div>
                </details>
              ) : null}
              {puedeEditar ? (
                <details className="group mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-primary select-none">
                    Miembros con acceso ({asignacionesPorSucursal.get(sucursal.id)?.size ?? 0})
                  </summary>
                  <div className="mt-4">
                    <SucursalAsignacionForm
                      miembros={miembros.map((miembro) => ({
                        usuarioId: miembro.usuarioId,
                        nombre: miembro.nombre,
                        correo: miembro.correo,
                        asignado: asignacionesPorSucursal.get(sucursal.id)?.has(miembro.usuarioId) ?? false,
                        sinRestriccion: !usuariosConAsignacion.has(miembro.usuarioId),
                      }))}
                      organizationId={organization.id}
                      sucursalId={sucursal.id}
                    />
                  </div>
                </details>
              ) : null}
            </AdminCard>
          ))}
        </div>

        {puedeEditar && !puedeCrearOtra ? (
          <AdminCard
            description="Tu plan actual no permite más sucursales activas."
            title="Nueva sucursal"
          >
            <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              {motivoBloqueoSucursal(capacidad)}{" "}
              <Link className="font-medium text-primary underline" href={`/admin/suscripcion?organizationId=${organization.id}`}>
                Revisar suscripción
              </Link>
            </p>
          </AdminCard>
        ) : null}
      </div>

      {puedeCrearOtra && firstParam(params.nuevo) === "sucursal" ? (
        <FormSheet
          closeHref={buildAdminHref("/sucursales", { organizationId: organization.id })}
          description="Datos básicos de la nueva sucursal; las políticas se editan después."
          title="Nueva sucursal"
        >
          <SucursalNuevaForm organizationId={organization.id} />
        </FormSheet>
      ) : null}
    </div>
  );
}
