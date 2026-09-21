import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { togglePaymentMethod } from "@/app/admin/medios-pago/actions";
import { PaymentMethodForm } from "@/app/admin/medios-pago/payment-method-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const CATEGORIA_LABEL: Record<string, string> = { efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", wallet: "Wallet", otro: "Otro" };
const CATEGORIA_COLOR: Record<string, string> = {
  efectivo: "bg-success/10 text-success",
  tarjeta: "bg-accent/70 text-primary",
  transferencia: "bg-info/10 text-info",
  wallet: "bg-warning/10 text-warning",
  otro: "bg-muted/60 text-muted-foreground",
};

export default async function PaymentMethodsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const categoriaFilter = firstParam(params.categoria) ?? "";
  const filters = [eq(catMediosPago.organizacionId, organizationId)];
  if (categoriaFilter === "efectivo" || categoriaFilter === "tarjeta" || categoriaFilter === "transferencia" || categoriaFilter === "wallet" || categoriaFilter === "otro") {
    filters.push(eq(catMediosPago.categoria, categoriaFilter));
  }

  const methods = await db
    .select({ id: catMediosPago.id, clave: catMediosPago.clave, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria, activo: catMediosPago.activo })
    .from(catMediosPago)
    .where(and(...filters))
    .orderBy(asc(catMediosPago.nombre));
  const editId = firstParam(params.edit);
  const editing = editId
    ? (await db.select({ id: catMediosPago.id, clave: catMediosPago.clave, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria, updatedAt: catMediosPago.updatedAt }).from(catMediosPago).where(and(eq(catMediosPago.id, editId), eq(catMediosPago.organizacionId, organizationId))).limit(1))[0]
    : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader description="Medios disponibles al cobrar en el POS." title="Medios de pago" />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="w-56">
          <FieldLabel>Categoría</FieldLabel>
          <Select defaultValue={categoriaFilter} name="categoria">
            <option value="">Todas</option>
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="wallet">Wallet</option>
            <option value="otro">Otro</option>
          </Select>
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
        {categoriaFilter ? (
          <Button nativeButton={false} render={<Link href={buildAdminHref("/medios-pago", { organizationId })} />} variant="outline">
            Limpiar
          </Button>
        ) : null}
      </form>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <PaymentMethodForm initial={editing} key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        <AdminCard
          actions={
            <Button nativeButton={false} render={<Link href={buildAdminHref("/medios-pago", { organizationId })} />}>
              Nuevo
            </Button>
          }
          className="self-start"
          description={`${methods.length} resultado(s)`}
          title="Medios registrados"
        >
          {methods.length === 0 ? (
            <EmptyState description="Crea medios de pago como efectivo, tarjeta o transferencia para Cobrar." title="No hay medios de pago" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Clave</th>
                    <th className="py-2 pr-4 font-medium">Nombre</th>
                    <th className="py-2 pr-4 font-medium">Categoría</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.map((method) => (
                    <tr className="border-b border-border" key={method.id}>
                      <td className="py-3 pr-4 font-mono text-xs">{method.clave}</td>
                      <td className="py-3 pr-4 font-medium">{method.nombre}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${CATEGORIA_COLOR[method.categoria] ?? CATEGORIA_COLOR.otro}`}>
                          {CATEGORIA_LABEL[method.categoria] ?? method.categoria}
                        </span>
                      </td>
                      <td className="py-3 pr-4"><StatusBadge active={method.activo} /></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" href={buildAdminHref("/medios-pago", { organizationId, extra: { edit: method.id } })}>Editar</Link>
                          <form action={togglePaymentMethod}>
                            <input name="organizacionId" type="hidden" value={organizationId} />
                            <input name="id" type="hidden" value={method.id} />
                            <input name="activo" type="hidden" value={String(method.activo)} />
                            <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60" type="submit">{method.activo ? "Ocultar" : "Activar"}</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
