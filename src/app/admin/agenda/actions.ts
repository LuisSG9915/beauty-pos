"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { citas, detalleCitasServicios } from "@/db/schema/operations";
import { servicios } from "@/db/schema/catalogs";
import {
  canAccessBranch,
  checkPermission,
  type ResolvedAccess,
} from "@/lib/auth/authorization";
import {
  canRescheduleEstado,
  canTransitionEstado,
  isCitaEditable,
  validateCitaAvailability,
  type AgendaDb,
  type CitaRow,
} from "@/modules/agenda";
import {
  clienteEnOrganizacion,
  getCita,
  getOcupacionAgenda,
  lockSucursalAgenda,
  profesionalAsignadoASucursal,
} from "@/modules/agenda/service";
import { getZonedParts, parseFechaHoraInput } from "@/modules/agenda/timezone";
import { intervalFromDates, type DisponibilidadResult } from "@/modules/agenda/types";

const CITA_ESTADOS = ["pendiente", "confirmada", "en_proceso", "completada", "cancelada", "no_asistio"] as const;

export type CitaActionState = { error?: string; success?: boolean; message?: string; citaId?: string };
export type CitaMutationResult = { success: boolean; message?: string; error?: string };

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

function violacionesAError(disponibilidad: DisponibilidadResult): string {
  return disponibilidad.violaciones.map((v) => v.mensaje).join(" ") || "La cita no está disponible en ese horario.";
}

async function validarDisponibilidadCita(
  tx: AgendaDb,
  params: {
    organizacionId: string;
    sucursalId: string;
    usuarioId: string | null;
    fechaHora: Date;
    duracionMinutos: number;
    zonaHoraria: string;
    ignoreCitaId?: string | null;
  },
): Promise<DisponibilidadResult> {
  const candidato = intervalFromDates(params.fechaHora, params.duracionMinutos);
  const partes = getZonedParts(params.fechaHora, params.zonaHoraria);
  const ocupacion = await getOcupacionAgenda(tx, {
    organizacionId: params.organizacionId,
    sucursalId: params.sucursalId,
    desde: new Date(candidato.iniciaAtMs),
    hasta: new Date(candidato.terminaAtMs),
  });
  return validateCitaAvailability({
    candidato: { ...candidato, usuarioId: params.usuarioId },
    diaSemana: partes.diaSemana,
    iniciaMinutosLocal: partes.minutosDelDia,
    duracionMinutos: params.duracionMinutos,
    horarios: ocupacion.horarios,
    bloqueos: ocupacion.bloqueos,
    citas: ocupacion.citas,
    ignoreCitaId: params.ignoreCitaId,
  });
}

/** Inserta/reactiva/desactiva renglones de detalle_citas_servicios sin duplicar. */
async function syncServiciosCita(
  tx: AgendaDb,
  citaId: string,
  serviciosElegidos: Array<{ id: string; precio: string }>,
  userId: string,
) {
  const existentes = await tx
    .select({ id: detalleCitasServicios.id, servicioId: detalleCitasServicios.servicioId })
    .from(detalleCitasServicios)
    .where(eq(detalleCitasServicios.citaId, citaId));
  const porServicio = new Map(existentes.map((e) => [e.servicioId, e.id]));

  for (const servicio of serviciosElegidos) {
    const existenteId = porServicio.get(servicio.id);
    if (existenteId) {
      await tx
        .update(detalleCitasServicios)
        .set({ activo: true, precio: servicio.precio, updatedBy: userId })
        .where(eq(detalleCitasServicios.id, existenteId));
      porServicio.delete(servicio.id);
    } else {
      await tx.insert(detalleCitasServicios).values({ citaId, servicioId: servicio.id, precio: servicio.precio, createdBy: userId });
    }
  }
  for (const detalleId of porServicio.values()) {
    await tx.update(detalleCitasServicios).set({ activo: false, updatedBy: userId }).where(eq(detalleCitasServicios.id, detalleId));
  }
}

