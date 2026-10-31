"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { productos } from "@/db/schema/catalogs";
import { checkPermission, hasPermission, sucursalesActivasDelAcceso } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import { claveDisponible } from "@/lib/clave";
import { leerSucursalCookie } from "@/lib/sucursal-cookie";
import { applyInventoryMovement } from "@/modules/inventory";

// Defaults del alta rápida: el servidor completa lo que el formulario corto
// no pide (tipo `producto`, costo 0, stock mínimo 0, visiblePos=true).
const productSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  categoriaId: z.string().uuid().optional().or(z.literal("")),
  unidadMedidaId: z.string().uuid().optional().or(z.literal("")),
  sku: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  codigoBarras: z.string().trim().max(80).optional().or(z.literal("")),
  nombre: z.string().trim().min(2).max(160),
  descripcion: z.string().trim().max(4000).optional().or(z.literal("")),
  tipo: z.enum(["producto", "insumo", "ambos"]).optional(),
  costo: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Usa un costo válido con máximo dos decimales.").optional().or(z.literal("")),
  precioVenta: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Usa un precio válido con máximo dos decimales."),
  stockInicial: z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "Usa una cantidad válida con máximo tres decimales.").optional().or(z.literal("")),
  stockMinimo: z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "Usa un valor válido con máximo tres decimales.").optional().or(z.literal("")),
  visiblePos: z.string().optional(),
});

export type ProductActionState = {
  error?: string;
  success?: boolean;
  /** Aviso a mostrar en la confirmación extra de la baja. */
  warning?: string;
  /** La baja requiere confirmación porque el producto tiene ventas. */
  needsConfirm?: boolean;
  /**
   * Id del producto tras guardar (alta o edición). La captura IA lo usa para
   * subir la foto como imagen principal una vez persistido el producto.
   */
  createdId?: string;
};

/** Error interno: revierte la transacción del alta cuando falla el stock inicial. */
class StockInicialError extends Error {}

export async function saveProduct(_previousState: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const result = productSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa los datos del producto." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();
  // El costo es un dato financiero: solo lo modifica quien tiene
  // `reportes.financieros` (sin el permiso el formulario ni lo renderiza).
  const puedeVerFinanzas = hasPermission(access, "reportes.financieros");
  // SKU manual (opcional): el único (org, sku) no filtra por activo — el
  // chequeo cubre inactivas e ignora mayúsculas (skus históricos).
  const skuManual = input.sku || undefined;
  if (skuManual) {
    const conditions = [eq(productos.organizacionId, input.organizacionId), eq(sql`lower(${productos.sku})`, skuManual.toLowerCase())];
    if (input.id) conditions.push(ne(productos.id, input.id));
    const duplicate = await db.select({ id: productos.id }).from(productos).where(and(...conditions)).limit(1);
    if (duplicate.length > 0) return { error: "Ya existe un producto con ese SKU en la organización." };
  }

  const values = {
    organizacionId: input.organizacionId,
    categoriaId: input.categoriaId || null,
    unidadMedidaId: input.unidadMedidaId || null,
    codigoBarras: input.codigoBarras || null,
    nombre: input.nombre,
    descripcion: input.descripcion || null,
    tipo: input.tipo ?? "producto",
    precioVenta: input.precioVenta,
    stockMinimo: input.stockMinimo || "0",
    visiblePos: input.visiblePos === "true",
    updatedBy: user.id,
  };

  let createdId = input.id || "";
  if (input.id) {
    // En edición `costo` solo se escribe con permiso financiero y cuando el
    // formulario lo envía; si no, se conserva el valor ya guardado.
    await db
      .update(productos)
      .set({
        ...values,
        ...(puedeVerFinanzas && input.costo !== undefined ? { costo: input.costo || "0" } : {}),
        ...(skuManual ? { sku: skuManual } : {}),
      })
      .where(and(eq(productos.id, input.id), eq(productos.organizacionId, input.organizacionId)));
  } else {
    const sku = skuManual ?? (await claveDisponible(db, productos, input.organizacionId, input.nombre, 80));
    // El stock inicial del alta rápida entra como movimiento "entrada" sobre
    // la sucursal efectiva (cookie preferida válida → primera del alcance),
    // en la misma transacción que el alta para no dejar medios datos.
    const stockInicial = Number(input.stockInicial || "0");
    let sucursalId: string | undefined;
    if (stockInicial > 0) {
      const sucursalesAcceso = await sucursalesActivasDelAcceso(access);
      const preferidaId = await leerSucursalCookie(input.organizacionId);
      sucursalId =
        (preferidaId ? sucursalesAcceso.find((sucursal) => sucursal.id === preferidaId) : undefined)?.id ??
        sucursalesAcceso[0]?.id;
      if (!sucursalId) {
        return { error: "No hay una sucursal activa para recibir el stock inicial. Registra el producto con stock en cero y ajústalo desde Inventario." };
      }
    }
    try {
      createdId = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(productos)
          .values({ ...values, costo: puedeVerFinanzas ? input.costo || "0" : "0", sku, createdBy: user.id })
          .returning({ id: productos.id });
        if (created && stockInicial > 0 && sucursalId) {
          const outcome = await applyInventoryMovement(tx, {
            organizacionId: input.organizacionId,
            sucursalId,
            productoId: created.id,
            tipo: "entrada",
            cantidad: stockInicial,
            notas: "Stock inicial al dar de alta el producto.",
            userId: user.id,
          });
          if (!outcome.success) {
            throw new StockInicialError(outcome.error ?? "No se pudo registrar el stock inicial.");
          }
        }
        return created.id;
      });
    } catch (error) {
      if (error instanceof StockInicialError) return { error: error.message };
      throw error;
    }
  }

  revalidatePath("/admin/productos");
  revalidateCatalogos(input.organizacionId);
  return { success: true, createdId };
}

const toggleProductSchema = z.object({
  organizacionId: z.string().uuid(),
  id: z.string().uuid(),
  activar: z.enum(["true", "false"]),
  confirmado: z.string().optional(),
});

/**
 * Activa u oculta un producto. Al ocultar (`activar=false`) pide confirmación
 * extra cuando el producto ya tiene ventas registradas: responde
 * `needsConfirm` sin tocar la fila y el cliente reintenta con `confirmado`.
 */
export async function toggleProduct(formData: FormData): Promise<ProductActionState> {
  const parsed = toggleProductSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Solicitud inválida." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();

  if (input.activar === "false" && input.confirmado !== "true") {
    const { rows } = await db.execute<{ tieneVentas: boolean }>(sql`
      select exists(
        select 1
          from detalle_ventas_productos d
          join ventas v on v.id = d.venta_id
         where d.producto_id = ${input.id}
           and d.activo
           and v.activo
           and v.organizacion_id = ${input.organizacionId}
      ) as "tieneVentas"
    `);
    if (rows[0]?.tieneVentas) {
      return { needsConfirm: true, warning: "Este producto tiene ventas registradas." };
    }
  }

  await db
    .update(productos)
    .set({ activo: input.activar === "true", updatedBy: user.id })
    .where(and(eq(productos.id, input.id), eq(productos.organizacionId, input.organizacionId)));
  revalidatePath("/admin/productos");
  revalidateCatalogos(input.organizacionId);
  return { success: true };
}
