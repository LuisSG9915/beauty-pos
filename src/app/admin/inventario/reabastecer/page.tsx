import { AlertTriangle, PackageX, Wallet } from "lucide-react";
import Link from "next/link";

import {
  ReabastecerPanel,
  type FilaReabastoVista,
} from "@/app/admin/inventario/reabastecer/reabastecer-panel";
import { ResumenIaCard } from "@/app/admin/inventario/reabastecer/resumen-ia-card";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { StatCard, StatCardGrid } from "@/components/admin/stat-card";
import { BarChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { FormTabs } from "@/components/form-tabs";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext } from "@/lib/admin-context";
import { hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, todayDateInput } from "@/lib/format";
import { getAi } from "@/lib/ia/cliente";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { shiftDateKey } from "@/modules/agenda/timezone";
import {
  calcularReabastecimiento,
  filaCrudaAEntrada,
  motivoFilaReabasto,
  normalizarDiasObjetivo,
  PRIORIDAD_REABASTO_LABEL,
  textoBuenaCompra,
  textoCapitalDetenido,
  type FilaReabasto,
} from "@/modules/reportes/reabastecimiento";
import { cargarReabastecimiento } from "@/modules/reportes/reabastecimiento-queries";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string | string[];
  sucursalId?: string | string[];
  dias?: string | string[];
}>;

const DIAS_PRESET = [7, 14, 30] as const;

/** Fecha estimada en que se agota el stock, lista para la tabla. */
function textoSeAgota(fila: FilaReabasto, hoy: string, timeZone: string): string | null {
  if (fila.cobertura === null) return null;
  if (fila.stock <= 0) return "Sin stock";
  if (fila.cobertura < 1) return "Hoy";
  const fecha = shiftDateKey(hoy, Math.floor(fila.cobertura));
  if (!fecha) return null;
  // Mediodía para que el parseo local no cruce de día al formatear con zona.
  return formatDate(`${fecha}T12:00:00`, { timeZone });
}