export async function saveCita(_previousState: CitaActionState, formData: FormData): Promise<CitaActionState> {
  const servicioIds = [...new Set(formData.getAll("servicioIds").map(String).filter((v) => v !== ""))];
  if (!servicioIds.every((id) => z.string().uuid().safeParse(id).success)) {
    return { error: "Uno o más servicios son inválidos." };
  }
  const result = citaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa los datos de la cita." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { error: "No tienes permiso para editar la agenda." };
  const { user } = access;
  const db = getDatabase();

  try {
    const outcome = await db.transaction(async (tx): Promise<CitaActionState> => {
      // Serializa mutaciones de agenda por sucursal antes de validar/escribir.
      const sucursal = await lockSucursalAgenda(tx, input.organizacionId, input.sucursalId);
      if (!sucursal) return { error: "La sucursal no existe o no pertenece a la organización." };
      if (!sucursal.activo) return { error: "La sucursal está inactiva." };
      if (!canAccessBranch(access, input.sucursalId)) {
        return { error: "No tienes acceso a esta sucursal." };
      }

      const fechaHora = parseFechaHoraInput(input.fechaHora, sucursal.zonaHoraria);
      if (!fechaHora) return { error: "Fecha y hora inválidas." };

      if (input.clienteId) {
        const existeCliente = await clienteEnOrganizacion(tx, input.organizacionId, input.clienteId);
        if (!existeCliente) return { error: "El cliente no pertenece a la organización." };
      }
      if (input.usuarioId) {
        const asignado = await profesionalAsignadoASucursal(tx, input.organizacionId, input.sucursalId, input.usuarioId);
        if (!asignado) return { error: "El profesional no está asignado a esta sucursal." };
      }

      const servicioRows = servicioIds.length > 0
        ? await tx
            .select({ id: servicios.id, precio: servicios.precioBase })
            .from(servicios)
            .where(and(eq(servicios.organizacionId, input.organizacionId), eq(servicios.activo, true), inArray(servicios.id, servicioIds)))
        : [];
      if (servicioRows.length !== servicioIds.length) return { error: "Uno o más servicios no son válidos." };
      const totalEstimado = servicioRows.reduce((sum, r) => sum + parseFloat(r.precio), 0).toFixed(2);

      let previa: CitaRow | null = null;
      if (input.id) {
        previa = await getCita(tx, input.organizacionId, input.id);
        if (!previa || !previa.activo) return { error: "La cita no existe." };
        if (!isCitaEditable(previa.estado)) {
          return { error: "Una cita cancelada, completada o no asistida solo puede reagendarse." };
        }
      }

      const disponibilidad = await validarDisponibilidadCita(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: input.usuarioId || null,
        fechaHora,
        duracionMinutos: input.duracionMinutos,
        zonaHoraria: sucursal.zonaHoraria,
        ignoreCitaId: input.id || null,
      });
      if (!disponibilidad.ok) return { error: violacionesAError(disponibilidad) };

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
      if (previa) {
        // Edición: el estado se preserva (no forma parte de `values`).
        await tx.update(citas).set(values).where(eq(citas.id, previa.id));
        citaId = previa.id;
      } else {
        const [inserted] = await tx
          .insert(citas)
          .values({ ...values, estado: "pendiente", createdBy: user.id })
          .returning({ id: citas.id });
        citaId = inserted.id;
      }

      await syncServiciosCita(tx, citaId, servicioRows, user.id);
      return { success: true, message: "Cita guardada correctamente.", citaId };
    });

    if (outcome.success) {
      revalidatePath("/admin/agenda");
      revalidatePath("/admin/pos");
    }
    return outcome;
  } catch (error) {
    console.error("saveCita", error);
    return { error: "No se pudo guardar la cita. Intenta de nuevo." };
  }
}

const servicioCitaSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  servicioId: z.string().uuid(),
  agregar: z.coerce.boolean(),
});

