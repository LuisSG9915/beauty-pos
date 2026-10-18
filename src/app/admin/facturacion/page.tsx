import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CancelarFacturaForm } from "@/app/admin/facturacion/cancelar-form";
import { ConfigFiscalForm } from "@/app/admin/facturacion/config-fiscal-form";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate } from "@/lib/format";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const ESTADO_BADGE: Record<string, { label: string; className: string }> = {
  borrador: { label: "Borrador", className: "bg-warning-soft text-warning-soft-foreground" },
  timbrada: { label: "Emitida", className: "bg-success-soft text-success-soft-foreground" },
  cancelada: { label: "Cancelada", className: "bg-muted/60 text-muted-foreground" },
  error: { label: "Error", className: "bg-destructive-soft text-destructive-soft-foreground" },
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

  type ConfigRow = {
    rfc: string;
    razonSocial: string;
    regimenFiscal: string | null;
    codigoPostal: string | null;
    serie: string;
    folioActual: number | null;
    pacProveedor: string | null;
    preciosIncluyenIva: boolean;
    tasaIva: string;
    updatedAt: string | null;
  };
  type ComprobanteRow = {
    id: string;
    ventaId: string;
    serie: string;
    folio: number;
    uuid: string | null;
    receptorRfc: string;
    receptorNombre: string;
    total: string;
    estado: string;
    error: string | null;
    timbradoAt: string | null;
    createdAt: string;
  };
  type FacturacionSqlRow = {
    config: ConfigRow | null;
    comprobantes: ComprobanteRow[];
  };

  // Configuración del emisor y últimos 50 comprobantes en UNA sola consulta SQL.
  const { rows: sqlRows } = await db.execute<FacturacionSqlRow>(sql`
    select
      (
        select jsonb_build_object(
          'rfc', fc.rfc,
          'razonSocial', fc.razon_social,
          'regimenFiscal', fc.regimen_fiscal,
          'codigoPostal', fc.codigo_postal,
          'serie', fc.serie,
          'folioActual', fc.folio_actual,
          'pacProveedor', fc.pac_proveedor,
          'preciosIncluyenIva', fc.precios_incluyen_iva,
          'tasaIva', fc.tasa_iva::text,
          'updatedAt', to_char(fc.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
        from facturacion_config fc
        where fc.organizacion_id = ${organizationId} and fc.activo = true
        limit 1
      ) as config,
      coalesce((
        select jsonb_agg(t) from (
          select
            c.id,
            c.venta_id as "ventaId",
            c.serie,
            c.folio,
            c.uuid,
            c.receptor_rfc as "receptorRfc",
            c.receptor_nombre as "receptorNombre",
            c.total::text as total,
            c.estado,
            c.error,
            case when c.timbrado_at is null then null
              else to_char(c.timbrado_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end as "timbradoAt",
            to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt"
          from comprobantes c
          where c.organizacion_id = ${organizationId}
            ${context.branch ? sql`and c.sucursal_id = ${context.branch.id}` : sql``}
            and c.activo = true
          order by c.created_at desc
          limit 50
        ) t
      ), '[]'::jsonb) as comprobantes
  `);

  const datos = sqlRows[0];
  const config = datos?.config
    ? {
        ...datos.config,
        updatedAt: datos.config.updatedAt ? new Date(datos.config.updatedAt) : null,
      }
    : undefined;
  const comprobanteRows = (datos?.comprobantes ?? []).map((c) => ({
    ...c,
    timbradoAt: c.timbradoAt ? new Date(c.timbradoAt) : null,
    createdAt: new Date(c.createdAt),
  }));

  const stub = !config?.pacProveedor || config.pacProveedor === "stub";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          puedeEditarConfig ? (
            <Button
              data-action-clave="1"
              data-action-id="facturacion.emisor.abrir_formulario"
              nativeButton={false}
              render={<Link href={buildAdminHref("/facturacion", { organizationId, extra: { emisor: "1" } })} />}
              size="lg"
            >
              {config ? "Editar emisor" : "Configurar emisor"}
            </Button>
          ) : undefined
        }
        description="Comprobantes internos de las ventas cobradas. No son documentos fiscales: el timbrado CFDI real requiere contratar un PAC."
        title="Comprobantes internos"
      />

      {stub ? (
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          Proveedor de timbrado: <strong>sin PAC contratado</strong>. Los comprobantes se generan con un folio
          simulado — son documentos internos del negocio y <strong>no tienen validez fiscal ante el SAT</strong>.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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

        <AdminCard description={`${comprobanteRows.length} comprobante(s) recientes`} title="Comprobantes">
          {comprobanteRows.length === 0 ? (
            <EmptyState
              description="Desde el ticket de una venta cobrada puedes generar su comprobante con datos del cliente o a público en general."
              title="Sin comprobantes"
            />
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {comprobanteRows.map((c, index) => {
                  const badge = ESTADO_BADGE[c.estado] ?? ESTADO_BADGE.borrador;
                  return (
                    <article className="anim-entrada rounded-xl border border-border p-4" key={c.id} style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold leading-5 text-foreground">{c.receptorNombre}</h3>
                          <p className="mt-0.5 font-mono text-op-xs leading-5 text-muted-foreground">
                            {c.serie}-{c.folio} · {c.receptorRfc}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-op-xs font-medium ${badge.className}`}>{badge.label}</span>
                      </div>
                      {c.error ? <p className="mt-2 text-op-xs text-destructive">{c.error}</p> : null}
                      <dl className="mt-3 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <dt className="shrink-0 text-op-xs text-muted-foreground">Total</dt>
                          <dd className="min-w-0 text-right font-medium tabular-nums text-foreground">{formatCurrency(c.total, { currency: context.currency })}</dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <dt className="shrink-0 text-op-xs text-muted-foreground">Fecha</dt>
                          <dd className="min-w-0 text-right text-op-xs text-muted-foreground">{formatDate(c.timbradoAt ?? c.createdAt)}</dd>
                        </div>
                      </dl>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                        <Link
                          className="inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-op-xs font-medium text-muted-foreground hover:bg-muted/60"
                          href={buildAdminHref("/pos", { organizationId, extra: { ventaId: c.ventaId } })}
                        >
                          Ver venta
                        </Link>
                        {c.estado === "timbrada" && puedeCancelar ? (
                          <CancelarFacturaForm comprobanteId={c.id} compact organizationId={organizationId} />
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-op-xs uppercase tracking-wide text-muted-foreground">
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
                        <td className="py-3 pr-4 font-mono text-op-xs">
                          {c.serie}-{c.folio}
                          {c.uuid ? <p className="mt-0.5 max-w-32 truncate text-muted-foreground" title={c.uuid}>{c.uuid}</p> : null}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium">{c.receptorNombre}</p>
                          <p className="font-mono text-op-xs text-muted-foreground">{c.receptorRfc}</p>
                        </td>
                        <td className="py-3 pr-4 tabular-nums">{formatCurrency(c.total, { currency: context.currency })}</td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-op-xs font-medium ${badge.className}`}>{badge.label}</span>
                          {c.error ? <p className="mt-1 max-w-48 text-op-xs text-destructive">{c.error}</p> : null}
                        </td>
                        <td className="py-3 pr-4 text-op-xs text-muted-foreground">{formatDate(c.timbradoAt ?? c.createdAt)}</td>
                        <td className="py-3">
                          <div className="flex flex-col gap-2">
                            <Link
                              className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60"
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
            </>
          )}
        </AdminCard>
      </div>

      {puedeEditarConfig && firstParam(params.emisor) === "1" ? (
        <FormSheet
          closeHref={buildAdminHref("/facturacion", { organizationId })}
          description="Identidad fiscal con la que se emiten los CFDI de esta organización."
          title="Datos del emisor"
        >
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
        </FormSheet>
      ) : null}
    </div>
  );
}