export default async function ReabastecerPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, organizationId, timeZone, currency } = context;

  if (!organization) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="Qué mercancía comprar con información de las ventas." title="Qué comprar" />
        <EmptyState description="Tu cuenta no tiene un negocio activo asignado." title="Sin negocio" />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="Qué mercancía comprar con información de las ventas." title="Qué comprar" />
        <EmptyState description={`${organization.nombre} no tiene sucursales activas.`} title="Sin sucursal activa" />
      </div>
    );
  }

  requireAccessPermission(context.access, "inventario.ver");

  const dias = normalizarDiasObjetivo(firstParam(params.dias));
  const db = getDatabase();
  const filasCrudas = await cargarReabastecimiento(db, {
    organizacionId: organization.id,
    sucursalId: branch.id,
  });

  const ahora = new Date();
  const resultado = calcularReabastecimiento(
    filasCrudas.map((fila) => filaCrudaAEntrada(fila, ahora)),
    dias,
  );

  const puedeCrearCompra = hasPermission(context.access, "compras.editar");
  const aiDisponible = getAi() !== null;
  const hoy = todayDateInput(timeZone);
  const moneda = (valor: number) => formatCurrency(valor, { currency });

  const filasVista: FilaReabastoVista[] = resultado.sugerencias.map((fila) => ({
    productoId: fila.productoId,
    nombre: fila.nombre,
    sku: fila.sku,
    stock: fila.stock,
    stockMinimo: fila.stockMinimo,
    vendePorDia: fila.v,
    tendencia: fila.tendencia,
    cobertura: fila.cobertura,
    seAgota: textoSeAgota(fila, hoy, timeZone),
    enCamino: fila.enCamino,
    sugerido: fila.sugerido,
    prioridad: fila.prioridad,
    costoUnitario: fila.costo,
    costoSugerido: fila.costoSugerido,
    motivo: motivoFilaReabasto(fila, dias),
  }));

  const puntosCobertura = resultado.sugerencias.slice(0, 15).map((fila) => ({
    id: fila.productoId,
    etiqueta: fila.nombre.length > 12 ? `${fila.nombre.slice(0, 11)}…` : fila.nombre,
    valor: fila.cobertura === null ? 0 : Math.round(fila.cobertura * 10) / 10,
    detalle:
      fila.cobertura === null
        ? "sin ventas recientes"
        : PRIORIDAD_REABASTO_LABEL[fila.prioridad],
  }));

  const contexto = { organizationId, sucursalId: branch.id };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          { label: "Inventario", href: buildAdminHref("/inventario", contexto) },
          { label: "Qué comprar" },
        ]}
        description={`${branch.nombre} · sugerencias para ${dias} días · Cantidades redondeadas hacia arriba.`}
        title="Qué comprar"
      />

      {/* Control "Comprar para … días" (query ?dias=). */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Comprar para</span>
        <div aria-label="Días a cubrir" className="flex items-center gap-2" role="group">
          {DIAS_PRESET.map((preset) => (
            <Link
              aria-current={dias === preset ? "true" : undefined}
              className={`inline-flex min-h-6 items-center rounded-full border px-3 py-1.5 text-op-xs font-medium transition ${
                dias === preset
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/60"
              }`}
              data-action-id={`reabastecer.dias.${preset}`}
              href={buildAdminHref("/inventario/reabastecer", {
                ...contexto,
                extra: { dias: preset === 14 ? null : preset },
              })}
              key={preset}
            >
              {preset} días
            </Link>
          ))}
        </div>
        {/* GET sustituye el query del action: org/sucursal viajan ocultos. */}
        <form action="/admin/inventario/reabastecer" className="flex items-center gap-2" method="get">
          <input name="organizationId" type="hidden" value={organizationId ?? ""} />
          <input name="sucursalId" type="hidden" value={branch.id} />
          <Field>
            <Input
              aria-label="Días personalizados"
              className="h-8 w-20 text-right tabular-nums"
              defaultValue={DIAS_PRESET.includes(dias as (typeof DIAS_PRESET)[number]) ? "" : dias}
              key={dias}
              max="60"
              min="7"
              name="dias"
              placeholder="7–60"
              type="number"
            />
          </Field>
          <Button data-action-id="reabastecer.dias.aplicar" size="sm" type="submit" variant="outline">
            Aplicar
          </Button>
        </form>
      </div>

      <StatCardGrid>
        <StatCard
          hint="sin existencias y con ventas"
          icon={PackageX}
          label="Agotados"
          value={resultado.kpis.agotados}
        />
        <StatCard
          hint="alcanzan para menos de 7 días"
          icon={AlertTriangle}
          label="Urgentes"
          value={resultado.kpis.urgentes}
        />
        <StatCard
          hint={`compra sugerida para ${dias} días`}
          icon={Wallet}
          label="Inversión sugerida"
          value={moneda(resultado.kpis.costoTotalSugerido)}
        />
      </StatCardGrid>

      <AdminCard
        description="Productos que necesitan compra, del más urgente al que solo cubre el mínimo."
        title={`Qué comprar (${resultado.sugerencias.length})`}
      >
        <ReabastecerPanel
          currency={currency}
          dias={dias}
          filas={filasVista}
          organizacionId={organization.id}
          puedeCrearCompra={puedeCrearCompra}
          sucursalId={branch.id}
        />
      </AdminCard>

      {puntosCobertura.length > 0 ? (
        <AdminCard
          description="Cuántos días alcanza el stock de lo más urgente al ritmo de venta actual."
          title="Días que alcanza"
        >
          <BarChart formato={(valor) => `${valor} días`} puntos={puntosCobertura} />
        </AdminCard>
      ) : null}

      <AdminCard title="Buena compra y mercancía detenida">
        <FormTabs
          tabs={[
            {
              id: "buena-compra",
              label: `Buena compra (${resultado.buenaCompra.length})`,
              content:
                resultado.buenaCompra.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Sin candidatos todavía: necesitas ventas recientes y precio mayor al costo.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {resultado.buenaCompra.map((item) => (
                      <li
                        className="flex items-start justify-between gap-3 rounded-xl border border-border px-4 py-3"
                        key={item.productoId}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-5 text-foreground">{item.nombre}</p>
                          <p className="mt-0.5 text-op-xs leading-5 text-muted-foreground">
                            {textoBuenaCompra(item, moneda)}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-success-soft px-2.5 py-0.5 text-op-xs font-medium text-success">
                          {Math.round(item.margenPct * 100)}% margen
                        </span>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              id: "detenida",
              label: `Mercancía detenida (${resultado.detenida.length})`,
              content:
                resultado.detenida.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    Nada detenido: todo lo que tienes en stock tuvo salidas en los últimos 90 días.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {resultado.detenida.map((item) => (
                      <li
                        className="flex items-start justify-between gap-3 rounded-xl border border-border px-4 py-3"
                        key={item.productoId}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-5 text-foreground">{item.nombre}</p>
                          <p className="mt-0.5 text-op-xs leading-5 text-muted-foreground">
                            {textoCapitalDetenido(item, moneda)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {moneda(item.capital)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      </AdminCard>

      {aiDisponible ? (
        <AdminCard
          description="Resumen en palabras sencillas de los números de arriba; se genera solo cuando lo pides."
          title="Resumen"
        >
          <ResumenIaCard dias={dias} organizacionId={organization.id} sucursalId={branch.id} />
        </AdminCard>
      ) : null}
    </div>
  );
}
