import { AlertTriangle, ArrowLeftRight, Package, PackageX, Wallet } from "lucide-react";
import Link from "next/link";
import { and, asc, desc, eq, gt, gte, sql } from "drizzle-orm";

import { MovimientoForm } from "@/app/admin/inventario/movimiento-form";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminCard, AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { StatCard, StatCardGrid } from "@/components/admin/stat-card";
import { DonutChart, HBarChart } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { FormTabs } from "@/components/form-tabs";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/db/client";
import { catUnidadesMedida, productos, relServiciosInsumos, servicios } from "@/db/schema/catalogs";
import { detalleVentasServicios, inventarioStock, movimientosInventario, ventas } from "@/db/schema/operations";
import { inventarioUbicaciones, ubicaciones } from "@/db/schema/plano";
import { getAdminContext } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDateTime, formatQuantity } from "@/lib/format";
import { buildAdminHref, normalizeView } from "@/lib/url-context";
import { cargarPanelInventario } from "@/modules/inventory";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  organizationId?: string | string[];
  sucursalId?: string | string[];
  nuevo?: string | string[];
  vista?: string | string[];
}>;

const VISTAS_PANEL = ["sucursal", "todas"] as const;

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

/** Color de barra por estado de stock (misma semántica que `stockTone`). */
const STOCK_TONO_COLOR = {
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
} as const;

