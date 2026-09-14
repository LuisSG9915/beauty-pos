"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { promociones } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";

const promotionSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo."),
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(4000).optional().or(z.literal("")),
  tipo: z.enum(["porcentaje", "monto", "2x1", "paquete"]),
  valor: z.string().trim().regex(/^\d+(\.\d{1,3})?$/, "Usa un valor válido."),
  aplica: z.enum(["producto", "servicio", "ambos"]),
  vigenciaDesde: z.string().min(1, "Indica la fecha de inicio."),
  vigenciaHasta: z.string().optional().or(z.literal("")),
});

export type PromotionActionState = { error?: string; success?: boolean };

export async function savePromotion(_previousState: PromotionActionState, formData: FormData): Promise<PromotionActionState> {
  const result = promotionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa la promoción." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();
  const conditions = [eq(promociones.organizacionId, input.organizacionId), eq(promociones.clave, input.clave)];
  if (input.id) conditions.push(ne(promociones.id, input.id));
  const duplicate = await db.select({ id: promociones.id }).from(promociones).where(and(...conditions)).limit(1);
  if (duplicate.length > 0) return { error: "Ya existe una promoción con esa clave." };

  if (input.vigenciaHasta && input.vigenciaDesde > input.vigenciaHasta) return { error: "La fecha de fin no puede ser anterior a la de inicio." };

  const values = {
    organizacionId: input.organizacionId,
    clave: input.clave,
    nombre: input.nombre,
    descripcion: input.descripcion || null,
    tipo: input.tipo,
    valor: input.valor,
    aplica: input.aplica,
    vigenciaDesde: input.vigenciaDesde,
    vigenciaHasta: input.vigenciaHasta || null,
    updatedBy: user.id,
  };

  if (input.id) await db.update(promociones).set(values).where(and(eq(promociones.id, input.id), eq(promociones.organizacionId, input.organizacionId)));
  else await db.insert(promociones).values({ ...values, createdBy: user.id });

  revalidatePath("/admin/promociones");
  return { success: true };
}

export async function togglePromotion(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(promociones).set({ activo: !active, updatedBy: user.id }).where(and(eq(promociones.id, id), eq(promociones.organizacionId, organizationId)));
  revalidatePath("/admin/promociones");
}
