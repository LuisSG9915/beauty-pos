import { sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { toggleProduct } from "@/app/admin/productos/actions";
import { ProductForm } from "@/app/admin/productos/product-form";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FormSheet } from "@/components/admin/form-sheet";
import { AdminNavTabs, CATALOGO_TABS } from "@/components/admin/admin-nav-tabs";
import { AdminCard, AdminPageHeader } from "@/components/admin/page-header";
import { RegistroCard, RegistroList } from "@/components/admin/registro-lista";
import { ToggleActivo } from "@/components/admin/toggle-activo";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { getDatabase } from "@/db/client";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { requireAccessPermission } from "@/lib/auth/authorization";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import { getAi } from "@/lib/ia/cliente";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;

const TIPO_LABEL: Record<string, string> = { producto: "Producto", insumo: "Insumo", ambos: "Ambos" };

/** Margen sobre el precio de venta ((precio - costo) / precio) en porcentaje. */
function margenPorcentaje(costo: string, precioVenta: string): number | null {
  const precio = Number(precioVenta);
  if (!Number.isFinite(precio) || precio <= 0) return null;
  return ((precio - Number(costo)) / precio) * 100;
}

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const context = await getAdminContext(params, { loadBranches: false });
  if (!context.organization) notFound();
  requireAccessPermission(context.access, "catalogos.ver");
  const organizationId = context.organization.id;
  const db = getDatabase();

  const query = firstParam(params.q) ?? "";
  const tipo = firstParam(params.tipo) ?? "";
  const categoriaId = firstParam(params.categoriaId) ?? "";
  const estado = firstParam(params.estado) ?? "";
  const editId = firstParam(params.edit);

  const filtroQuery = query
    ? sql` and (p.nombre ilike ${`%${query}%`} or p.sku ilike ${`%${query}%`} or p.codigo_barras ilike ${`%${query}%`})`
    : sql``;
  const filtroTipo =
    tipo === "producto" || tipo === "insumo" || tipo === "ambos"
      ? sql` and p.tipo = ${tipo}`
      : sql``;
  const filtroCategoria = categoriaId ? sql` and p.categoria_id = ${categoriaId}` : sql``;
  const filtroEstado =
    estado === "activo"
      ? sql` and p.activo = true`
      : estado === "oculto"
        ? sql` and p.activo = false`
        : sql``;

  type ProductRowItem = {
    id: string;
    sku: string;
    nombre: string;
    tipo: string;
    categoriaNombre: string | null;
    costo: string;
    precioVenta: string;
    visiblePos: boolean;
    activo: boolean;
    stockTotal: string;
  };
  type EditingProductRow = {
    id: string;
    organizacionId: string;
    categoriaId: string | null;
    unidadMedidaId: string | null;
    sku: string;
    codigoBarras: string | null;
    nombre: string;
    descripcion: string | null;
    tipo: string;
    costo: string;
    precioVenta: string;
    stockMinimo: string;
    visiblePos: boolean;
    imagenClaveR2: string | null;
    updatedAt: string | null;
  };
  type UltimaCompraRow = {
    proveedorNombre: string | null;
    proveedorTexto: string | null;
    fechaCompra: string | null;
    recibidaAt: string | null;
    cantidadRecibida: string | null;
    cantidad: string;
    costoUnitario: string;
  };
  type ProductosSqlRow = {
    categories: Array<{ id: string; nombre: string }>;
    units: Array<{ id: string; nombre: string }>;
    productos: ProductRowItem[];
    editing: EditingProductRow | null;
    ultimas_compras: UltimaCompraRow[];
  };

  // Toda la pantalla (incluyendo edición + últimas compras cuando viene
  // ?edit=) en UNA sola ronda SQL con CTEs materializados (antes hasta 5
  // consultas repartidas en 3 rondas secuenciales).
  const { rows } = await db.execute<ProductosSqlRow>(sql`
    with productos_pagina as materialized (
      select
        p.id,
        p.sku,
        p.nombre,
        p.tipo,
        cp.nombre as "categoriaNombre",
        p.costo::text as costo,
        p.precio_venta::text as "precioVenta",
        p.visible_pos as "visiblePos",
        p.activo,
        p.created_at
      from productos p
      left join cat_categorias_productos cp on cp.id = p.categoria_id
      where p.organizacion_id = ${organizationId}${filtroQuery}${filtroTipo}${filtroCategoria}${filtroEstado}
      order by p.created_at desc
      limit 100
    ),
    stock_por_producto as materialized (
      select
        i.producto_id,
        coalesce(sum(i.stock_actual), 0)::text as stock_total
      from productos_pagina pp
      join inventario_stock i on i.organizacion_id = ${organizationId} and i.producto_id = pp.id
      group by i.producto_id
    )
    select
      coalesce((
        select jsonb_agg(t) from (
          select cp.id, cp.nombre
          from cat_categorias_productos cp
          where cp.organizacion_id = ${organizationId} and cp.activo = true
          order by cp.nombre asc
        ) t
      ), '[]'::jsonb) as categories,
      coalesce((
        select jsonb_agg(t) from (
          select um.id, um.nombre
          from cat_unidades_medida um
          where um.organizacion_id = ${organizationId} and um.activo = true
          order by um.nombre asc
        ) t
      ), '[]'::jsonb) as units,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', pp.id,
            'sku', pp.sku,
            'nombre', pp.nombre,
            'tipo', pp.tipo,
            'categoriaNombre', pp."categoriaNombre",
            'costo', pp.costo,
            'precioVenta', pp."precioVenta",
            'visiblePos', pp."visiblePos",
            'activo', pp.activo,
            'stockTotal', coalesce(sp.stock_total, '0')
          )
          order by pp.created_at desc
        )
        from productos_pagina pp
        left join stock_por_producto sp on sp.producto_id = pp.id
      ), '[]'::jsonb) as productos,
      ${editId
        ? sql`(
            select jsonb_build_object(
              'id', p.id,
              'organizacionId', p.organizacion_id,
              'categoriaId', p.categoria_id,
              'unidadMedidaId', p.unidad_medida_id,
              'sku', p.sku,
              'codigoBarras', p.codigo_barras,
              'nombre', p.nombre,
              'descripcion', p.descripcion,
              'tipo', p.tipo,
              'costo', p.costo::text,
              'precioVenta', p.precio_venta::text,
              'stockMinimo', p.stock_minimo::text,
              'visiblePos', p.visible_pos,
              'imagenClaveR2', m.clave_r2,
              'updatedAt', to_char(p.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
            )
            from productos p
            left join medios m on m.id = p.imagen_principal_id
            where p.id = ${editId} and p.organizacion_id = ${organizationId}
            limit 1
          ) as editing,
          coalesce((
            select jsonb_agg(t) from (
              select
                pr.nombre as "proveedorNombre",
                c.proveedor_texto as "proveedorTexto",
                c.fecha_compra::text as "fechaCompra",
                case when c.recibida_at is null then null
                  else to_char(c.recibida_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end as "recibidaAt",
                dc.cantidad_recibida::text as "cantidadRecibida",
                dc.cantidad::text as cantidad,
                dc.costo_unitario::text as "costoUnitario"
              from detalle_compras dc
              join compras c on c.id = dc.compra_id
              left join proveedores pr on pr.id = c.proveedor_id
              where dc.producto_id = ${editId}
                and dc.organizacion_id = ${organizationId}
                and dc.activo = true
                and c.activo = true
                and c.estado = 'verificada'
              order by c.recibida_at desc nulls last, c.fecha_compra desc nulls last
              limit 5
            ) t
          ), '[]'::jsonb) as ultimas_compras`
        : sql`null as editing, '[]'::jsonb as ultimas_compras`}
  `);

  const datos = rows[0];
  const categories = datos?.categories ?? [];
  const units = datos?.units ?? [];
  const productRows = datos?.productos ?? [];
  const editing = datos?.editing
    ? {
        ...datos.editing,
        updatedAt: datos.editing.updatedAt ? new Date(datos.editing.updatedAt) : null,
      }
    : undefined;
  const editingData = editing
    ? {
        id: editing.id,
        organizacionId: editing.organizacionId,
        categoriaId: editing.categoriaId,
        unidadMedidaId: editing.unidadMedidaId,
        sku: editing.sku,
        codigoBarras: editing.codigoBarras,
        nombre: editing.nombre,
        descripcion: editing.descripcion,
        tipo: editing.tipo,
        costo: editing.costo,
        precioVenta: editing.precioVenta,
        stockMinimo: editing.stockMinimo,
        visiblePos: editing.visiblePos,
        imagenClaveR2: editing.imagenClaveR2,
      }
    : undefined;

  const ultimasCompras = (datos?.ultimas_compras ?? []).map((fila) => ({
    proveedor: fila.proveedorNombre ?? fila.proveedorTexto ?? "Sin proveedor",
    fecha: formatDate(fila.fechaCompra ?? (fila.recibidaAt ? new Date(fila.recibidaAt) : null), { timeZone: context.timeZone }),
    cantidad: formatQuantity(fila.cantidadRecibida ?? fila.cantidad),
    costo: formatCurrency(fila.costoUnitario, { currency: context.currency }),
  }));

  const preserved = { q: query || null, tipo: tipo || null, categoriaId: categoriaId || null, estado: estado || null };
  const hasFilters = Boolean(query || tipo || categoriaId || estado);

  type ProductRow = (typeof productRows)[number];
  const columns: Array<DataTableColumn<ProductRow>> = [
    {
      id: "clave",
      header: "Clave",
      cell: (product) => <span className="font-mono text-op-xs">{product.sku}</span>,
    },
    { id: "nombre", header: "Nombre", cell: (product) => <span className="font-medium">{product.nombre}</span> },
    {
      id: "categoria",
      header: "Categoría",
      cell: (product) => product.categoriaNombre ?? <span className="text-muted-foreground">—</span>,
      hideBelow: "xl",
    },
    {
      id: "tipo",
      header: "Tipo",
      cell: (product) => (
        <span className="rounded-full bg-muted/60 px-2.5 py-1 text-op-xs text-muted-foreground">
          {TIPO_LABEL[product.tipo] ?? product.tipo}
        </span>
      ),
      hideBelow: "lg",
    },
    {
      id: "costo",
      header: "Costo",
      cell: (product) => <span className="tabular-nums">{formatCurrency(product.costo, { currency: context.currency })}</span>,
      align: "right",
      hideBelow: "lg",
    },
    {
      id: "precio",
      header: "Precio",
      cell: (product) => <span className="tabular-nums">{formatCurrency(product.precioVenta, { currency: context.currency })}</span>,
      align: "right",
    },
    {
      id: "margen",
      header: "Margen",
      cell: (product) => {
        const margen = margenPorcentaje(product.costo, product.precioVenta);
        return margen === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">{Math.round(margen)}%</span>
        );
      },
      align: "right",
      hideBelow: "lg",
    },
    {
      id: "stock",
      header: "Stock total",
      cell: (product) => <span className="tabular-nums">{formatQuantity(product.stockTotal)}</span>,
      align: "right",
    },
    {
      id: "pos",
      header: "En POS",
      cell: (product) =>
        product.visiblePos ? "Sí" : <span className="text-muted-foreground">No</span>,
      hideBelow: "xl",
    },
    { id: "estado", header: "Estado", cell: (product) => <StatusBadge active={product.activo} /> },
    {
      id: "acciones",
      header: "Acciones",
      cell: (product) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60"
            data-action-id="catalogo.productos.editar"
            href={buildAdminHref("/productos", { organizationId, extra: { ...preserved, edit: product.id } })}
          >
            Editar
          </Link>
          <ToggleActivo
            action={toggleProduct}
            activo={product.activo}
            confirmHint="Dejará de aparecer en el punto de venta."
            entidad="producto"
            id={product.id}
            nombre={product.nombre}
            organizationId={organizationId}
            telemetryBase="catalogo.productos"
          />
        </div>
      ),
      align: "right",
      stickyEnd: true,
    },
  ];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={
          <>
            <Button nativeButton={false} render={<Link href={buildAdminHref("/categorias-productos", { organizationId })} />} variant="outline">
              Categorías
            </Button>
            <Button nativeButton={false} render={<Link href={buildAdminHref("/unidades-medida", { organizationId })} />} variant="outline">
              Unidades
            </Button>
            <Button
              data-action-clave="1"
              data-action-id="catalogo.productos.nuevo"
              nativeButton={false}
              render={<Link href={buildAdminHref("/productos", { organizationId, extra: { ...preserved, nuevo: "1" } })} />}
              size="lg"
            >
              Nuevo
            </Button>
          </>
        }
        description="Productos vendibles e insumos consumidos por los servicios."
        tabs={
          <AdminNavTabs
            organizationId={organizationId}
            tabs={CATALOGO_TABS}
          />
        }
        title="Productos e insumos"
      />

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4" method="get">
        <input name="organizationId" type="hidden" value={organizationId} />
        <Field className="w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <FieldLabel>Buscar</FieldLabel>
          <Input defaultValue={query} key={query} name="q" placeholder="Nombre, clave o código de barras" />
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel>Tipo</FieldLabel>
          <Select defaultValue={tipo} name="tipo">
            <option value="">Todos</option>
            <option value="producto">Producto</option>
            <option value="insumo">Insumo</option>
            <option value="ambos">Ambos</option>
          </Select>
        </Field>
        <Field className="w-full sm:w-48">
          <FieldLabel>Categoría</FieldLabel>
          <Select defaultValue={categoriaId} name="categoriaId">
            <option value="">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field className="w-full sm:w-40">
          <FieldLabel>Estado</FieldLabel>
          <Select defaultValue={estado} name="estado">
            <option value="">Todos</option>
            <option value="activo">Activos</option>
            <option value="oculto">Ocultos</option>
          </Select>
        </Field>
        <Button className="rounded-xl" type="submit">Filtrar</Button>
        {hasFilters ? (
          <Button nativeButton={false} render={<Link href={buildAdminHref("/productos", { organizationId })} />} variant="outline">
            Limpiar
          </Button>
        ) : null}
      </form>

      {hasFilters ? (
        <div className="flex flex-wrap items-center gap-2 text-op-xs text-muted-foreground">
          <span>Filtros activos:</span>
          {query ? <span className="rounded-full bg-muted/60 px-2.5 py-1">Búsqueda: {query}</span> : null}
          {tipo ? <span className="rounded-full bg-muted/60 px-2.5 py-1">Tipo: {TIPO_LABEL[tipo] ?? tipo}</span> : null}
          {categoriaId ? (
            <span className="rounded-full bg-muted/60 px-2.5 py-1">
              Categoría: {categories.find((category) => category.id === categoriaId)?.nombre ?? categoriaId}
            </span>
          ) : null}
          {estado ? <span className="rounded-full bg-muted/60 px-2.5 py-1">Estado: {estado}</span> : null}
        </div>
      ) : null}

      <AdminCard
        actions={
          <Button
            nativeButton={false}
            render={<Link href={buildAdminHref("/productos", { organizationId, extra: { ...preserved, nuevo: "1" } })} />}
            variant="outline"
          >
            Nuevo
          </Button>
        }
        description={`${productRows.length} resultado(s)`}
        title="Productos registrados"
      >
        {productRows.length === 0 ? (
          <EmptyState description="Registra productos que vendes e insumos que consumes en los servicios." title="No hay productos" />
        ) : (
          <>
            <RegistroList>
              {productRows.map((product) => (
                <RegistroCard
                  acciones={
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-op-xs text-muted-foreground hover:bg-muted/60"
                        data-action-id="catalogo.productos.editar"
                        href={buildAdminHref("/productos", { organizationId, extra: { ...preserved, edit: product.id } })}
                      >
                        Editar
                      </Link>
                      <ToggleActivo
                        action={toggleProduct}
                        activo={product.activo}
                        confirmHint="Dejará de aparecer en el punto de venta."
                        entidad="producto"
                        id={product.id}
                        nombre={product.nombre}
                        organizationId={organizationId}
                        telemetryBase="catalogo.productos"
                      />
                    </div>
                  }
                  badge={<StatusBadge active={product.activo} />}
                  campos={[
                    { label: "Tipo", value: TIPO_LABEL[product.tipo] ?? product.tipo },
                    ...(product.categoriaNombre ? [{ label: "Categoría", value: product.categoriaNombre }] : []),
                    { label: "Costo", value: formatCurrency(product.costo, { currency: context.currency }) },
                    { label: "Precio", value: formatCurrency(product.precioVenta, { currency: context.currency }) },
                    ...(margenPorcentaje(product.costo, product.precioVenta) !== null
                      ? [{ label: "Margen", value: `${Math.round(margenPorcentaje(product.costo, product.precioVenta)!)}%` }]
                      : []),
                    { label: "Stock total", value: formatQuantity(product.stockTotal) },
                    { label: "En el punto de venta", value: product.visiblePos ? "Sí" : "No" },
                  ]}
                  key={product.id}
                  subtitulo={<span className="font-mono">{product.sku}</span>}
                  titulo={product.nombre}
                />
              ))}
            </RegistroList>
            <DataTable
              className="hidden md:block"
              columns={columns}
              minWidth="980px"
              rowKey={(product) => product.id}
              rows={productRows}
            />
          </>
        )}
      </AdminCard>
      {editing || firstParam(params.nuevo) === "1" ? (
        <FormSheet
          closeHref={buildAdminHref("/productos", { organizationId, extra: preserved })}
          description={editing ? "Ajusta los datos del producto o insumo." : "Registra un producto vendible o un insumo."}
          title={editing ? "Editar producto" : "Nuevo producto"}
          wide
        >
          <ProductForm capturaIa={Boolean(getAi())} categories={categories} initial={editingData} key={`${editing?.id ?? "nuevo"}-${editing?.updatedAt?.getTime() ?? ""}`} organizationId={organizationId} ultimasCompras={ultimasCompras} units={units} />
        </FormSheet>
      ) : null}
    </div>
  );
}
