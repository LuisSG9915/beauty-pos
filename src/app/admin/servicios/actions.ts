"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { servicios } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";

const serviceSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  categoriaId: z.string().uuid().optional().or(z.literal("")),
  clave: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo."),
  nombre: z.string().trim().min(2).max(160),
  descripcion: z.string().trim().max(4000).optional().or(z.literal("")),
  duracionMinutos: z.coerce.number().int().min(5).max(1440),
  precioBase: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Usa un precio válido con máximo dos decimales."),
  visibleAgenda: z.string().optional(),
  requiereCabina: z.string().optional(),
});

export type ServiceActionState = { error?: string; success?: boolean };

export async function saveService(_previousState: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const result = serviceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa los datos del servicio." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();
  const duplicate = await db.select({ id: servicios.id }).from(servicios).where(and(eq(servicios.organizacionId, input.organizacionId), eq(servicios.clave, input.clave), input.id ? ne(servicios.id, input.id) : undefined)).limit(1);
  if (duplicate.length > 0) return { error: "Ya existe un servicio con esa clave en la organización." };

  const values = {
    organizacionId: input.organizacionId,
    categoriaId: input.categoriaId || null,
    clave: input.clave,
    nombre: input.nombre,
    descripcion: input.descripcion || null,
    duracionMinutos: input.duracionMinutos,
    precioBase: input.precioBase,
    visibleAgenda: input.visibleAgenda === "true",
    requiereCabina: input.requiereCabina === "true",
    updatedBy: user.id,
  };

  if (input.id) await db.update(servicios).set(values).where(and(eq(servicios.id, input.id), eq(servicios.organizacionId, input.organizacionId)));
  else await db.insert(servicios).values({ ...values, createdBy: user.id });

  revalidatePath("/admin/servicios");
  return { success: true };
}

export async function toggleService(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(servicios).set({ activo: !active, updatedBy: user.id }).where(and(eq(servicios.id, id), eq(servicios.organizacionId, organizationId)));
  revalidatePath("/admin/servicios");
}
