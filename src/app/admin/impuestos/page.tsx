import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleTax } from "@/app/admin/impuestos/actions";
import { TaxForm } from "@/app/admin/impuestos/tax-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { VistaAdaptativa } from "@/components/admin/vista-adaptativa";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { catImpuestos } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const TIPO_LABEL: Record<string, string> = { agregado: "Agregado", incluido: "Incluido", exento: "Exento" };

export default async function TaxesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  // Una sola consulta: la fila en edición se resuelve del listado ya cargado.
  const taxes = await db
    .select({ id: catImpuestos.id, clave: catImpuestos.clave, nombre: catImpuestos.nombre, tasa: catImpuestos.tasa, tipo: catImpuestos.tipo, activo: catImpuestos.activo, updatedAt: catImpuestos.updatedAt })
    .from(catImpuestos)
    .where(eq(catImpuestos.organizacionId, organizationId))
    .orderBy(catImpuestos.nombre);
  const editId = firstParam(params.edit);
  const editing = editId ? taxes.find((row) => row.id === editId) : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader description="Tasas aplicables a ventas y servicios." title="Impuestos" />
      <AdminCard
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="catalogo.impuestos.nuevo"
            nativeButton={false}
            render={<Link href={buildAdminHref("/impuestos", { organizationId, extra: { nuevo: "1" } })} />}
          >
            Nuevo
          </Button>
        }
        description={`${taxes.length} resultado(s)`}
        title="Impuestos registrados"
      >
        {taxes.length === 0 ? (
          <EmptyState description="Crea impuestos como IVA (16%) o IEPS para aplicarlos en el POS." title="No hay impuestos" />
        ) : (
          <VistaAdaptativa>
            <RegistroList>
              {taxes.map((tax) => (
                <RegistroCard
                  acciones={
                    <div className="flex flex-wrap gap-2">
                      <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" href={buildAdminHref("/impuestos", { organizationId, extra: { edit: tax.id } })}>Editar</Link>
                      <form action={toggleTax}>
                        <input name="organizacionId" type="hidden" value={organizationId} />
                        <input name="id" type="hidden" value={tax.id} />
                        <input name="activo" type="hidden" value={String(tax.activo)} />
                        <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" type="submit">{tax.activo ? "Ocultar" : "Activar"}</button>
                      </form>
                    </div>
                  }
                  badge={<StatusBadge active={tax.activo} />}
                  campos={[
                    { label: "Tasa", value: `${tax.tasa}%` },
                    {
                      label: "Tipo",
                      value: <span className="rounded-full bg-muted/60 px-2.5 py-1 text-op-xs text-muted-foreground">{TIPO_LABEL[tax.tipo] ?? tax.tipo}</span>,
                    },
                  ]}
                  key={tax.id}
                  subtitulo={<span className="font-mono">{tax.clave}</span>}
                  titulo={tax.nombre}
                />
              ))}
            </RegistroList>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-op-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Tasa</th>
                    <th className="py-2 pr-4 font-medium">Tipo</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {taxes.map((tax) => (
                    <tr className="border-b border-border" key={tax.id}>
                      <td className="py-3 pr-4 font-mono text-op-xs">{tax.clave}</td>
                      <td className="py-3 pr-4 font-medium">{tax.nombre}</td>
                      <td className="py-3 pr-4 tabular-nums">{tax.tasa}%</td>
                      <td className="py-3 pr-4"><span className="rounded-full bg-muted/60 px-2.5 py-1 text-op-xs text-muted-foreground">{TIPO_LABEL[tax.tipo] ?? tax.tipo}</span></td>
                      <td className="py-3 pr-4"><StatusBadge active={tax.activo} /></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" href={buildAdminHref("/impuestos", { organizationId, extra: { edit: tax.id } })}>Editar</Link>
                          <form action={toggleTax}>
                            <input name="organizacionId" type="hidden" value={organizationId} />
                            <input name="id" type="hidden" value={tax.id} />
                            <input name="activo" type="hidden" value={String(tax.activo)} />
                            <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" type="submit">{tax.activo ? "Ocultar" : "Activar"}</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </VistaAdaptativa>
        )}
      </AdminCard>
      {editing || firstParam(params.nuevo) === "1" ? (
        <FormSheet
          closeHref={buildAdminHref("/impuestos", { organizationId })}
          description={editing ? "Ajusta los datos del impuesto." : "Crea un impuesto para aplicar en el POS."}
          title={editing ? "Editar impuesto" : "Nuevo impuesto"}
        >
          <TaxForm initial={editing} key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        </FormSheet>
      ) : null}
    </div>
  );
}
