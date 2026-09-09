"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { citas, detalleCitasServicios } from "@/db/schema/operations";
import { servicios } from "@/db/schema/catalogs";
import { requireOrganizationAccess } from "@/lib/auth/access";

const citaSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  clienteId: z.string().uuid().optional().or(z.literal("")),
  usuarioId: z.string().uuid().optional().or(z.literal("")),
  fechaHora: z.string().min(1, "Indica fecha y hora."),
  duracionMinutos: z.coerce.number().int().min(5).max(1440),
  notas: z.string().trim().max(4000).optional().or(z.literal("")),
});

export type CitaActionState = { error?: string; success?: boolean };

export async function saveCita(_previousState: CitaActionState, formData: FormData): Promise<CitaActionState> {
  const servicioIds = formData.getAll("servicioIds").map(String).filter((v) => v !== "");
  const result = citaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa los datos de la cita." };
  const input = result.data;
  const { user } = await requireOrganizationAccess(input.organizacionId);
  const db = getDatabase();

  const fechaHora = new Date(input.fechaHora);
  if (isNaN(fechaHora.getTime())) return { error: "Fecha y hora inválidas." };

  let totalEstimado = "0";
  if (servicioIds.length > 0) {
    const rows = await db.select({ precio: servicios.precioBase }).from(servicios).where(and(eq(servicios.organizacionId, input.organizacionId), inArray(servicios.id, servicioIds)));
    totalEstimado = rows.reduce((sum, r) => sum + parseFloat(r.precio), 0).toFixed(2);
  }

  const values = {
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    clienteId: input.clienteId || null,
    usuarioId: input.usuarioId || null,
    fechaHora,
    duracionMinutos: input.duracionMinutos,
    notas: input.notas || null,
    totalEstimado,
    updatedBy: user.id,
  };

  let citaId: string;
  if (input.id) {
    await db.update(citas).set(values).where(and(eq(citas.id, input.id), eq(citas.organizacionId, input.organizacionId)));
    citaId = input.id;
    await db.update(detalleCitasServicios).set({ activo: false }).where(eq(detalleCitasServicios.citaId, citaId));
  } else {
    const [inserted] = await db.insert(citas).values({ ...values, estado: "pendiente", createdBy: user.id }).returning({ id: citas.id });
    citaId = inserted.id;
  }

  for (const servicioId of servicioIds) {
    const [serv] = await db.select({ precio: servicios.precioBase }).from(servicios).where(and(eq(servicios.id, servicioId), eq(servicios.organizacionId, input.organizacionId))).limit(1);
    if (serv) await db.insert(detalleCitasServicios).values({ citaId, servicioId, precio: serv.precio, createdBy: user.id });
  }

  revalidatePath("/admin/agenda");
  return { success: true };
}

const estadoSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  estado: z.enum(["pendiente", "confirmada", "en_proceso", "completada", "cancelada", "no_asistio"]),
});

export async function updateCitaEstado(formData: FormData) {
  const result = estadoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return;
  const input = result.data;
  const { user } = await requireOrganizationAccess(input.organizacionId);
  const db = getDatabase();
  await db.update(citas).set({ estado: input.estado, updatedBy: user.id }).where(and(eq(citas.id, input.citaId), eq(citas.organizacionId, input.organizacionId)));
  revalidatePath("/admin/agenda");
}

export async function toggleCitaActiva(formData: FormData) {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const { user } = await requireOrganizationAccess(organizationId);
  const db = getDatabase();
  await db.update(citas).set({ activo: !active, updatedBy: user.id }).where(and(eq(citas.id, id), eq(citas.organizacionId, organizationId)));
  revalidatePath("/admin/agenda");
}

const moveSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  fechaHora: z.string().min(1),
  usuarioId: z.string().optional().or(z.literal("")),
});

export async function moveCita(formData: FormData) {
  const result = moveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return;
  const input = result.data;
  const { user } = await requireOrganizationAccess(input.organizacionId);
  const fechaHora = new Date(input.fechaHora);
  if (isNaN(fechaHora.getTime())) return;
  const db = getDatabase();
  await db.update(citas).set({ fechaHora, usuarioId: input.usuarioId || null, updatedBy: user.id }).where(and(eq(citas.id, input.citaId), eq(citas.organizacionId, input.organizacionId)));
  revalidatePath("/admin/agenda");
}
