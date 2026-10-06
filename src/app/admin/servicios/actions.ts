"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { servicios } from "@/db/schema/catalogs";
import { checkPermission } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import { claveDisponible } from "@/lib/clave";

const serviceSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  categoriaId: z.string().uuid().optional().or(z.literal("")),
  clave: z.string().trim().toUpperCase().min(2).max(60).regex(/^[A-Z0-9_-]+$/, "Usa letras, números, guion o guion bajo.").optional().or(z.literal("")),
  nombre: z.string().trim().min(2).max(160),
  descripcion: z.string().trim().max(4000).optional().or(z.literal("")),
  duracionMinutos: z.coerce.number().int().min(5).max(1440),
  precioBase: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Usa un precio válido con máximo dos decimales."),
  visibleAgenda: z.string().optional(),
  requiereCabina: z.string().optional(),
});

export type ServiceActionState = {
  error?: string;
  success?: boolean;
  /** Aviso a mostrar en la confirmación extra de la baja. */
  warning?: string;
  /** La baja requiere confirmación porque el servicio tiene citas o ventas. */
  needsConfirm?: boolean;
};

export async function saveService(_previousState: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  const result = serviceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa los datos del servicio." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();
  // Clave manual (opcional): el único (org, clave) no filtra por activo —
  // el chequeo cubre inactivas e ignora mayúsculas (claves históricas).
  const claveManual = input.clave || undefined;
  if (claveManual) {
    const duplicate = await db.select({ id: servicios.id }).from(servicios).where(and(eq(servicios.organizacionId, input.organizacionId), eq(sql`lower(${servicios.clave})`, claveManual.toLowerCase()), input.id ? ne(servicios.id, input.id) : undefined)).limit(1);
    if (duplicate.length > 0) return { error: "Ya existe un servicio con esa clave en la organización." };
  }

  const values = {
    organizacionId: input.organizacionId,
    categoriaId: input.categoriaId || null,
    nombre: input.nombre,
    descripcion: input.descripcion || null,
    duracionMinutos: input.duracionMinutos,
    precioBase: input.precioBase,
    visibleAgenda: input.visibleAgenda === "true",
    requiereCabina: input.requiereCabina === "true",
    updatedBy: user.id,
  };

  if (input.id) {
    await db.update(servicios).set(claveManual ? { ...values, clave: claveManual } : values).where(and(eq(servicios.id, input.id), eq(servicios.organizacionId, input.organizacionId)));
  } else {
    const clave = claveManual ?? (await claveDisponible(db, servicios, input.organizacionId, input.nombre, 60));
    await db.insert(servicios).values({ ...values, clave, createdBy: user.id });
  }

  revalidatePath("/admin/servicios");
  revalidateCatalogos(input.organizacionId);
  return { success: true };
}

const toggleServiceSchema = z.object({
  organizacionId: z.string().uuid(),
  id: z.string().uuid(),
  activar: z.enum(["true", "false"]),
  confirmado: z.string().optional(),
});

/**
 * Activa u oculta un servicio. Al ocultar (`activar=false`) pide confirmación
 * extra cuando el servicio ya tiene citas o ventas registradas: responde
 * `needsConfirm` sin tocar la fila y el cliente reintenta con `confirmado`.
 */
export async function toggleService(formData: FormData): Promise<ServiceActionState> {
  const parsed = toggleServiceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Solicitud inválida." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "catalogos.editar");
  if (!access) return { error: "No tienes permiso para editar catálogos." };
  const { user } = access;
  const db = getDatabase();

  if (input.activar === "false" && input.confirmado !== "true") {
    const { rows } = await db.execute<{ tieneHistorial: boolean }>(sql`
      select (
        exists(
          select 1
            from detalle_citas_servicios d
            join citas c on c.id = d.cita_id
           where d.servicio_id = ${input.id}
             and d.activo
             and c.activo
             and c.organizacion_id = ${input.organizacionId}
        )
        or exists(
          select 1
            from detalle_ventas_servicios d
            join ventas v on v.id = d.venta_id
           where d.servicio_id = ${input.id}
             and d.activo
             and v.activo
             and v.organizacion_id = ${input.organizacionId}
        )
      ) as "tieneHistorial"
    `);
    if (rows[0]?.tieneHistorial) {
      return { needsConfirm: true, warning: "Este servicio tiene citas o ventas registradas." };
    }
  }

  await db
    .update(servicios)
    .set({ activo: input.activar === "true", updatedBy: user.id })
    .where(and(eq(servicios.id, input.id), eq(servicios.organizacionId, input.organizacionId)));
  revalidatePath("/admin/servicios");
  revalidateCatalogos(input.organizacionId);
  return { success: true };
}
