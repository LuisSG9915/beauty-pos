"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { membresias } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import { requiereCapacidad } from "@/modules/billing/queries";

const membresiaSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo."),
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(4000).optional().or(z.literal("")),
  duracionDias: z.coerce.number().int("Duración inválida.").min(1, "Mínimo 1 día.").max(3650),
  descuentoPorcentaje: z.coerce.number().min(0, "El descuento no puede ser negativo.").max(100, "Máximo 100%."),
  aplica: z.enum(["ambos", "servicio", "producto"]),
  precio: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Usa un precio válido."),
});

export type MembresiaActionState = { error?: string; success?: boolean };

export async function saveMembresia(_previousState: MembresiaActionState, formData: FormData): Promise<MembresiaActionState> {
  const result = membresiaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa la membresía." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const negado = await requiereCapacidad(input.organizacionId, "membresias");
  if (negado) return { error: negado };
  const { user } = access;
  const db = getDatabase();

  const conditions = [eq(membresias.organizacionId, input.organizacionId), eq(membresias.clave, input.clave)];
  if (input.id) conditions.push(ne(membresias.id, input.id));
  const duplicate = await db.select({ id: membresias.id }).from(membresias).where(and(...conditions)).limit(1);
  if (duplicate.length > 0) return { error: "Ya existe una membresía con esa clave." };

  const values = {
    organizacionId: input.organizacionId,
    clave: input.clave,
    nombre: input.nombre,
    descripcion: input.descripcion || null,
    duracionDias: input.duracionDias,
    descuentoPorcentaje: input.descuentoPorcentaje.toFixed(2),
    aplica: input.aplica,
    precio: input.precio,
    updatedBy: user.id,
  };

  if (input.id) await db.update(membresias).set(values).where(and(eq(membresias.id, input.id), eq(membresias.organizacionId, input.organizacionId)));
  else await db.insert(membresias).values({ ...values, createdBy: user.id });

  revalidatePath("/admin/membresias");
  revalidatePath("/admin/pos");
  revalidateCatalogos(input.organizacionId);
  return { success: true };
}

export async function toggleMembresia(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  if (await requiereCapacidad(organizationId, "membresias")) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(membresias).set({ activo: !active, updatedBy: user.id }).where(and(eq(membresias.id, id), eq(membresias.organizacionId, organizationId)));
  revalidatePath("/admin/membresias");
  revalidatePath("/admin/pos");
  revalidateCatalogos(organizationId);
}
