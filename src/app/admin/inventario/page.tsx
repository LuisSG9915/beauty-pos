import Link from "next/link";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";

import { MovimientoForm } from "@/app/admin/inventario/movimiento-form";
import { AdminCard, AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { EmptyState } from "@/components/empty-state";
import { FormTabs } from "@/components/form-tabs";
import { StatusBadge } from "@/components/status-badge";
import { getDatabase } from "@/db/client";
import { catUnidadesMedida, productos, relServiciosInsumos, servicios } from "@/db/schema/catalogs";
import { detalleVentasServicios, inventarioStock, movimientosInventario, ventas } from "@/db/schema/operations";
import { getAdminContext } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatDateTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string | string[];
  sucursalId?: string | string[];
}>;

const TIPO_LABEL: Record<string, string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
  venta: "Venta",
  consumo: "Consumo",
};

function stockTone(stock: number, minimo: number) {
  if (stock <= 0) return { label: "Agotado", tone: "destructive" as const };
  if (stock < minimo) return { label: "Bajo", tone: "warning" as const };
  return { label: "OK", tone: "success" as const };
}

export default async function InventarioPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, branches, organizationId, sucursalId, timeZone } = context;

  if (!organization) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="Stock, movimientos y ajustes por sucursal." title="Inventario" />
        <EmptyState description="Tu usuario no tiene una organización activa asignada." title="Sin organización" />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="Stock, movimientos y ajustes por sucursal." title="Inventario" />
        <EmptyState description={`${organization.nombre} no tiene sucursales activas.`} title="Sin sucursal activa" />
      </div>
    );
  }

  requireAccessPermission(context.access, "inventario.ver");

  const db = getDatabase();
  const [catalogoProductos, stockRows, movimientos] = await Promise.all([
    db
      .select({ id: productos.id, sku: productos.sku, nombre: productos.nombre, tipo: productos.tipo, stockMinimo: productos.stockMinimo, unidad: catUnidadesMedida.clave })
      .from(productos)
      .leftJoin(catUnidadesMedida, eq(productos.unidadMedidaId, catUnidadesMedida.id))
      .where(and(eq(productos.organizacionId, organization.id), eq(productos.activo, true)))
      .orderBy(asc(productos.nombre)),
    db
      .select({ productoId: inventarioStock.productoId, stock: inventarioStock.stockActual })
      .from(inventarioStock)
      .where(and(eq(inventarioStock.organizacionId, organization.id), eq(inventarioStock.sucursalId, branch.id))),
    db
      .select({
        id: movimientosInventario.id,
        tipo: movimientosInventario.tipo,
        cantidad: movimientosInventario.cantidad,
        stockResultante: movimientosInventario.stockResultante,
        notas: movimientosInventario.notas,
        createdAt: movimientosInventario.createdAt,
        productoNombre: productos.nombre,
        sku: productos.sku,
      })
      .from(movimientosInventario)
      .innerJoin(productos, eq(movimientosInventario.productoId, productos.id))
      .where(and(eq(movimientosInventario.organizacionId, organization.id), eq(movimientosInventario.sucursalId, branch.id)))
      .orderBy(desc(movimientosInventario.createdAt))
      .limit(30),
  ]);
  const stockPorProducto = new Map(stockRows.map((row) => [row.productoId, Number(row.stock)]));

  // Consumo backbar teórico por servicio vendido en los últimos 30 días
  // (rel_servicios_insumos × líneas de servicio cobradas en esta sucursal).
  const fechaVenta = sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;
  const hace30 = sql`now() - interval '30 days'`;
  const consumoPorServicio = await db
    .select({
      servicio: servicios.nombre,
      insumo: productos.nombre,
      unidad: catUnidadesMedida.clave,
      consumo: sql<string>`coalesce(sum(${detalleVentasServicios.cantidad}::numeric * ${relServiciosInsumos.cantidad}), 0)`,
    })
    .from(detalleVentasServicios)
    .innerJoin(
      ventas,
      and(
        eq(detalleVentasServicios.ventaId, ventas.id),
        eq(ventas.sucursalId, branch.id),
        eq(ventas.estado, "completada"),
        eq(ventas.activo, true),
        gte(fechaVenta, hace30),
      ),
    )
    .innerJoin(servicios, eq(detalleVentasServicios.servicioId, servicios.id))
    .innerJoin(
      relServiciosInsumos,
      and(eq(relServiciosInsumos.servicioId, detalleVentasServicios.servicioId), eq(relServiciosInsumos.activo, true)),
    )
    .innerJoin(productos, eq(relServiciosInsumos.productoId, productos.id))
    .leftJoin(catUnidadesMedida, eq(productos.unidadMedidaId, catUnidadesMedida.id))
    .where(eq(detalleVentasServicios.activo, true))
    .groupBy(servicios.nombre, productos.nombre, catUnidadesMedida.clave);
  consumoPorServicio.sort((a, b) => Number(b.consumo) - Number(a.consumo));

  // Retail: vendible al público (producto|ambos). Backbar: consumo de cabina
  // (insumo|ambos). "ambos" aparece en las dos pestañas a propósito.
  const retail = catalogoProductos.filter((p) => p.tipo === "producto" || p.tipo === "ambos");
  const backbar = catalogoProductos.filter((p) => p.tipo === "insumo" || p.tipo === "ambos");
  const alertas = (rows: typeof catalogoProductos) =>
    rows.filter((p) => {
      const stock = stockPorProducto.get(p.id) ?? 0;
      return stock <= 0 || stock < Number(p.stockMinimo);
    }).length;

  const stockTable = (rows: typeof catalogoProductos) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-[#f8f7f5] text-xs uppercase tracking-wide text-[#81746c]">
          <tr>
            <th className="px-4 py-3 font-medium">SKU</th>
            <th className="px-4 py-3 font-medium">Producto</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 text-right font-medium">Stock</th>
            <th className="px-4 py-3 text-right font-medium">Mínimo</th>
            <th className="px-4 py-3 font-medium">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eee8e3]">
          {rows.map((producto) => {
            const stock = stockPorProducto.get(producto.id) ?? 0;
            const minimo = Number(producto.stockMinimo);
            const estado = stockTone(stock, minimo);
            return (
              <tr className="hover:bg-[#faf9f7]" key={producto.id}>
                <td className="px-4 py-3 text-xs text-[#625b55]">{producto.sku}</td>
                <td className="px-4 py-3 font-medium">{producto.nombre}</td>
                <td className="px-4 py-3 text-xs capitalize text-[#625b55]">{producto.tipo}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {stock.toFixed(3)}{producto.unidad ? ` ${producto.unidad}` : ""}
                </td>
                <td className="px-4 py-3 text-right text-xs tabular-nums text-[#625b55]">{minimo.toFixed(3)}</td>
                <td className="px-4 py-3"><StatusBadge tone={estado.tone}>{estado.label}</StatusBadge></td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr><td className="px-4 py-10 text-center text-sm text-[#625b55]" colSpan={6}>Sin registros en esta categoría.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description={`${branch.nombre} · ${timeZone}`}
        title="Inventario"
      />

      <nav aria-label="Sucursales" className="flex flex-wrap gap-2">
        {branches.map((item) => (
          <Link
            aria-current={item.id === branch.id ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-full border px-3.5 text-xs font-medium transition-colors",
              item.id === branch.id
                ? "border-[#8a5140] bg-[#f2e3dc] text-[#60392e]"
                : "border-[#ded8d2] bg-white text-[#625b55] hover:border-[#c9a899] hover:bg-[#faf6f3]",
            )}
            href={buildAdminHref("/inventario", { organizationId, sucursalId: item.id })}
            key={item.id}
          >
            {item.nombre}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-6">
          <AdminSection title="Existencias">
            <AdminCard className="overflow-hidden p-0 sm:p-0">
              <div className="px-4 pt-4">
                <FormTabs
                  tabs={[
                    {
                      id: "retail",
                      label: `Retail${alertas(retail) ? ` · ${alertas(retail)} bajo` : ""}`,
                      content: stockTable(retail),
                    },
                    {
                      id: "backbar",
                      label: `Backbar${alertas(backbar) ? ` · ${alertas(backbar)} bajo` : ""}`,
                      content: (
                        <div className="space-y-4">
                          {stockTable(backbar)}
                          <div className="border-t border-[#eee8e3] px-4 pb-4 pt-3">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
                              Consumo por servicio · 30 días
                            </h4>
                            {consumoPorServicio.length === 0 ? (
                              <p className="mt-2 text-sm text-[#625b55]">
                                Sin consumo registrado. Vincula insumos a servicios para ver la demanda de cabina.
                              </p>
                            ) : (
                              <ul className="mt-2 space-y-1.5">
                                {consumoPorServicio.map((row, i) => (
                                  <li className="flex items-baseline justify-between gap-3 text-sm" key={i}>
                                    <span className="text-[#625b55]">
                                      {row.servicio} <span className="text-xs text-[#81746c]">· {row.insumo}</span>
                                    </span>
                                    <span className="font-semibold tabular-nums text-[#2d2926]">
                                      {Number(row.consumo).toFixed(3)}{row.unidad ? ` ${row.unidad}` : ""}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            </AdminCard>
          </AdminSection>

          <AdminSection title="Movimientos recientes">
            <AdminCard className="overflow-hidden p-0 sm:p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-[#f8f7f5] text-xs uppercase tracking-wide text-[#81746c]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Producto</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                      <th className="px-4 py-3 text-right font-medium">Stock final</th>
                      <th className="px-4 py-3 font-medium">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eee8e3]">
                    {movimientos.map((movimiento) => {
                      const cantidad = Number(movimiento.cantidad);
                      return (
                        <tr className="hover:bg-[#faf9f7]" key={movimiento.id}>
                          <td className="px-4 py-3 text-xs whitespace-nowrap text-[#625b55]">{formatDateTime(movimiento.createdAt, { timeZone })}</td>
                          <td className="px-4 py-3 text-xs">{movimiento.sku} · {movimiento.productoNombre}</td>
                          <td className="px-4 py-3"><StatusBadge tone={cantidad >= 0 ? "success" : "destructive"}>{TIPO_LABEL[movimiento.tipo] ?? movimiento.tipo}</StatusBadge></td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums">{cantidad > 0 ? "+" : ""}{cantidad.toFixed(3)}</td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums text-[#625b55]">{Number(movimiento.stockResultante).toFixed(3)}</td>
                          <td className="max-w-44 truncate px-4 py-3 text-xs text-[#625b55]" title={movimiento.notas ?? ""}>{movimiento.notas ?? "—"}</td>
                        </tr>
                      );
                    })}
                    {movimientos.length === 0 ? (
                      <tr><td className="px-4 py-10 text-center text-sm text-[#625b55]" colSpan={6}>Sin movimientos en esta sucursal.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </AdminCard>
          </AdminSection>
        </div>

        <AdminCard
          description="Entrada suma stock; salida resta; ajuste registra el conteo físico."
          title="Registrar movimiento"
        >
          <MovimientoForm
            organizationId={organizationId ?? organization.id}
            productos={catalogoProductos}
            sucursalId={sucursalId ?? branch.id}
          />
        </AdminCard>
      </div>
    </div>
  );
}
