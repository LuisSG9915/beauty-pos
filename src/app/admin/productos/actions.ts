"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { productos } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";

const productSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  categoriaId: z.string().uuid().optional().or(z.literal("")),
  unidadMedidaId: z.string().uuid().optional().or(z.literal("")),
  sku: z.string().trim().min(1).max(80),
  codigoBarras: z.string().trim().max(80).optional().or(z.literal("")),
  nombre: z.string().trim().min(2).max(160),
  descripcion: z.string().trim().max(4000).optional().or(z.literal("")),
  tipo: z.enum(["producto", "insumo", "ambos"]),
  costo: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Usa un costo válido con máximo dos decimales."),
  precioVenta: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Usa un precio válido con máximo dos decimales."),
  stockMinimo: z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "Usa un valor válido con máximo tres decimales."),
  visiblePos: z.string().optional(),
});

export type ProductActionState = { error?: string; success?: boolean };

export async function saveProduct(_previousState: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const result = productSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa los datos del producto." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();
  const conditions = [eq(productos.organizacionId, input.organizacionId), eq(productos.sku, input.sku)];
  if (input.id) conditions.push(ne(productos.id, input.id));
  const duplicate = await db.select({ id: productos.id }).from(productos).where(and(...conditions)).limit(1);
  if (duplicate.length > 0) return { error: "Ya existe un producto con ese SKU en la organización." };

  const values = {
    organizacionId: input.organizacionId,
    categoriaId: input.categoriaId || null,
    unidadMedidaId: input.unidadMedidaId || null,
    sku: input.sku,
    codigoBarras: input.codigoBarras || null,
    nombre: input.nombre,
    descripcion: input.descripcion || null,
    tipo: input.tipo,
    costo: input.costo,
    precioVenta: input.precioVenta,
    stockMinimo: input.stockMinimo,
    visiblePos: input.visiblePos === "true",
    updatedBy: user.id,
  };

  if (input.id) await db.update(productos).set(values).where(and(eq(productos.id, input.id), eq(productos.organizacionId, input.organizacionId)));
  else await db.insert(productos).values({ ...values, createdBy: user.id });

  revalidatePath("/admin/productos");
  return { success: true };
}

export async function toggleProduct(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(productos).set({ activo: !active, updatedBy: user.id }).where(and(eq(productos.id, id), eq(productos.organizacionId, organizationId)));
  revalidatePath("/admin/productos");
}
