"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { paquetes, servicios } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import { claveDisponible } from "@/lib/clave";
import { requiereCapacidad } from "@/modules/billing/queries";

const paqueteSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  clave: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo.").optional().or(z.literal("")),
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(4000).optional().or(z.literal("")),
  servicioId: z.string().uuid("Selecciona el servicio que cubre el paquete."),
  sesiones: z.coerce.number().int("Sesiones inválidas.").min(1, "Mínimo 1 sesión.").max(500),
  precio: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Usa un precio válido."),
});

export type PaqueteActionState = { error?: string; success?: boolean };

export async function savePaquete(_previousState: PaqueteActionState, formData: FormData): Promise<PaqueteActionState> {
  const result = paqueteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa el paquete." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const negado = await requiereCapacidad(input.organizacionId, "paquetes");
  if (negado) return { error: negado };
  const { user } = access;
  const db = getDatabase();

  const [servicio] = await db
    .select({ id: servicios.id })
    .from(servicios)
    .where(and(eq(servicios.id, input.servicioId), eq(servicios.organizacionId, input.organizacionId), eq(servicios.activo, true)))
    .limit(1);
  if (!servicio) return { error: "El servicio seleccionado no existe o está oculto." };

  // Clave manual (opcional): el único (org, clave) no filtra por activo —
  // el chequeo cubre inactivas e ignora mayúsculas (claves históricas).
  const claveManual = input.clave || undefined;
  if (claveManual) {
    const conditions = [eq(paquetes.organizacionId, input.organizacionId), eq(sql`lower(${paquetes.clave})`, claveManual.toLowerCase())];
    if (input.id) conditions.push(ne(paquetes.id, input.id));
    const duplicate = await db.select({ id: paquetes.id }).from(paquetes).where(and(...conditions)).limit(1);
    if (duplicate.length > 0) return { error: "Ya existe un paquete con esa clave." };
  }

  const values = {
    organizacionId: input.organizacionId,
    nombre: input.nombre,
    descripcion: input.descripcion || null,
    servicioId: input.servicioId,
    sesiones: input.sesiones,
    precio: input.precio,
    updatedBy: user.id,
  };

  if (input.id) {
    await db.update(paquetes).set(claveManual ? { ...values, clave: claveManual } : values).where(and(eq(paquetes.id, input.id), eq(paquetes.organizacionId, input.organizacionId)));
  } else {
    const clave = claveManual ?? (await claveDisponible(db, paquetes, input.organizacionId, input.nombre, 60));
    await db.insert(paquetes).values({ ...values, clave, createdBy: user.id });
  }

  revalidatePath("/admin/paquetes");
  revalidatePath("/admin/pos");
  revalidateCatalogos(input.organizacionId);
  return { success: true };
}

export async function togglePaquete(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const access = await checkPermission(organizationId, "catalogos.editar");
  if (!access) return;
  if (await requiereCapacidad(organizationId, "paquetes")) return;
  const { user } = access;
  const db = getDatabase();
  await db.update(paquetes).set({ activo: !active, updatedBy: user.id }).where(and(eq(paquetes.id, id), eq(paquetes.organizacionId, organizationId)));
  revalidatePath("/admin/paquetes");
  revalidatePath("/admin/pos");
  revalidateCatalogos(organizationId);
}