export default async function InventarioPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params);
  const { organization, branch, organizationId, timeZone } = context;

  if (!organization) {
    return (
      <div className="space-y-6">
        <AdminPageHeader description="Stock, movimientos y ajustes por sucursal." title="Inventario" />
        <EmptyState description="Tu cuenta no tiene un negocio activo asignado." title="Sin negocio" />
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

  // Alcance del panel (solo las secciones nuevas; la tabla sigue con la
  // sucursal activa del contexto). "Todas" agrega por producto sobre las
  // sucursales visibles del acceso — `context.branches` ya viene acotado.
  const vistaPanel = normalizeView(params.vista, VISTAS_PANEL, "sucursal");
  const vistaTodas = vistaPanel === "todas" && context.branches.length > 1;
  const sucursalesPanel = vistaTodas ? context.branches.map((item) => item.id) : [branch.id];

  const db = getDatabase();
  // Consumo backbar teórico por servicio vendido en los últimos 30 días
  // (rel_servicios_insumos × líneas de servicio cobradas en esta sucursal).
  const fechaVenta = sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;
  const hace30 = sql`now() - interval '30 days'`;
  const [catalogoProductos, stockRows, movimientos, panel, consumoPorServicio, ubicacionesRows] = await Promise.all([
    db
      .select({ id: productos.id, sku: productos.sku, nombre: productos.nombre, tipo: productos.tipo, costo: productos.costo, stockMinimo: productos.stockMinimo, unidad: catUnidadesMedida.clave })
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
    cargarPanelInventario(db, { organizacionId: organization.id, sucursalIds: sucursalesPanel }),
    db
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
      .groupBy(servicios.nombre, productos.nombre, catUnidadesMedida.clave),
    // Ubicaciones del plano (plan 11) por producto en esta sucursal.
    db
      .select({
        productoId: inventarioUbicaciones.productoId,
        ubicacion: ubicaciones.nombre,
      })
      .from(inventarioUbicaciones)
      .innerJoin(
        ubicaciones,
        and(eq(inventarioUbicaciones.ubicacionId, ubicaciones.id), eq(ubicaciones.activo, true)),
      )
      .where(
        and(
          eq(inventarioUbicaciones.organizacionId, organization.id),
          eq(ubicaciones.sucursalId, branch.id),
          gt(inventarioUbicaciones.cantidad, "0"),
        ),
      )
      .orderBy(asc(ubicaciones.nombre)),
  ]);
  const stockPorProducto = new Map(stockRows.map((row) => [row.productoId, Number(row.stock)]));
  const ubicacionesPorProducto = new Map<string, string[]>();
  for (const row of ubicacionesRows) {
    const lista = ubicacionesPorProducto.get(row.productoId) ?? [];
    lista.push(row.ubicacion);
    ubicacionesPorProducto.set(row.productoId, lista);
  }
  const hrefMapa = (productoId: string) =>
    buildAdminHref("/plano", {
      organizationId,
      sucursalId: branch.id,
      extra: { producto: productoId },
    });
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

  const stockCards = (rows: typeof catalogoProductos) => (
    <div className="space-y-3 px-4 pb-4 md:hidden">
      {rows.map((producto) => {
        const stock = stockPorProducto.get(producto.id) ?? 0;
        const minimo = Number(producto.stockMinimo);
        const estado = stockTone(stock, minimo);
        return (
          <article className="rounded-xl border border-border p-4" key={producto.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-5 text-foreground">{producto.nombre}</h3>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{producto.sku} · {producto.tipo}</p>
              </div>
              <StatusBadge tone={estado.tone}>{estado.label}</StatusBadge>
            </div>
            <dl className="mt-3 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="shrink-0 text-xs text-muted-foreground">Stock</dt>
                <dd className="min-w-0 text-right font-semibold tabular-nums text-foreground">
                  {stock.toFixed(3)}{producto.unidad ? ` ${producto.unidad}` : ""}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="shrink-0 text-xs text-muted-foreground">Valor en stock</dt>
                <dd className="min-w-0 text-right text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(stock * Number(producto.costo), { currency: context.currency })}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="shrink-0 text-xs text-muted-foreground">Mínimo</dt>
                <dd className="min-w-0 text-right text-xs tabular-nums text-muted-foreground">{minimo.toFixed(3)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="shrink-0 text-xs text-muted-foreground">Ubicación</dt>
                <dd className="min-w-0 text-right text-xs text-muted-foreground">
                  {(() => {
                    const nombres = ubicacionesPorProducto.get(producto.id) ?? [];
                    return nombres.length === 0
                      ? "Sin ubicar"
                      : `${nombres.slice(0, 2).join(", ")}${nombres.length > 2 ? ` +${nombres.length - 2}` : ""}`;
                  })()}
                  {" · "}
                  <Link
                    className="font-medium text-primary hover:underline"
                    data-action-id="inventario.producto.ver_en_mapa"
                    href={hrefMapa(producto.id)}
                  >
                    Ver en el mapa
                  </Link>
                </dd>
              </div>
            </dl>
          </article>
        );
      })}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sin registros en esta categoría.</p>
      ) : null}
    </div>
  );

  const stockColumns: Array<DataTableColumn<(typeof catalogoProductos)[number]>> = [
    {
      id: "clave",
      header: "Clave",
      cell: (producto) => <span className="text-xs text-muted-foreground">{producto.sku}</span>,
    },
    { id: "producto", header: "Producto", cell: (producto) => <span className="font-medium">{producto.nombre}</span> },
    {
      id: "tipo",
      header: "Tipo",
      cell: (producto) => <span className="text-xs capitalize text-muted-foreground">{producto.tipo}</span>,
      hideBelow: "lg",
    },
    {
      id: "stock",
      header: "Stock",
      cell: (producto) => {
        const stock = stockPorProducto.get(producto.id) ?? 0;
        return (
          <span className="font-semibold tabular-nums">
            {stock.toFixed(3)}{producto.unidad ? ` ${producto.unidad}` : ""}
          </span>
        );
      },
      align: "right",
    },
    {
      id: "valor",
      header: "Valor en stock",
      cell: (producto) => {
        const stock = stockPorProducto.get(producto.id) ?? 0;
        return (
          <span className="tabular-nums">
            {formatCurrency(stock * Number(producto.costo), { currency: context.currency })}
          </span>
        );
      },
      align: "right",
    },
    {
      id: "minimo",
      header: "Mínimo",
      cell: (producto) => (
        <span className="text-xs tabular-nums text-muted-foreground">{Number(producto.stockMinimo).toFixed(3)}</span>
      ),
      align: "right",
      hideBelow: "lg",
    },
    {
      id: "ubicacion",
      header: "Ubicación",
      cell: (producto) => {
        const nombres = ubicacionesPorProducto.get(producto.id) ?? [];
        const href = hrefMapa(producto.id);
        return (
          <div className="min-w-0">
            <span className="block truncate text-xs text-muted-foreground">
              {nombres.length === 0
                ? "Sin ubicar"
                : `${nombres.slice(0, 2).join(", ")}${nombres.length > 2 ? ` +${nombres.length - 2}` : ""}`}
            </span>
            <Link
              className="text-xs font-medium text-primary hover:underline"
              data-action-id="inventario.producto.ver_en_mapa"
              href={href}
            >
              Ver en el mapa
            </Link>
          </div>
        );
      },
      hideBelow: "xl",
    },
    {
      id: "estado",
      header: "Estado",
      cell: (producto) => {
        const stock = stockPorProducto.get(producto.id) ?? 0;
        const estado = stockTone(stock, Number(producto.stockMinimo));
        return <StatusBadge tone={estado.tone}>{estado.label}</StatusBadge>;
      },
    },
  ];

  const stockTable = (rows: typeof catalogoProductos) => (
    <DataTable
      className="hidden md:block"
      columns={stockColumns}
      emptyMessage="Sin registros en esta categoría."
      minWidth="820px"
      rowKey={(producto) => producto.id}
      rows={rows}
    />
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <>
            <Button
              data-action-id="inventario.reabastecer.abrir"
              nativeButton={false}
              render={<Link href={buildAdminHref("/inventario/reabastecer", { organizationId, sucursalId: branch.id })} />}
              variant="outline"
            >
              Qué comprar
            </Button>
            <Button
              data-action-clave="1"
              data-action-id="inventario.movimiento.abrir_formulario"
              nativeButton={false}
              render={<Link href={buildAdminHref("/inventario", { organizationId, sucursalId: branch.id, extra: { nuevo: "movimiento" } })} />}
              size="lg"
            >
              Registrar movimiento
            </Button>
          </>
        }
        description={`${branch.nombre} · ${timeZone}`}
        title="Inventario"
      />

      {/* La sucursal se cambia desde el selector global del shell; aquí solo
          se muestra la activa en la descripción del encabezado. */}
      <div>
        <div className="space-y-6">
          <AdminSection
            actions={
              context.branches.length > 1 ? (
                <div aria-label="Alcance del panel" className="flex items-center gap-2" role="group">
                  {VISTAS_PANEL.map((vista) => {
                    const activa = vista === (vistaTodas ? "todas" : "sucursal");
                    return (
                      <Link
                        aria-current={activa ? "true" : undefined}
                        className={`inline-flex min-h-6 items-center rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          activa
                            ? "border-primary bg-accent text-accent-foreground"
                            : "border-border text-muted-foreground hover:bg-muted/60"
                        }`}
                        data-action-id={`inventario.panel.vista.${vista}`}
                        href={buildAdminHref("/inventario", {
                          organizationId,
                          sucursalId: branch.id,
                          extra: { vista: vista === "todas" ? "todas" : null },
                        })}
                        key={vista}
                      >
                        {vista === "todas" ? "Todas las sucursales" : "Esta sucursal"}
                      </Link>
                    );
                  })}
                </div>
              ) : null
            }
            description={vistaTodas ? "Suma de todas las sucursales de tu alcance." : `Solo ${branch.nombre}.`}
            title="Panel de inventario"
          >
            {panel.kpis.productos === 0 ? (
              <EmptyState
                description="Aún no hay productos ni insumos activos; el panel se llena al darlos de alta y registrar movimientos."
                icon={Package}
                title="Sin productos activos"
              />
            ) : (
              <>
                <StatCardGrid>
                  <StatCard
                    hint={`${panel.kpis.productos} producto(s) activos · costo × existencias`}
                    icon={Wallet}
                    label="Valor del inventario"
                    value={formatCurrency(panel.kpis.valorTotal, { currency: context.currency })}
                  />
                  <StatCard
                    hint="Con existencias por debajo del mínimo"
                    icon={AlertTriangle}
                    label="Bajo el mínimo"
                    value={String(panel.kpis.bajoMinimo)}
                  />
                  <StatCard
                    hint="Sin existencias en el alcance elegido"
                    icon={PackageX}
                    label="Sin stock"
                    value={String(panel.kpis.sinStock)}
                  />
                  <StatCard
                    hint="Entradas, salidas y ajustes valorizados al costo"
                    icon={ArrowLeftRight}
                    label="Movido en 30 días"
                    value={formatCurrency(panel.valorMovimiento30d, { currency: context.currency })}
                  />
                </StatCardGrid>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Plan 11 (ubicaciones en el mapa): PuntoGrafica.id ya lleva
                      el productoId — ahí se anclará «Ver en el mapa» por barra. */}
                  <AdminCard
                    description="Los productos con mayor valor en existencia; la marca vertical indica el stock mínimo."
                    title="Stock vs mínimo"
                  >
                    {panel.topStock.length === 0 ? (
                      <EmptyState
                        className="border-0 bg-transparent py-8"
                        description="Sin existencias registradas en el alcance elegido."
                        icon={PackageX}
                        title="Sin datos para graficar"
                      />
                    ) : (
                      <HBarChart
                        etiquetaAccesible="Stock actual por producto contra su mínimo"
                        etiquetaIzquierda
                        formato={(valor) => formatQuantity(valor)}
                        puntos={panel.topStock.map((item) => ({
                          id: item.id,
                          etiqueta: item.nombre,
                          valor: item.stock,
                          marca: item.minimo,
                          color: STOCK_TONO_COLOR[stockTone(item.stock, item.minimo).tone],
                          detalle: [
                            `valor ${formatCurrency(item.valor, { currency: context.currency })}`,
                            ...(vistaTodas && item.porSucursal
                              ? item.porSucursal.map((s) => `${s.sucursal}: ${formatQuantity(s.stock)}`)
                              : []),
                          ].join(" · "),
                        }))}
                      />
                    )}
                  </AdminCard>
                  <AdminCard
                    description="En qué categorías está invertido el valor del inventario."
                    title="Valor por categoría"
                  >
                    {panel.valorCategoria.length === 0 ? (
                      <EmptyState
                        className="border-0 bg-transparent py-8"
                        description="Aún no hay existencias valorizadas por categoría en el alcance elegido."
                        icon={Package}
                        title="Sin datos para graficar"
                      />
                    ) : (
                      <DonutChart
                        etiquetaAccesible="Distribución del valor del inventario por categoría"
                        formato={(valor) => formatCurrency(valor, { currency: context.currency })}
                        puntos={panel.valorCategoria.map((item) => ({
                          etiqueta: item.categoria,
                          valor: item.valor,
                        }))}
                      />
                    )}
                  </AdminCard>
                </div>
              </>
            )}
          </AdminSection>

          <AdminSection title="Existencias">
            <AdminCard className="overflow-hidden p-0 sm:p-0">
              <div className="px-4 pt-4">
                <FormTabs
                  tabs={[
                    {
                      id: "retail",
                      label: `Retail${alertas(retail) ? ` · ${alertas(retail)} bajo` : ""}`,
                      content: (
                        <>
                          {stockCards(retail)}
                          {stockTable(retail)}
                        </>
                      ),
                    },
                    {
                      id: "backbar",
                      label: `Backbar${alertas(backbar) ? ` · ${alertas(backbar)} bajo` : ""}`,
                      content: (
                        <div className="space-y-4">
                          {stockCards(backbar)}
                          {stockTable(backbar)}
                          <div className="border-t border-border px-4 pb-4 pt-3">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-primary">
                              Consumo por servicio · 30 días
                            </h4>
                            {consumoPorServicio.length === 0 ? (
                              <p className="mt-2 text-sm text-muted-foreground">
                                Sin consumo registrado. Vincula insumos a servicios para ver la demanda de cabina.
                              </p>
                            ) : (
                              <ul className="mt-2 space-y-1.5">
                                {consumoPorServicio.map((row, i) => (
                                  <li className="flex items-baseline justify-between gap-3 text-sm" key={i}>
                                    <span className="text-muted-foreground">
                                      {row.servicio} <span className="text-xs text-muted-foreground">· {row.insumo}</span>
                                    </span>
                                    <span className="font-semibold tabular-nums text-foreground">
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
              <div className="space-y-3 p-4 md:hidden">
                {movimientos.map((movimiento) => {
                  const cantidad = Number(movimiento.cantidad);
                  return (
                    <article className="rounded-xl border border-border p-4" key={movimiento.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold leading-5 text-foreground">{movimiento.productoNombre}</h3>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            {movimiento.sku} · {formatDateTime(movimiento.createdAt, { timeZone })}
                          </p>
                        </div>
                        <StatusBadge tone={cantidad >= 0 ? "success" : "destructive"}>{TIPO_LABEL[movimiento.tipo] ?? movimiento.tipo}</StatusBadge>
                      </div>
                      <dl className="mt-3 space-y-1.5">
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <dt className="shrink-0 text-xs text-muted-foreground">Cantidad</dt>
                          <dd className="min-w-0 text-right font-medium tabular-nums text-foreground">
                            {cantidad > 0 ? "+" : ""}{cantidad.toFixed(3)}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <dt className="shrink-0 text-xs text-muted-foreground">Stock final</dt>
                          <dd className="min-w-0 text-right text-xs tabular-nums text-muted-foreground">{Number(movimiento.stockResultante).toFixed(3)}</dd>
                        </div>
                        {movimiento.notas ? (
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <dt className="shrink-0 text-xs text-muted-foreground">Notas</dt>
                            <dd className="min-w-0 truncate text-right text-xs text-muted-foreground" title={movimiento.notas}>{movimiento.notas}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </article>
                  );
                })}
                {movimientos.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos en esta sucursal.</p>
                ) : null}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Fecha</th>
                      <th className="px-4 py-3 font-medium">Producto</th>
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                      <th className="px-4 py-3 text-right font-medium">Stock final</th>
                      <th className="px-4 py-3 font-medium">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {movimientos.map((movimiento) => {
                      const cantidad = Number(movimiento.cantidad);
                      return (
                        <tr className="hover:bg-muted/60" key={movimiento.id}>
                          <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(movimiento.createdAt, { timeZone })}</td>
                          <td className="px-4 py-3 text-xs">{movimiento.sku} · {movimiento.productoNombre}</td>
                          <td className="px-4 py-3"><StatusBadge tone={cantidad >= 0 ? "success" : "destructive"}>{TIPO_LABEL[movimiento.tipo] ?? movimiento.tipo}</StatusBadge></td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums">{cantidad > 0 ? "+" : ""}{cantidad.toFixed(3)}</td>
                          <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">{Number(movimiento.stockResultante).toFixed(3)}</td>
                          <td className="max-w-44 truncate px-4 py-3 text-xs text-muted-foreground" title={movimiento.notas ?? ""}>{movimiento.notas ?? "—"}</td>
                        </tr>
                      );
                    })}
                    {movimientos.length === 0 ? (
                      <tr><td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={6}>Sin movimientos en esta sucursal.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </AdminCard>
          </AdminSection>
        </div>

      </div>

      {params.nuevo === "movimiento" || (Array.isArray(params.nuevo) && params.nuevo.includes("movimiento")) ? (
        <FormSheet
          closeHref={buildAdminHref("/inventario", { organizationId, sucursalId: branch.id })}
          description="Entrada suma stock; salida resta; ajuste registra el conteo físico."
          title="Registrar movimiento"
        >
          <MovimientoForm
            organizationId={organizationId ?? organization.id}
            productos={catalogoProductos}
            sucursalId={branch.id}
          />
        </FormSheet>
      ) : null}
    </div>
  );
}
