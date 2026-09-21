import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CancelarFacturaForm } from "@/app/admin/facturacion/cancelar-form";
import { ConfigFiscalForm } from "@/app/admin/facturacion/config-fiscal-form";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { getDatabase } from "@/db/client";
import { comprobantes, facturacionConfig } from "@/db/schema/operations";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  borrador: { label: "Borrador", className: "bg-muted/60 text-warning" },
  timbrada: { label: "Emitida", className: "bg-success/10 text-success" },
  cancelada: { label: "Cancelada", className: "bg-muted/60 text-muted-foreground" },
  error: { label: "Error", className: "bg-destructive/10 text-destructive" },
};

export default async function FacturacionPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "facturacion.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();
  const puedeEditarConfig = hasPermission(context.access, "organizaciones.editar");
  const puedeCancelar = hasPermission(context.access, "facturacion.cancelar");

  const [[config], comprobanteRows] = await Promise.all([
    db
      .select()
      .from(facturacionConfig)
      .where(and(eq(facturacionConfig.organizacionId, organizationId), eq(facturacionConfig.activo, true)))
      .limit(1),
    db
      .select()
      .from(comprobantes)
      .where(
        and(
          eq(comprobantes.organizacionId, organizationId),
          context.branch ? eq(comprobantes.sucursalId, context.branch.id) : undefined,
          eq(comprobantes.activo, true),
        ),
      )
      .orderBy(desc(comprobantes.createdAt))
      .limit(50),
  ]);

  const stub = !config?.pacProveedor || config.pacProveedor === "stub";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Comprobantes internos de las ventas cobradas. No son documentos fiscales: el timbrado CFDI real requiere contratar un PAC."
        title="Comprobantes internos"
      />

      {stub ? (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Proveedor de timbrado: <strong>sin PAC contratado</strong>. Los comprobantes se generan con un folio
          simulado — son documentos internos del negocio y <strong>no tienen validez fiscal ante el SAT</strong>.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {puedeEditarConfig ? (
          <ConfigFiscalForm
            initial={
              config
                ? {
                    rfc: config.rfc,
                    razonSocial: config.razonSocial,
                    regimenFiscal: config.regimenFiscal ?? "626",
                    codigoPostal: config.codigoPostal ?? "",
                    serie: config.serie,
                    preciosIncluyenIva: config.preciosIncluyenIva,
                    tasaIva: config.tasaIva,
                  }
                : undefined
            }
            key={config?.updatedAt?.getTime() ?? "nuevo"}
            organizationId={organizationId}
          />
        ) : (
          <AdminCard description="Datos fiscales del emisor" title="Emisor">
            {config ? (
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">RFC</dt><dd className="font-mono">{config.rfc}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Razón social</dt><dd className="text-right">{config.razonSocial}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Régimen</dt><dd>{config.regimenFiscal}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">CP fiscal</dt><dd>{config.codigoPostal}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Serie / siguiente folio</dt><dd>{config.serie}-{(config.folioActual ?? 0) + 1}</dd></div>
              </dl>
            ) : (
              <EmptyState description="Un administrador debe capturar los datos del emisor para generar comprobantes." title="Sin configurar" />
            )}
          </AdminCard>
        )}

        <AdminCard description={`${comprobanteRows.length} comprobante(s) recientes`} title="Comprobantes">
          {comprobanteRows.length === 0 ? (
            <EmptyState
              description="Desde el ticket de una venta cobrada puedes generar su comprobante con datos del cliente o a público en general."
              title="Sin comprobantes"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Folio</th>
                    <th className="py-2 pr-4 font-medium">Receptor</th>
                    <th className="py-2 pr-4 font-medium">Total</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 pr-4 font-medium">Fecha</th>
                    <th className="py-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {comprobanteRows.map((c) => {
                    const badge = ESTADO_BADGE[c.estado] ?? ESTADO_BADGE.borrador;
                    return (
                      <tr className="border-b border-border align-top" key={c.id}>
                        <td className="py-3 pr-4 font-mono text-xs">
                          {c.serie}-{c.folio}
                          {c.uuid ? <p className="mt-0.5 max-w-32 truncate text-muted-foreground" title={c.uuid}>{c.uuid}</p> : null}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium">{c.receptorNombre}</p>
                          <p className="font-mono text-xs text-muted-foreground">{c.receptorRfc}</p>
                        </td>
                        <td className="py-3 pr-4 tabular-nums">{formatCurrency(c.total, { currency: context.currency })}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                          {c.error ? <p className="mt-1 max-w-48 text-xs text-destructive">{c.error}</p> : null}
                        </td>
                        <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(c.timbradoAt ?? c.createdAt)}</td>
                        <td className="py-3">
                          <div className="flex flex-col gap-2">
                            <Link
                              className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted/60"
                              href={buildAdminHref("/pos", { organizationId, extra: { ventaId: c.ventaId } })}
                            >
                              Ver venta
                            </Link>
                            {c.estado === "timbrada" && puedeCancelar ? (
                              <CancelarFacturaForm comprobanteId={c.id} compact organizationId={organizationId} />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
