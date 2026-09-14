"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";

const paymentMethodSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(1).max(40).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo."),
  nombre: z.string().trim().min(2).max(80),
  categoria: z.enum(["efectivo", "tarjeta", "transferencia", "wallet", "otro"]),
});

export type PaymentMethodActionState = { error?: string; success?: boolean };

export async function savePaymentMethod(_previousState: PaymentMethodActionState, formData: FormData): Promise<PaymentMethodActionState> {
  const result = paymentMethodSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa el medio de pago." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();
  const conditions = [eq(catMediosPago.organizacionId, input.organizacionId), eq(catMediosPago.clave, input.clave)];
  if (input.id) conditions.push(ne(catMediosPago.id, input.id));
  const duplicate = await db.select({ id: catMediosPago.id }).from(catMediosPago).where(and(...conditions)).limit(1);
  if (duplicate.length > 0) return { error: "Ya existe un medio de pago con esa clave." };

  const values = {
    organizacionId: input.organizacionId,
    clave: input.clave,
    nombre: input.nombre,
    categoria: input.categoria,
    updatedBy: user.id,
  };

  if (input.id) await db.update(catMediosPago).set(values).where(and(eq(catMediosPago.id, input.id), eq(catMediosPago.organizacionId, input.organizacionId)));
  else await db.insert(catMediosPago).values({ ...values, createdBy: user.id });

  revalidatePath("/admin/medios-pago");
  return { success: true };
}

export async function togglePaymentMethod(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(catMediosPago).set({ activo: !active, updatedBy: user.id }).where(and(eq(catMediosPago.id, id), eq(catMediosPago.organizacionId, organizationId)));
  revalidatePath("/admin/medios-pago");
}