/**
 * Agrega o quita un servicio de la cita desde el panel lateral y recalcula
 * duración y total estimado. Solo aplica a citas editables.
 */
export async function toggleServicioCita(formData: FormData): Promise<CitaMutationResult> {
  const result = servicioCitaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { success: false, error: "Datos inválidos para el servicio." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar la agenda." };
  const { user } = access;
  const db = getDatabase();

  try {
    const outcome = await db.transaction(async (tx): Promise<CitaMutationResult> => {
      const cita = await getCita(tx, input.organizacionId, input.citaId);
      if (!cita || !cita.activo) return { success: false, error: "La cita no existe." };
      if (!canAccessBranch(access, cita.sucursalId)) {
        return { success: false, error: "La cita pertenece a una sucursal sin acceso." };
      }
      if (!isCitaEditable(cita.estado)) {
        return { success: false, error: "Solo se pueden modificar servicios en citas pendientes, confirmadas o en proceso." };
      }

      const [servicio] = await tx
        .select({ id: servicios.id, precio: servicios.precioBase, duracion: servicios.duracionMinutos })
        .from(servicios)
        .where(and(eq(servicios.id, input.servicioId), eq(servicios.organizacionId, input.organizacionId), eq(servicios.activo, true)))
        .limit(1);
      if (!servicio) return { success: false, error: "El servicio no está disponible." };

      const [existente] = await tx
        .select({ id: detalleCitasServicios.id, activo: detalleCitasServicios.activo })
        .from(detalleCitasServicios)
        .where(and(eq(detalleCitasServicios.citaId, cita.id), eq(detalleCitasServicios.servicioId, input.servicioId)))
        .limit(1);

      if (input.agregar) {
        if (existente?.activo) return { success: true, message: "El servicio ya está en la cita." };
        if (existente) {
          await tx.update(detalleCitasServicios).set({ activo: true, precio: servicio.precio, updatedBy: user.id }).where(eq(detalleCitasServicios.id, existente.id));
        } else {
          await tx.insert(detalleCitasServicios).values({ citaId: cita.id, servicioId: servicio.id, precio: servicio.precio, createdBy: user.id });
        }
      } else {
        if (!existente?.activo) return { success: true, message: "El servicio no estaba en la cita." };
        await tx.update(detalleCitasServicios).set({ activo: false, updatedBy: user.id }).where(eq(detalleCitasServicios.id, existente.id));
      }

      const activos = await tx
        .select({ precio: detalleCitasServicios.precio, duracion: servicios.duracionMinutos })
        .from(detalleCitasServicios)
        .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
        .where(and(eq(detalleCitasServicios.citaId, cita.id), eq(detalleCitasServicios.activo, true)));

      const totalEstimado = activos.reduce((sum, a) => sum + Number(a.precio), 0).toFixed(2);
      const duracion = activos.length > 0 ? Math.max(activos.reduce((sum, a) => sum + a.duracion, 0), 5) : cita.duracionMinutos;
      await tx.update(citas).set({ totalEstimado, duracionMinutos: duracion, updatedBy: user.id }).where(eq(citas.id, cita.id));
      return { success: true, message: input.agregar ? "Servicio agregado." : "Servicio quitado." };
    });

    if (outcome.success) {
      revalidatePath("/admin/agenda");
      revalidatePath("/admin/pos");
    }
    return outcome;
  } catch (error) {
    console.error("toggleServicioCita", error);
    return { success: false, error: "No se pudo actualizar los servicios." };
  }
}

const estadoSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  estado: z.enum(CITA_ESTADOS),
  // Opcional: al reagendar (estado=pendiente) permite indicar la nueva fecha/hora.
  fechaHora: z.string().optional().or(z.literal("")),
});

