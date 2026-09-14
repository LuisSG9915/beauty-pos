"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catCategoriasServicios } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";

const categorySchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo."),
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
  const conditions = [eq(catCategoriasServicios.organizacionId, input.organizacionId), eq(catCategoriasServicios.clave, input.clave)];
  if (input.id) conditions.push(ne(catCategoriasServicios.id, input.id));
  const duplicate = await db.select({ id: catCategoriasServicios.id }).from(catCategoriasServicios).where(and(...conditions)).limit(1);
  if (duplicate.length > 0) return { error: "Ya existe una categoría con esa clave." };

  const values = { organizacionId: input.organizacionId, clave: input.clave, nombre: input.nombre, descripcion: input.descripcion || null, updatedBy: user.id };
  if (input.id) await db.update(catCategoriasServicios).set(values).where(and(eq(catCategoriasServicios.id, input.id), eq(catCategoriasServicios.organizacionId, input.organizacionId)));
  else await db.insert(catCategoriasServicios).values({ ...values, createdBy: user.id });
  revalidatePath("/admin/categorias-servicios");
  revalidatePath("/admin/servicios");
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
}
