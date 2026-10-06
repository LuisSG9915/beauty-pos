import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { CompraDetalle } from "@/app/admin/compras/[id]/compra-detalle";
import { AdminPageHeader } from "@/components/admin/page-header";
import { getDatabase } from "@/db/client";
import { catCategoriasProductos, catUnidadesMedida, productos } from "@/db/schema/catalogs";
import { compras, detalleCompras, proveedores, type CompraEstado } from "@/db/schema/compras";
import { medios } from "@/db/schema/media";
import { usuarios } from "@/db/schema/core";
import { getAdminContext, type AdminSearchParams } from "@/lib/admin-context";
import { canAccessBranch, hasPermission, requireAccessPermission } from "@/lib/auth/authorization";
import { getAi } from "@/lib/ia/cliente";
import { urlMedio } from "@/lib/media";
import { buildAdminHref, firstParam } from "@/lib/url-context";

export const dynamic = "force-dynamic";

type SearchParams = Promise<AdminSearchParams>;
type Params = Promise<{ id: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const [compra] = await db
    .select({
      id: compras.id,
      sucursalId: compras.sucursalId,
      estado: compras.estado,
      proveedorId: compras.proveedorId,
      proveedorNombre: proveedores.nombre,
      proveedorTexto: compras.proveedorTexto,
      folio: compras.folio,
      fechaCompra: compras.fechaCompra,
      totalTicket: compras.totalTicket,
      totalCalculado: compras.totalCalculado,
      medioTicketId: compras.medioTicketId,
      medioClaveR2: medios.claveR2,
      analisisIa: compras.analisisIa,
      analisisError: compras.analisisError,
      observaciones: compras.observaciones,
      actualizarCostos: compras.actualizarCostos,
      recibidaPorNombre: usuarios.nombre,
      recibidaAt: compras.recibidaAt,
      createdAt: compras.createdAt,
    })
    .from(compras)
    .leftJoin(proveedores, eq(compras.proveedorId, proveedores.id))
    .leftJoin(medios, eq(compras.medioTicketId, medios.id))
    .leftJoin(usuarios, eq(compras.recibidaPor, usuarios.id))
    .where(
      and(
        eq(compras.id, id),
        eq(compras.organizacionId, organization.id),
        eq(compras.activo, true),
      ),
    )
    .limit(1);

  if (!compra) notFound();
  // La compra pertenece a una sucursal: fuera del alcance del usuario no se ve.
  if (!canAccessBranch(context.access, compra.sucursalId)) {
    redirect(buildAdminHref("/compras", { organizationId }));
  }

  const [lineas, proveedoresOrg, productosOrg, categories, units] = await Promise.all([
    db
      .select({
        id: detalleCompras.id,
        productoId: detalleCompras.productoId,
        productoNombre: productos.nombre,
        descripcion: detalleCompras.descripcion,
        cantidad: detalleCompras.cantidad,
        cantidadRecibida: detalleCompras.cantidadRecibida,
        costoUnitario: detalleCompras.costoUnitario,
        importe: detalleCompras.importe,
        observacion: detalleCompras.observacion,
        origen: detalleCompras.origen,
      })
      .from(detalleCompras)
      .leftJoin(productos, eq(detalleCompras.productoId, productos.id))
      .where(and(eq(detalleCompras.compraId, compra.id), eq(detalleCompras.activo, true)))
      .orderBy(asc(detalleCompras.createdAt)),
    db
      .select({ id: proveedores.id, nombre: proveedores.nombre })
      .from(proveedores)
      .where(and(eq(proveedores.organizacionId, organization.id), eq(proveedores.activo, true)))
      .orderBy(asc(proveedores.nombre)),
    db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        sku: productos.sku,
        codigoBarras: productos.codigoBarras,
      })
      .from(productos)
      .where(and(eq(productos.organizacionId, organization.id), eq(productos.activo, true)))
      .orderBy(asc(productos.nombre)),
    db
      .select({ id: catCategoriasProductos.id, nombre: catCategoriasProductos.nombre })
      .from(catCategoriasProductos)
      .where(and(eq(catCategoriasProductos.organizacionId, organization.id), eq(catCategoriasProductos.activo, true)))
      .orderBy(asc(catCategoriasProductos.nombre)),
    db
      .select({ id: catUnidadesMedida.id, nombre: catUnidadesMedida.nombre })
      .from(catUnidadesMedida)
      .where(and(eq(catUnidadesMedida.organizacionId, organization.id), eq(catUnidadesMedida.activo, true)))
      .orderBy(asc(catUnidadesMedida.nombre)),
  ]);

  const sucursalNombre =
    context.branches.find((sucursal) => sucursal.id === compra.sucursalId)?.nombre ?? "";

  // Dudas ya enriquecidas por el post-proceso (incluye renglones descartados).
  const analisis = compra.analisisIa as { dudas?: unknown } | null;
  const dudas = Array.isArray(analisis?.dudas)
    ? (analisis!.dudas as unknown[]).filter((duda): duda is string => typeof duda === "string")
    : [];

  const autoAnalizar =
    firstParam(paramsQ.analizar) === "1" && compra.estado === "borrador" && Boolean(compra.medioTicketId);

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
