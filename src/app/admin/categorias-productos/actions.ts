"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catCategoriasProductos } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import { claveDisponible } from "@/lib/clave";

const categorySchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo.").optional().or(z.literal("")),
  nombre: z.string().trim().min(2).max(120),
});

export type ProductCategoryActionState = { error?: string; success?: boolean };

export async function saveProductCategory(_previousState: ProductCategoryActionState, formData: FormData): Promise<ProductCategoryActionState> {
  const result = categorySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa la categoría." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();
  // Clave manual (opcional): el único (org, clave) no filtra por activo —
  // el chequeo cubre inactivas e ignora mayúsculas (claves históricas).
  const claveManual = input.clave || undefined;
  if (claveManual) {
    const conditions = [eq(catCategoriasProductos.organizacionId, input.organizacionId), eq(sql`lower(${catCategoriasProductos.clave})`, claveManual.toLowerCase())];
    if (input.id) conditions.push(ne(catCategoriasProductos.id, input.id));
    const duplicate = await db.select({ id: catCategoriasProductos.id }).from(catCategoriasProductos).where(and(...conditions)).limit(1);
    if (duplicate.length > 0) return { error: "Ya existe una categoría con esa clave." };
  }

  const values = { organizacionId: input.organizacionId, nombre: input.nombre, updatedBy: user.id };
  if (input.id) {
    await db.update(catCategoriasProductos).set(claveManual ? { ...values, clave: claveManual } : values).where(and(eq(catCategoriasProductos.id, input.id), eq(catCategoriasProductos.organizacionId, input.organizacionId)));
  } else {
    const clave = claveManual ?? (await claveDisponible(db, catCategoriasProductos, input.organizacionId, input.nombre, 60));
    await db.insert(catCategoriasProductos).values({ ...values, clave, createdBy: user.id });
  }
  revalidatePath("/admin/categorias-productos");
  revalidatePath("/admin/productos");
  revalidateCatalogos(input.organizacionId);
  return { success: true };
}

export async function toggleProductCategory(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(catCategoriasProductos).set({ activo: !active, updatedBy: user.id }).where(and(eq(catCategoriasProductos.id, id), eq(catCategoriasProductos.organizacionId, organizationId)));
  revalidatePath("/admin/categorias-productos");
  revalidatePath("/admin/productos");
  revalidateCatalogos(organizationId);
}
