import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SucursalAsignacionForm, type MiembroAsignable } from "@/app/admin/sucursales/asignacion-form";
import { SucursalEditarForm, SucursalNuevaForm } from "@/app/admin/sucursales/sucursal-form";
import { SucursalToggle } from "@/app/admin/sucursales/toggle-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminNavTabs, EQUIPO_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminPageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/status-badge";
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

/**
 * Sucursales del negocio: una tarjeta por sucursal con sus datos esenciales,
 * el equipo que la ve y la activación. La cobertura del plan queda compacta
 * al final. Edición y equipo se abren en `FormSheet` vía `?editar`/`?equipo`.
 */
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

  // Equipo por sucursal: personas asignadas explícitamente + las que no tienen
  // ninguna asignación (regla "sin asignación = ve todas"). Solo cuentan los
  // miembros activos de la organización.
  const miembrosActivos = new Set(miembros.map((miembro) => miembro.usuarioId));
  const asignacionesPorSucursal = new Map<string, Set<string>>();
  const usuariosConAsignacion = new Set<string>();
  for (const row of asignaciones) {
    if (!miembrosActivos.has(row.usuarioId)) continue;
    usuariosConAsignacion.add(row.usuarioId);
    const set = asignacionesPorSucursal.get(row.sucursalId) ?? new Set<string>();
    set.add(row.usuarioId);
    asignacionesPorSucursal.set(row.sucursalId, set);
  }
  const sinRestriccion = miembros.length - usuariosConAsignacion.size;

  const equipoLabel = (sucursalId: string) => {
    const personas = (asignacionesPorSucursal.get(sucursalId)?.size ?? 0) + sinRestriccion;
    if (miembros.length === 0 || personas === 0) return "Sin equipo";
    return personas >= miembros.length ? "Todo el equipo" : `${personas} ${personas === 1 ? "persona" : "personas"}`;
  };

  // Panel "Equipo": la misma lista por persona que en Usuarios. Sucursales
  // asignables = activas dentro del alcance del editor (`context.branches`);
  // las asignadas fuera de su alcance se muestran como etiqueta fija.
  const idsActivas = new Set(lista.filter((row) => row.activo).map((row) => row.id));
  const idsAsignables = new Set(context.branches.map((branch) => branch.id));
  const nombresSucursal = new Map(lista.map((row) => [row.id, row.nombre]));
  const sucursalesAsignables = context.branches.map((branch) => ({ id: branch.id, nombre: branch.nombre }));
  const miembrosEquipo: MiembroAsignable[] = miembros.map((miembro) => {
    const asignadas = asignaciones
      .filter((row) => row.usuarioId === miembro.usuarioId && idsActivas.has(row.sucursalId))
      .map((row) => row.sucursalId);
    return {
      usuarioId: miembro.usuarioId,
      nombre: miembro.nombre,
      correo: miembro.correo,
      sucursalIds: asignadas,
      fueraDeAlcance: asignadas
        .filter((sucursalId) => !idsAsignables.has(sucursalId))
        .map((sucursalId) => nombresSucursal.get(sucursalId) ?? "Sucursal"),
    };
  });

  const baseHref = buildAdminHref("/sucursales", { organizationId: organization.id });
  const editando = lista.find((row) => row.id === firstParam(params.editar)) ?? null;
  const equipando = lista.find((row) => row.id === firstParam(params.equipo)) ?? null;
  const suscripcionHref = `/admin/suscripcion?organizationId=${organization.id}`;

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
          ) : puedeEditar && ctx.plan ? (
            <Button
              data-action-clave="1"
              data-action-id="sucursales.plan.ampliar"
              nativeButton={false}
              render={<Link href={suscripcionHref} />}
              size="lg"
              variant="outline"
            >
              Ampliar plan
            </Button>
          ) : undefined
        }
        description="Datos de contacto, equipo y activación de cada sucursal. Desactivar conserva todo el historial."
        tabs={
          <AdminNavTabs
            organizationId={organization.id}
            tabs={EQUIPO_TABS}
          />
        }
        title="Sucursales"
      />

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Aún no hay sucursales. Crea la primera con el botón «Nueva sucursal».
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {lista.map((sucursal) => (
            <section
              className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
              key={sucursal.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-foreground">{sucursal.nombre}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {sucursal.direccion || "Sin dirección registrada"}
                    {sucursal.telefono ? ` · ${sucursal.telefono}` : ""}
                  </p>
                </div>
                {puedeEditar ? (
                  <SucursalToggle
                    activo={sucursal.activo}
                    nombre={sucursal.nombre}
                    organizationId={organization.id}
                    sucursalId={sucursal.id}
                  />
                ) : (
                  <StatusBadge active={sucursal.activo} activeLabel="Activa" inactiveLabel="Inactiva" />
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-op-xs font-medium text-muted-foreground">
                  {equipoLabel(sucursal.id)}
                </span>
                <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-op-xs font-medium text-muted-foreground">
                  Reservas en línea: {sucursal.reservasOnline ? "sí" : "no"}
                </span>
                {puedeEditar ? (
                  <StatusBadge active={sucursal.activo} activeLabel="Activa" inactiveLabel="Inactiva" />
                ) : null}
              </div>

              {puedeEditar ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  <Link
                    className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    data-action-id="sucursales.sucursal.abrir_edicion"
                    href={buildAdminHref("/sucursales", { organizationId: organization.id, extra: { editar: sucursal.id } })}
                  >
                    Editar
                  </Link>
                  <Link
                    className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    data-action-id="sucursales.sucursal.abrir_equipo"
                    href={buildAdminHref("/sucursales", { organizationId: organization.id, extra: { equipo: sucursal.id } })}
                  >
                    Equipo
                  </Link>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}

      {/* Cobertura del plan: compacta, al final; el detalle de precios queda
          bajo revelado progresivo. */}
      <section className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <p>
          Usas {activas} de {maxSucursales ?? "—"} sucursal(es) de tu plan
          {ctx.plan?.nombre ? ` (${ctx.plan.nombre})` : ""}
          {cubiertas != null ? ` · ${cubiertas} cubierta(s) por tu suscripción` : ""}.{" "}
          <Link
            className="inline-flex min-h-6 items-center font-medium text-primary hover:underline"
            href={suscripcionHref}
          >
            Ver suscripción
          </Link>
        </p>
        {planRow ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-primary">
              Detalle del plan
            </summary>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatCurrency(Number(planRow.precioMensual), { currency })} MXN/mes incluye{" "}
              {planRow.sucursalesIncluidas} sucursal(es)
              {planRow.precioSucursalExtra
                ? ` · ${formatCurrency(Number(planRow.precioSucursalExtra), { currency })} MXN/mes por adicional`
                : ""}
              {planRow.precioAnual ? ` · anual ${formatCurrency(Number(planRow.precioAnual), { currency })} MXN` : ""}.
            </p>
          </details>
        ) : null}
        {maxSucursales != null && activas >= maxSucursales && ctx.efectivo === "vigente" ? (
          <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            {motivoBloqueoSucursal(capacidad)}{" "}
            <Link
              className="inline-flex min-h-6 items-center font-medium text-primary hover:underline"
              href={suscripcionHref}
            >
              Cambia de plan
            </Link>{" "}
            para más sucursales y reportes consolidados.
          </p>
        ) : null}
        {cubiertas != null && activas >= cubiertas ? (
          <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
            Ya usas las {cubiertas} sucursal(es) cubiertas por tu suscripción. Para activar o crear otra,
            solicita ampliar la cobertura en{" "}
            <Link
              className="inline-flex min-h-6 items-center font-medium text-primary hover:underline"
              href={suscripcionHref}
            >
              Suscripción
            </Link>
            .
          </p>
        ) : null}
      </section>

      {puedeCrearOtra && firstParam(params.nuevo) === "sucursal" ? (
        <FormSheet
          closeHref={baseHref}
          description="Solo hacen falta el nombre, la dirección y el teléfono; el resto se configura después."
          title="Nueva sucursal"
        >
          <SucursalNuevaForm organizationId={organization.id} zonaHorariaDefault={organization.zonaHoraria} />
        </FormSheet>
      ) : null}

      {puedeEditar && editando ? (
        <FormSheet
          closeHref={baseHref}
          description="Datos de la sucursal y configuración avanzada."
          title={`Editar ${editando.nombre}`}
          wide
        >
          <SucursalEditarForm organizationId={organization.id} sucursal={editando} />
        </FormSheet>
      ) : null}

      {puedeEditar && equipando ? (
        <FormSheet
          closeHref={baseHref}
          description="Quién trabaja en esta sucursal y quién ve todas."
          title={`Equipo de ${equipando.nombre}`}
          wide
        >
          <SucursalAsignacionForm
            editorUsuarioId={context.user.id}
            miembros={miembrosEquipo}
            organizationId={organization.id}
            sucursalId={equipando.id}
            sucursales={sucursalesAsignables}
          />
        </FormSheet>
      ) : null}
    </div>
  );
}
