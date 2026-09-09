"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catCategoriasProductos } from "@/db/schema/catalogs";
import { requireOrganizationAccess } from "@/lib/auth/access";

const categorySchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo."),
  nombre: z.string().trim().min(2).max(120),
});

export type ProductCategoryActionState = { error?: string; success?: boolean };

export async function saveProductCategory(_previousState: ProductCategoryActionState, formData: FormData): Promise<ProductCategoryActionState> {
  const result = categorySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa la categoría." };
  const input = result.data;
  const { user } = await requireOrganizationAccess(input.organizacionId);
  const db = getDatabase();
  const conditions = [eq(catCategoriasProductos.organizacionId, input.organizacionId), eq(catCategoriasProductos.clave, input.clave)];
  if (input.id) conditions.push(ne(catCategoriasProductos.id, input.id));
  const duplicate = await db.select({ id: catCategoriasProductos.id }).from(catCategoriasProductos).where(and(...conditions)).limit(1);
  if (duplicate.length > 0) return { error: "Ya existe una categoría con esa clave." };

  const values = { organizacionId: input.organizacionId, clave: input.clave, nombre: input.nombre, updatedBy: user.id };
  if (input.id) await db.update(catCategoriasProductos).set(values).where(and(eq(catCategoriasProductos.id, input.id), eq(catCategoriasProductos.organizacionId, input.organizacionId)));
  else await db.insert(catCategoriasProductos).values({ ...values, createdBy: user.id });
  revalidatePath("/admin/categorias-productos");
  revalidatePath("/admin/productos");
  return { success: true };
}

export async function toggleProductCategory(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const { user } = await requireOrganizationAccess(organizationId);
  const db = getDatabase();
  await db.update(catCategoriasProductos).set({ activo: !active, updatedBy: user.id }).where(and(eq(catCategoriasProductos.id, id), eq(catCategoriasProductos.organizacionId, organizationId)));
  revalidatePath("/admin/categorias-productos");
  revalidatePath("/admin/productos");
}
