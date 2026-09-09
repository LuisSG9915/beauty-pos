"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catImpuestos } from "@/db/schema/catalogs";
import { requireOrganizationAccess } from "@/lib/auth/access";

const taxSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(1).max(40).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo."),
  nombre: z.string().trim().min(2).max(80),
  tasa: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Usa una tasa válida con máximo cuatro decimales."),
  tipo: z.enum(["agregado", "incluido", "exento"]),
});

export type TaxActionState = { error?: string; success?: boolean };

export async function saveTax(_previousState: TaxActionState, formData: FormData): Promise<TaxActionState> {
  const result = taxSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa el impuesto." };
  const input = result.data;
  const { user } = await requireOrganizationAccess(input.organizacionId);
  const db = getDatabase();
  const conditions = [eq(catImpuestos.organizacionId, input.organizacionId), eq(catImpuestos.clave, input.clave)];
  if (input.id) conditions.push(ne(catImpuestos.id, input.id));
  const duplicate = await db.select({ id: catImpuestos.id }).from(catImpuestos).where(and(...conditions)).limit(1);
  if (duplicate.length > 0) return { error: "Ya existe un impuesto con esa clave." };

  const values = {
    organizacionId: input.organizacionId,
    clave: input.clave,
    nombre: input.nombre,
    tasa: input.tasa,
    tipo: input.tipo,
    updatedBy: user.id,
  };

  if (input.id) await db.update(catImpuestos).set(values).where(and(eq(catImpuestos.id, input.id), eq(catImpuestos.organizacionId, input.organizacionId)));
  else await db.insert(catImpuestos).values({ ...values, createdBy: user.id });

  revalidatePath("/admin/impuestos");
  return { success: true };
}

export async function toggleTax(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const { user } = await requireOrganizationAccess(organizationId);
  const db = getDatabase();
  await db.update(catImpuestos).set({ activo: !active, updatedBy: user.id }).where(and(eq(catImpuestos.id, id), eq(catImpuestos.organizacionId, organizationId)));
  revalidatePath("/admin/impuestos");
}