export async function updateCitaEstado(formData: FormData): Promise<CitaMutationResult> {
  const result = estadoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { success: false, error: "Datos inválidos para cambiar el estado." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar la agenda." };
  const { user } = access;
  const db = getDatabase();

  try {
    const outcome = await db.transaction(async (tx): Promise<CitaMutationResult> => {
      const referencia = await getCita(tx, input.organizacionId, input.citaId);
      if (!referencia || !referencia.activo) return { success: false, error: "La cita no existe." };
      if (!canAccessBranch(access, referencia.sucursalId)) {
        return { success: false, error: "La cita pertenece a una sucursal sin acceso." };
      }
      const sucursal = await lockSucursalAgenda(tx, input.organizacionId, referencia.sucursalId);
      if (!sucursal) return { success: false, error: "La sucursal ya no existe." };
      // Relectura bajo el lock de sucursal para validar el estado más reciente.
      const cita = await getCita(tx, input.organizacionId, input.citaId);
      if (!cita || !cita.activo) return { success: false, error: "La cita no existe." };

      if (cita.estado === input.estado) return { success: true, message: "La cita ya está en ese estado." };
      if (!canTransitionEstado(cita.estado, input.estado)) {
        return { success: false, error: `No se puede pasar de "${cita.estado}" a "${input.estado}".` };
      }

      let fechaHora = cita.fechaHora;
      // Reagendar = mover a la nueva fecha/hora (si se indica) y volver a pendiente.
      if (input.estado === "pendiente" && input.fechaHora) {
        const parsed = parseFechaHoraInput(input.fechaHora, sucursal.zonaHoraria);
        if (!parsed) return { success: false, error: "Fecha y hora inválidas." };
        fechaHora = parsed;
      }
      if (input.estado === "pendiente") {
        const disponibilidad = await validarDisponibilidadCita(tx, {
          organizacionId: input.organizacionId,
          sucursalId: cita.sucursalId,
          usuarioId: cita.usuarioId,
          fechaHora,
          duracionMinutos: cita.duracionMinutos,
          zonaHoraria: sucursal.zonaHoraria,
          ignoreCitaId: cita.id,
        });
        if (!disponibilidad.ok) return { success: false, error: violacionesAError(disponibilidad) };
      }

      await tx.update(citas).set({ estado: input.estado, fechaHora, updatedBy: user.id }).where(eq(citas.id, cita.id));
      return { success: true, message: "Estado actualizado." };
    });

    if (outcome.success) {
      revalidatePath("/admin/agenda");
      revalidatePath("/admin/pos");
    }
    return outcome;
  } catch (error) {
    console.error("updateCitaEstado", error);
    return { success: false, error: "No se pudo actualizar el estado." };
  }
}

export async function toggleCitaActiva(formData: FormData): Promise<CitaMutationResult> {
  const organizationId = String(formData.get("organizacionId") ?? "");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("activo") === "true";
  const parsed = z.object({ organizationId: z.string().uuid(), id: z.string().uuid() }).safeParse({ organizationId, id });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };
  const access = await checkPermission(organizationId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar la agenda." };
  const { user } = access;
  const db = getDatabase();
  const [cita] = await db
    .select({ sucursalId: citas.sucursalId })
    .from(citas)
    .where(and(eq(citas.id, id), eq(citas.organizacionId, organizationId)))
    .limit(1);
  if (!cita) return { success: false, error: "La cita no existe." };
  if (!canAccessBranch(access, cita.sucursalId)) {
    return { success: false, error: "La cita pertenece a una sucursal sin acceso." };
  }
  await db
    .update(citas)
    .set({ activo: !active, updatedBy: user.id })
    .where(and(eq(citas.id, id), eq(citas.organizacionId, organizationId)));
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/pos");
  return { success: true, message: active ? "Cita desactivada." : "Cita reactivada." };
}

const moveSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  fechaHora: z.string().min(1),
  usuarioId: z.string().uuid().optional().or(z.literal("")),
});

