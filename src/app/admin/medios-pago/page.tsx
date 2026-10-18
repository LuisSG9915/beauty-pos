import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { togglePaymentMethod } from "@/app/admin/medios-pago/actions";
import { PaymentMethodForm } from "@/app/admin/medios-pago/payment-method-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { VistaAdaptativa } from "@/components/admin/vista-adaptativa";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
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
  efectivo: "bg-success-soft text-success-soft-foreground",
  tarjeta: "bg-accent text-accent-foreground",
  transferencia: "bg-info-soft text-info-soft-foreground",
  wallet: "bg-warning-soft text-warning-soft-foreground",
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
  const categoriaValida =
    categoriaFilter === "efectivo" || categoriaFilter === "tarjeta" || categoriaFilter === "transferencia" || categoriaFilter === "wallet" || categoriaFilter === "otro"
      ? categoriaFilter
      : "";

  // Una sola consulta: el filtro por categoría y la fila en edición se
  // resuelven en memoria sobre el catálogo ya cargado.
  const todos = await db
    .select({ id: catMediosPago.id, clave: catMediosPago.clave, nombre: catMediosPago.nombre, categoria: catMediosPago.categoria, activo: catMediosPago.activo, updatedAt: catMediosPago.updatedAt })
    .from(catMediosPago)
    .where(eq(catMediosPago.organizacionId, organizationId))
    .orderBy(catMediosPago.nombre);
  const methods = categoriaValida ? todos.filter((m) => m.categoria === categoriaValida) : todos;
  const editId = firstParam(params.edit);
  const editing = editId ? todos.find((row) => row.id === editId) : undefined;

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

      <AdminCard
        actions={
          <Button
            data-action-clave="1" size="lg"
            data-action-id="catalogo.medios_pago.nuevo"
            nativeButton={false}
            render={<Link href={buildAdminHref("/medios-pago", { organizationId, extra: { nuevo: "1", categoria: categoriaFilter || null } })} />}
          >
            Nuevo
          </Button>
        }
        description={`${methods.length} resultado(s)`}
        title="Medios registrados"
      >
        {methods.length === 0 ? (
          <EmptyState description="Crea medios de pago como efectivo, tarjeta o transferencia para Cobrar." title="No hay medios de pago" />
        ) : (
          <VistaAdaptativa>
            <RegistroList>
              {methods.map((method) => (
                <RegistroCard
                  acciones={
                    <div className="flex flex-wrap gap-2">
                      <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" href={buildAdminHref("/medios-pago", { organizationId, extra: { edit: method.id, categoria: categoriaFilter || null } })}>Editar</Link>
                      <form action={togglePaymentMethod}>
                        <input name="organizacionId" type="hidden" value={organizationId} />
                        <input name="id" type="hidden" value={method.id} />
                        <input name="activo" type="hidden" value={String(method.activo)} />
                        <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" type="submit">{method.activo ? "Ocultar" : "Activar"}</button>
                      </form>
                    </div>
                  }
                  badge={<StatusBadge active={method.activo} />}
                  campos={[{
                    label: "Categoría",
                    value: (
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-op-xs font-medium ${CATEGORIA_COLOR[method.categoria] ?? CATEGORIA_COLOR.otro}`}>
                        {CATEGORIA_LABEL[method.categoria] ?? method.categoria}
                      </span>
                    ),
                  }]}
                  key={method.id}
                  subtitulo={<span className="font-mono">{method.clave}</span>}
                  titulo={method.nombre}
                />
              ))}
            </RegistroList>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-border text-op-xs uppercase tracking-wide text-muted-foreground">
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
                      <td className="py-3 pr-4 font-mono text-op-xs">{method.clave}</td>
                      <td className="py-3 pr-4 font-medium">{method.nombre}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-op-xs font-medium ${CATEGORIA_COLOR[method.categoria] ?? CATEGORIA_COLOR.otro}`}>
                          {CATEGORIA_LABEL[method.categoria] ?? method.categoria}
                        </span>
                      </td>
                      <td className="py-3 pr-4"><StatusBadge active={method.activo} /></td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" href={buildAdminHref("/medios-pago", { organizationId, extra: { edit: method.id, categoria: categoriaFilter || null } })}>Editar</Link>
                          <form action={togglePaymentMethod}>
                            <input name="organizacionId" type="hidden" value={organizationId} />
                            <input name="id" type="hidden" value={method.id} />
                            <input name="activo" type="hidden" value={String(method.activo)} />
                            <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60" type="submit">{method.activo ? "Ocultar" : "Activar"}</button>
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
          closeHref={buildAdminHref("/medios-pago", { organizationId, extra: { categoria: categoriaFilter || null } })}
          description={editing ? "Ajusta los datos del medio de pago." : "Crea un medio de pago para cobrar en el POS."}
          title={editing ? "Editar medio de pago" : "Nuevo medio de pago"}
        >
          <PaymentMethodForm initial={editing} key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} />
        </FormSheet>
      ) : null}
    </div>
  );
}
