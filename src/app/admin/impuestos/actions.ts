"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catImpuestos } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";
import { claveDisponible } from "@/lib/clave";

const taxSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(1).max(40).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo.").optional().or(z.literal("")),
  nombre: z.string().trim().min(2).max(80),
  tasa: z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Usa una tasa válida con máximo cuatro decimales."),
  tipo: z.enum(["agregado", "incluido", "exento"]),
});

export type TaxActionState = { error?: string; success?: boolean };

export async function saveTax(_previousState: TaxActionState, formData: FormData): Promise<TaxActionState> {
  const result = taxSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa el impuesto." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();
  // Clave manual (opcional): el único (org, clave) no filtra por activo —
  // el chequeo cubre inactivas e ignora mayúsculas (claves históricas).
  const claveManual = input.clave || undefined;
  if (claveManual) {
    const conditions = [eq(catImpuestos.organizacionId, input.organizacionId), eq(sql`lower(${catImpuestos.clave})`, claveManual.toLowerCase())];
    if (input.id) conditions.push(ne(catImpuestos.id, input.id));
    const duplicate = await db.select({ id: catImpuestos.id }).from(catImpuestos).where(and(...conditions)).limit(1);
    if (duplicate.length > 0) return { error: "Ya existe un impuesto con esa clave." };
  }

  const values = {
    organizacionId: input.organizacionId,
    nombre: input.nombre,
    tasa: input.tasa,
    tipo: input.tipo,
    updatedBy: user.id,
  };

  if (input.id) {
    await db.update(catImpuestos).set(claveManual ? { ...values, clave: claveManual } : values).where(and(eq(catImpuestos.id, input.id), eq(catImpuestos.organizacionId, input.organizacionId)));
  } else {
    const clave = claveManual ?? (await claveDisponible(db, catImpuestos, input.organizacionId, input.nombre, 40));
    await db.insert(catImpuestos).values({ ...values, clave, createdBy: user.id });
  }

  revalidatePath("/admin/impuestos");
  return { success: true };
}

export async function toggleTax(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(catImpuestos).set({ activo: !active, updatedBy: user.id }).where(and(eq(catImpuestos.id, id), eq(catImpuestos.organizacionId, organizationId)));
  revalidatePath("/admin/impuestos");
}