async function moverCitaEnTx(
  tx: AgendaDb,
  input: z.infer<typeof moveSchema>,
  formData: FormData,
  access: ResolvedAccess,
  opts: { reactivarAPendiente: boolean },
): Promise<CitaMutationResult> {
  const userId = access.user.id;
  const referencia = await getCita(tx, input.organizacionId, input.citaId);
  if (!referencia || !referencia.activo) return { success: false, error: "La cita no existe." };
  if (!canAccessBranch(access, referencia.sucursalId)) {
    return { success: false, error: "La cita pertenece a una sucursal sin acceso." };
  }
  const sucursal = await lockSucursalAgenda(tx, input.organizacionId, referencia.sucursalId);
  if (!sucursal) return { success: false, error: "La sucursal ya no existe." };
  const cita = await getCita(tx, input.organizacionId, input.citaId);
  if (!cita || !cita.activo) return { success: false, error: "La cita no existe." };

  if (opts.reactivarAPendiente) {
    if (!canRescheduleEstado(cita.estado)) {
      return { success: false, error: `Una cita en estado "${cita.estado}" no puede reagendarse.` };
    }
  } else if (!isCitaEditable(cita.estado)) {
    return { success: false, error: "Una cita cancelada, completada o no asistida solo puede reagendarse." };
  }

  const fechaHora = parseFechaHoraInput(input.fechaHora, sucursal.zonaHoraria);
  if (!fechaHora) return { success: false, error: "Fecha y hora inválidas." };

  const usuarioId = formData.has("usuarioId") ? input.usuarioId || null : cita.usuarioId;
  if (usuarioId) {
    const asignado = await profesionalAsignadoASucursal(tx, input.organizacionId, cita.sucursalId, usuarioId);
    if (!asignado) return { success: false, error: "El profesional no está asignado a esta sucursal." };
  }

  const disponibilidad = await validarDisponibilidadCita(tx, {
    organizacionId: input.organizacionId,
    sucursalId: cita.sucursalId,
    usuarioId,
    fechaHora,
    duracionMinutos: cita.duracionMinutos,
    zonaHoraria: sucursal.zonaHoraria,
    ignoreCitaId: cita.id,
  });
  if (!disponibilidad.ok) return { success: false, error: violacionesAError(disponibilidad) };

  await tx
    .update(citas)
    .set({
      fechaHora,
      usuarioId,
      ...(opts.reactivarAPendiente ? { estado: "pendiente" } : {}),
      updatedBy: userId,
    })
    .where(eq(citas.id, cita.id));
  return { success: true, message: opts.reactivarAPendiente ? "Cita reagendada a pendiente." : "Cita movida." };
}

/** Mueve la cita a otra fecha/hora (y opcionalmente a otro profesional) conservando su estado. */
export async function moveCita(formData: FormData): Promise<CitaMutationResult> {
  const result = moveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { success: false, error: "Datos inválidos para mover la cita." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar la agenda." };
  const db = getDatabase();

  try {
    const outcome = await db.transaction((tx) => moverCitaEnTx(tx, input, formData, access, { reactivarAPendiente: false }));
    if (outcome.success) {
      revalidatePath("/admin/agenda");
      revalidatePath("/admin/pos");
    }
    return outcome;
  } catch (error) {
    console.error("moveCita", error);
    return { success: false, error: "No se pudo mover la cita." };
  }
}

/**
 * Reagenda explícitamente: mueve la cita a una nueva fecha/hora y la regresa a
 * "pendiente". Permite rescatar citas canceladas o no asistidas; no aplica a
 * citas en proceso ni completadas (ligadas a una venta).
 */
export async function rescheduleCita(formData: FormData): Promise<CitaMutationResult> {
  const result = moveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { success: false, error: "Datos inválidos para reagendar la cita." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar la agenda." };
  const db = getDatabase();

  try {
    const outcome = await db.transaction((tx) => moverCitaEnTx(tx, input, formData, access, { reactivarAPendiente: true }));
    if (outcome.success) {
      revalidatePath("/admin/agenda");
      revalidatePath("/admin/pos");
    }
    return outcome;
  } catch (error) {
    console.error("rescheduleCita", error);
    return { success: false, error: "No se pudo reagendar la cita." };
  }
}
