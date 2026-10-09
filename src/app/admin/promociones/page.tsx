import { and, desc, eq, ilike } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { togglePromotion } from "@/app/admin/promociones/actions";
import { PromotionForm } from "@/app/admin/promociones/promotion-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminNavTabs, CATALOGO_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { promociones } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { PlanUpgradeNotice } from "@/components/plan-gate";
import { contextoSuscripcionCache as contextoSuscripcion } from "@/modules/billing/queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const TIPO_LABEL: Record<string, string> = { porcentaje: "Porcentaje", monto: "Monto fijo", "2x1": "2x1", paquete: "Paquete" };
const APLICA_LABEL: Record<string, string> = { producto: "Productos", servicio: "Servicios", ambos: "Ambos" };

export default async function PromotionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const suscripcion = await contextoSuscripcion(organizationId);
  if (!suscripcion.capacidades.has("promociones")) {
    return (
      <PlanUpgradeNotice
        capacidad="promociones"
        planNombre={suscripcion.plan?.nombre}
        suscripcionHref={buildAdminHref("/suscripcion", { organizationId })}
      />
    );
  }
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const tipo = firstParam(params.tipo) ?? "";
  const estado = firstParam(params.estado) ?? "";

  const filters = [eq(promociones.organizacionId, organizationId)];
  if (query) filters.push(ilike(promociones.nombre, `%${query}%`));
  if (tipo === "porcentaje" || tipo === "monto" || tipo === "2x1" || tipo === "paquete") filters.push(eq(promociones.tipo, tipo));
  if (estado === "activo") filters.push(eq(promociones.activo, true));
  if (estado === "oculto") filters.push(eq(promociones.activo, false));

  const promotionRows = await db
    .select({ id: promociones.id, clave: promociones.clave, nombre: promociones.nombre, tipo: promociones.tipo, valor: promociones.valor, aplica: promociones.aplica, vigenciaDesde: promociones.vigenciaDesde, vigenciaHasta: promociones.vigenciaHasta, activo: promociones.activo })
    .from(promociones)
    .where(and(...filters))
    .orderBy(desc(promociones.createdAt))
    .limit(100);

  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db.select().from(promociones).where(and(eq(promociones.id, editId), eq(promociones.organizacionId, organizationId))).limit(1))[0]
    : undefined;
  const editingData = editing
    ? {
        id: editing.id,
        organizacionId: editing.organizacionId,
        clave: editing.clave,
        nombre: editing.nombre,
        descripcion: editing.descripcion,
        tipo: editing.tipo,
        valor: editing.valor,
        aplica: editing.aplica,
        vigenciaDesde: editing.vigenciaDesde,
        vigenciaHasta: editing.vigenciaHasta,
      }
    : undefined;

  const hasFilters = Boolean(query || tipo || estado);
  const preserved = { q: query || null, tipo: tipo || null, estado: estado || null };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Descuentos y promociones aplicables en el punto de venta."
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            tabs={CATALOGO_TABS}
          />
        }
        title="Promociones"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="min-w-52 flex-1">
          <FieldLabel>Buscar</FieldLabel>
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre de la promoción" />
        </Field>
        <Field className="w-44">
          <FieldLabel>Tipo</FieldLabel>
          <Select defaultValue={tipo} name="tipo">
            <option value="">Todos</option>
            <option value="porcentaje">Porcentaje</option>
            <option value="monto">Monto fijo</option>
            <option value="2x1">2x1</option>
            <option value="paquete">Paquete</option>
          </Select>
        </Field>
        <Field className="w-40">
          <FieldLabel>Estado</FieldLabel>
          <Select defaultValue={estado} name="estado">
            <option value="">Todos</option>
            <option value="activo">Activas</option>
            <option value="oculto">Ocultas</option>
          </Select>
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
        {hasFilters ? (
          <Button nativeButton={false} render={<Link href={buildAdminHref("/promociones", { organizationId })} />} variant="outline">
            Limpiar
          </Button>
        ) : null}
      </form>

      <AdminCard
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="catalogo.promociones.nueva"
            nativeButton={false}
            render={<Link href={buildAdminHref("/promociones", { organizationId, extra: { ...preserved, nuevo: "1" } })} />}
          >
            Nueva
          </Button>
        }
        description={`${promotionRows.length} resultado(s)`}
        title="Promociones registradas"
      >
        {promotionRows.length === 0 ? (
          <EmptyState description="Crea descuentos, promociones 2x1 o paquetes para tus productos y servicios." title="No hay promociones" />
        ) : (
          <>
            <RegistroList>
              {promotionRows.map((promo) => (
                <RegistroCard
                  acciones={
                    <div className="flex flex-wrap gap-2">
                      <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" href={buildAdminHref("/promociones", { organizationId, extra: { ...preserved, edit: promo.id } })}>Editar</Link>
                      <form action={togglePromotion}>
                        <input name="organizacionId" type="hidden" value={organizationId} />
                        <input name="id" type="hidden" value={promo.id} />
                        <input name="activo" type="hidden" value={String(promo.activo)} />
                        <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" type="submit">{promo.activo ? "Ocultar" : "Activar"}</button>
                      </form>
                    </div>
                  }
                  badge={<StatusBadge active={promo.activo} />}
                  campos={[
                    { label: "Tipo", value: TIPO_LABEL[promo.tipo] ?? promo.tipo },
                    {
                      label: "Valor",
                      value: promo.tipo === "porcentaje" ? `${promo.valor}%` : promo.tipo === "2x1" ? "—" : formatCurrency(promo.valor, { currency: context.currency }),
                    },
                    { label: "Aplica", value: APLICA_LABEL[promo.aplica] ?? promo.aplica },
                    { label: "Vigencia", value: `${promo.vigenciaDesde}${promo.vigenciaHasta ? ` → ${promo.vigenciaHasta}` : " → ∞"}` },
                  ]}
                  key={promo.id}
                  subtitulo={<span className="font-mono">{promo.clave}</span>}
                  titulo={promo.nombre}
                />
              ))}
            </RegistroList>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Valor</th>
                    <th className="py-2 pr-4 font-medium">Aplica</th>
                    <th className="py-2 pr-4 font-medium">Vigencia</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {promotionRows.map((promo) => (
                    <tr className="border-b border-border" key={promo.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{promo.clave}</td>
                      <td className="py-3 pr-4 font-medium">{promo.nombre}</td>
                      <td className="py-3 pr-4"><span className="rounded-full bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground">{TIPO_LABEL[promo.tipo] ?? promo.tipo}</span></td>
                      <td className="py-3 pr-4 tabular-nums">
                        {promo.tipo === "porcentaje" ? `${promo.valor}%` : promo.tipo === "2x1" ? "—" : formatCurrency(promo.valor, { currency: context.currency })}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{APLICA_LABEL[promo.aplica] ?? promo.aplica}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{promo.vigenciaDesde}{promo.vigenciaHasta ? ` → ${promo.vigenciaHasta}` : " → ∞"}</td>
                      <td className="py-3 pr-4"><StatusBadge active={promo.activo} /></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" href={buildAdminHref("/promociones", { organizationId, extra: { ...preserved, edit: promo.id } })}>Editar</Link>
                          <form action={togglePromotion}>
                            <input name="organizacionId" type="hidden" value={organizationId} />
                            <input name="id" type="hidden" value={promo.id} />
                            <input name="activo" type="hidden" value={String(promo.activo)} />
                            <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" type="submit">{promo.activo ? "Ocultar" : "Activar"}</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AdminCard>
      {editing || firstParam(params.nuevo) === "1" ? (
        <FormSheet
          closeHref={buildAdminHref("/promociones", { organizationId, extra: preserved })}
          description={editing ? "Ajusta los datos de la promoción." : "Crea un descuento o promoción."}
          title={editing ? "Editar promoción" : "Nueva promoción"}
          wide
        >
          <PromotionForm initial={editingData} key={`${editing?.id ?? "nueva"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        </FormSheet>
      ) : null}
    </div>
  );
}
