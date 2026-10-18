import { sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { CompraDetalle, type CompraLineaVista } from "@/app/admin/compras/[id]/compra-detalle";
import { AdminPageHeader } from "@/components/admin/page-header";
import { getDatabase } from "@/db/client";
import { canAccessBranch, hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import type { CompraEstado } from "@/db/schema/compras";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { getAi } from "@/lib/ia/cliente";
import { urlMedio } from "@/lib/media";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;
type Params = Promise<{ id: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CompraCabeceraJson = {
  id: string;
  sucursalId: string;
  estado: string;
  proveedorId: string | null;
  proveedorNombre: string | null;
  proveedorTexto: string | null;
  folio: string | null;
  fechaCompra: string | null;
  totalTicket: string | null;
  totalCalculado: string;
  medioClaveR2: string | null;
  analisisIa: unknown;
  analisisError: string | null;
  observaciones: string | null;
  actualizarCostos: boolean;
  recibidaPorNombre: string | null;
  recibidaAt: string | null;
  createdAt: string;
};

/**
 * Detalle de la compra (plan 10): foto del ticket a la izquierda (escritorio)
 * o colapsable (móvil), datos del documento, líneas editables con
 * emparejamiento de producto y la recepción que da entrada al inventario.
 * `?analizar=1` (llega desde "Nueva compra") dispara la lectura con IA al
 * montar el cliente.
 */
export default async function CompraDetallePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ id }, paramsQ] = await Promise.all([params, searchParams]);
  const context = await getAdminContext(paramsQ);
  const { organization, organizationId } = context;

  if (!organization) notFound();
  requireAccessPermission(context.access, "compras.ver");
  if (!UUID_RE.test(id)) notFound();

  const db = getDatabase();
  type CompraSqlRow = {
    compra: CompraCabeceraJson | null;
    lineas: Array<{
      id: string;
      productoId: string | null;
      productoNombre: string | null;
      descripcion: string | null;
      cantidad: string;
      cantidadRecibida: string | null;
      costoUnitario: string;
      importe: string;
      observacion: string | null;
      origen: string | null;
    }>;
    proveedores: Array<{ id: string; nombre: string }>;
    productos: Array<{ id: string; nombre: string; sku: string; codigoBarras: string | null }>;
    categorias: Array<{ id: string; nombre: string }>;
    unidades: Array<{ id: string; nombre: string }>;
  };

  // Cabecera + líneas + catálogos auxiliares en UNA sola consulta SQL (antes
  // 6 consultas en 2 rondas secuenciales).
  const { rows: sqlRows } = await db.execute<CompraSqlRow>(sql`
    select
      (
        select jsonb_build_object(
          'id', c.id,
          'sucursalId', c.sucursal_id,
          'estado', c.estado,
          'proveedorId', c.proveedor_id,
          'proveedorNombre', pr.nombre,
          'proveedorTexto', c.proveedor_texto,
          'folio', c.folio,
          'fechaCompra', c.fecha_compra::text,
          'totalTicket', c.total_ticket::text,
          'totalCalculado', c.total_calculado::text,
          'medioClaveR2', m.clave_r2,
          'analisisIa', c.analisis_ia,
          'analisisError', c.analisis_error,
          'observaciones', c.observaciones,
          'actualizarCostos', c.actualizar_costos,
          'recibidaPorNombre', u.nombre,
          'recibidaAt', case when c.recibida_at is null then null
            else to_char(c.recibida_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
          'createdAt', to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
        from compras c
        left join proveedores pr on pr.id = c.proveedor_id
        left join medios m on m.id = c.medio_ticket_id
        left join usuarios u on u.id = c.recibida_por
        where c.id = ${id}
          and c.organizacion_id = ${organization.id}
          and c.activo = true
        limit 1
      ) as compra,
      coalesce((
        select jsonb_agg(t) from (
          select
            dc.id,
            dc.producto_id as "productoId",
            p.nombre as "productoNombre",
            dc.descripcion,
            dc.cantidad::text as cantidad,
            dc.cantidad_recibida::text as "cantidadRecibida",
            dc.costo_unitario::text as "costoUnitario",
            dc.importe::text as importe,
            dc.observacion,
            dc.origen
          from detalle_compras dc
          left join productos p on p.id = dc.producto_id
          where dc.compra_id = ${id} and dc.activo = true
          order by dc.created_at asc
        ) t
      ), '[]'::jsonb) as lineas,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', pr2.id, 'nombre', pr2.nombre) order by pr2.nombre)
        from proveedores pr2
        where pr2.organizacion_id = ${organization.id} and pr2.activo = true
      ), '[]'::jsonb) as proveedores,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', p2.id, 'nombre', p2.nombre, 'sku', p2.sku, 'codigoBarras', p2.codigo_barras) order by p2.nombre)
        from productos p2
        where p2.organizacion_id = ${organization.id} and p2.activo = true
      ), '[]'::jsonb) as productos,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', cp.id, 'nombre', cp.nombre) order by cp.nombre)
        from cat_categorias_productos cp
        where cp.organizacion_id = ${organization.id} and cp.activo = true
      ), '[]'::jsonb) as categorias,
      coalesce((
        select jsonb_agg(jsonb_build_object('id', um.id, 'nombre', um.nombre) order by um.nombre)
        from cat_unidades_medida um
        where um.organizacion_id = ${organization.id} and um.activo = true
      ), '[]'::jsonb) as unidades
  `);

  const datos = sqlRows[0];
  const compra = datos?.compra
    ? {
        ...datos.compra,
        recibidaAt: datos.compra.recibidaAt ? new Date(datos.compra.recibidaAt) : null,
        createdAt: new Date(datos.compra.createdAt),
      }
    : null;

  if (!compra) notFound();
  // La compra pertenece a una sucursal: fuera del alcance del usuario no se ve.
  if (!canAccessBranch(context.access, compra.sucursalId)) {
    redirect(buildAdminHref("/compras", { organizationId }));
  }

  const lineas: CompraLineaVista[] = (datos?.lineas ?? []).map((l) => ({
    ...l,
    descripcion: l.descripcion ?? "",
    origen: l.origen ?? "manual",
  }));
  const proveedoresOrg = datos?.proveedores ?? [];
  const productosOrg = datos?.productos ?? [];
  const categories = datos?.categorias ?? [];
  const units = datos?.unidades ?? [];

  const sucursalNombre =
    context.branches.find((sucursal) => sucursal.id === compra.sucursalId)?.nombre ?? "";

  // Dudas ya enriquecidas por el post-proceso (incluye renglones descartados).
  const analisis = compra.analisisIa as { dudas?: unknown } | null;
  const dudas = Array.isArray(analisis?.dudas)
    ? (analisis!.dudas as unknown[]).filter((duda): duda is string => typeof duda === "string")
    : [];

  const autoAnalizar =
    firstParam(paramsQ.analizar) === "1" && compra.estado === "borrador" && Boolean(compra.medioClaveR2);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          {
            label: "Compras",
            href: buildAdminHref("/compras", { organizationId, sucursalId: compra.sucursalId }),
          },
          { label: compra.folio ? `Folio ${compra.folio}` : "Detalle de compra" },
        ]}
        description={`${sucursalNombre} · revisa el ticket, empareja las líneas y registra lo que llegó.`}
        title="Detalle de compra"
      />
      <CompraDetalle
        autoAnalizar={autoAnalizar}
        capturaIa={Boolean(getAi())}
        categories={categories}
        compra={{
          id: compra.id,
          sucursalId: compra.sucursalId,
          estado: compra.estado as CompraEstado,
          proveedorId: compra.proveedorId,
          proveedorNombre: compra.proveedorNombre,
          proveedorTexto: compra.proveedorTexto,
          folio: compra.folio,
          fechaCompra: compra.fechaCompra,
          totalTicket: compra.totalTicket,
          totalCalculado: compra.totalCalculado,
          medioUrl: compra.medioClaveR2 ? urlMedio(compra.medioClaveR2) : null,
          analisisError: compra.analisisError,
          observaciones: compra.observaciones,
          actualizarCostos: compra.actualizarCostos,
          recibidaPorNombre: compra.recibidaPorNombre,
          recibidaAt: compra.recibidaAt?.toISOString() ?? null,
          creadaAt: compra.createdAt.toISOString(),
          dudas,
        }}
        currency={context.currency}
        lineas={lineas}
        organizacionId={organization.id}
        puedeEditar={hasPermission(context.access, "compras.editar")}
        // El alta rápida exige `catalogos.editar` (plan 03); sin él el
        // combobox solo permite emparejar productos existentes.
        puedeCrearProducto={hasPermission(context.access, "catalogos.editar")}
        puedeRecibir={hasPermission(context.access, "compras.recibir")}
        productos={productosOrg}
        proveedores={proveedoresOrg}
        sucursalId={compra.sucursalId}
        units={units}
      />
    </div>
  );
}
