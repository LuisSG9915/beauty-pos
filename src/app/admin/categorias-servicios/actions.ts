"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catCategoriasServicios } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import { claveDisponible } from "@/lib/clave";

const categorySchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo.").optional().or(z.literal("")),
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(500).optional().or(z.literal("")),
});

export type CategoryActionState = { error?: string; success?: boolean };

export async function saveServiceCategory(_previousState: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  const result = categorySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa la categoría." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();
  // Clave manual (opcional): se respeta y se verifica contra el único
  // (org, clave), que no filtra por activo — el chequeo cubre inactivas e
  // ignora mayúsculas (hay claves históricas en mayúscula).
  const claveManual = input.clave || undefined;
  if (claveManual) {
    const conditions = [eq(catCategoriasServicios.organizacionId, input.organizacionId), eq(sql`lower(${catCategoriasServicios.clave})`, claveManual.toLowerCase())];
    if (input.id) conditions.push(ne(catCategoriasServicios.id, input.id));
    const duplicate = await db.select({ id: catCategoriasServicios.id }).from(catCategoriasServicios).where(and(...conditions)).limit(1);
    if (duplicate.length > 0) return { error: "Ya existe una categoría con esa clave." };
  }

  const values = { organizacionId: input.organizacionId, nombre: input.nombre, descripcion: input.descripcion || null, updatedBy: user.id };
  if (input.id) {
    // En edición una clave vacía conserva la actual.
    await db.update(catCategoriasServicios).set(claveManual ? { ...values, clave: claveManual } : values).where(and(eq(catCategoriasServicios.id, input.id), eq(catCategoriasServicios.organizacionId, input.organizacionId)));
  } else {
    const clave = claveManual ?? (await claveDisponible(db, catCategoriasServicios, input.organizacionId, input.nombre, 60));
    await db.insert(catCategoriasServicios).values({ ...values, clave, createdBy: user.id });
  }
  revalidatePath("/admin/categorias-servicios");
  revalidatePath("/admin/servicios");
  revalidateCatalogos(input.organizacionId);
  return { success: true };
}

export async function toggleServiceCategory(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(catCategoriasServicios).set({ activo: !active, updatedBy: user.id }).where(and(eq(catCategoriasServicios.id, id), eq(catCategoriasServicios.organizacionId, organizationId)));
  revalidatePath("/admin/categorias-servicios");
  revalidatePath("/admin/servicios");
  revalidateCatalogos(organizationId);
}
