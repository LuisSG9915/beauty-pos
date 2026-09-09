"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catUnidadesMedida } from "@/db/schema/catalogs";
import { requireOrganizationAccess } from "@/lib/auth/access";

const unitSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo."),
  nombre: z.string().trim().min(2).max(80),
});

export type UnitActionState = { error?: string; success?: boolean };

export async function saveUnit(_previousState: UnitActionState, formData: FormData): Promise<UnitActionState> {
  const result = unitSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa la unidad." };
  const input = result.data;
  const { user } = await requireOrganizationAccess(input.organizacionId);
  const db = getDatabase();
  const conditions = [eq(catUnidadesMedida.organizacionId, input.organizacionId), eq(catUnidadesMedida.clave, input.clave)];
  if (input.id) conditions.push(ne(catUnidadesMedida.id, input.id));
  const duplicate = await db.select({ id: catUnidadesMedida.id }).from(catUnidadesMedida).where(and(...conditions)).limit(1);
  if (duplicate.length > 0) return { error: "Ya existe una unidad con esa clave." };

  const values = { organizacionId: input.organizacionId, clave: input.clave, nombre: input.nombre, updatedBy: user.id };
  if (input.id) await db.update(catUnidadesMedida).set(values).where(and(eq(catUnidadesMedida.id, input.id), eq(catUnidadesMedida.organizacionId, input.organizacionId)));
  else await db.insert(catUnidadesMedida).values({ ...values, createdBy: user.id });
  revalidatePath("/admin/unidades-medida");
  revalidatePath("/admin/productos");
  return { success: true };
}

export async function toggleUnit(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const { user } = await requireOrganizationAccess(organizationId);
  const db = getDatabase();
  await db.update(catUnidadesMedida).set({ activo: !active, updatedBy: user.id }).where(and(eq(catUnidadesMedida.id, id), eq(catUnidadesMedida.organizacionId, organizationId)));
  revalidatePath("/admin/unidades-medida");
  revalidatePath("/admin/productos");
}
