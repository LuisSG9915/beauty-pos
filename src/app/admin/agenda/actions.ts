"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { withDbRetry } from "@/db/retry";
import { organizaciones, sucursales, usuarios } from "@/db/schema/core";
import {
  bloqueosAgenda,
  citaRecursos,
  citas,
  citasHistorial,
  detalleCitasServicios,
  horariosSucursales,
  recursos,
  RECURSO_TIPOS,
} from "@/db/schema/operations";
import { servicios } from "@/db/schema/catalogs";
import { auditEvent } from "@/lib/audit";
import {
  assertBranchScope,
  canAccessBranch,
  checkPermission,
  type ResolvedAccess,
} from "@/lib/auth/authorization";
import {
  BLOQUEO_TIPOS,
  canRescheduleEstado,
  canTransitionEstado,
  isCitaEditable,
  sugerirHorariosLibres,
  type AgendaDb,
  type CitaRow,
} from "@/modules/agenda";
import {
  CITA_STALE_MESSAGE,
  clienteEnOrganizacion,
  getCita,
  getOcupacionAgenda,
  lockSucursalAgenda,
  profesionalAsignadoASucursal,
  recursosDeCita,
  registrarHistorialCita,
  validarDisponibilidadCita,
  versionCoincide,
  violacionesAError,
} from "@/modules/agenda/service";
import { parseFechaHoraInput } from "@/modules/agenda/timezone";
import { requiereCapacidad } from "@/modules/billing/queries";
import { emitirTokenGestion } from "@/modules/reservas/gestion";
import { encolarAvisoCita } from "@/modules/notificaciones/service";
import { TIPO_CAMBIO, TIPO_CANCELACION, TIPO_CONFIRMACION } from "@/modules/notificaciones/rules";

const CITA_ESTADOS = ["pendiente", "confirmada", "en_proceso", "completada", "cancelada", "no_asistio"] as const;

export type CitaActionState = {
  error?: string;
  success?: boolean;
  message?: string;
  citaId?: string;
  /** ISO 8601: próximos horarios libres cuando hubo conflicto de disponibilidad. */
  sugerencias?: string[];
};
export type CitaMutationResult = {
  success: boolean;
  message?: string;
  error?: string;
  sugerencias?: string[];
};

const citaSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  clienteId: z.string().uuid().optional().or(z.literal("")),
  usuarioId: z.string().uuid().optional().or(z.literal("")),
  fechaHora: z.string().min(1, "Indica fecha y hora."),
  duracionMinutos: z.coerce.number().int().min(5).max(1440),
  notas: z.string().trim().max(4000).optional().or(z.literal("")),
  // Concurrencia optimista: versión leída al abrir el formulario.
  version: z.coerce.number().int().min(1).optional(),
});

/** Días calendario que explora la búsqueda de sugerencias tras un conflicto. */
const SUGERENCIA_DIAS = 4;

/**
 * Tras un conflicto de disponibilidad, busca los próximos horarios libres
 * (misma duración y profesional) y los devuelve como ISO 8601 para la UI.
 */
async function sugerenciasEnConflicto(
  tx: AgendaDb,
  params: {
    organizacionId: string;
    sucursalId: string;
    usuarioId: string | null;
    fechaHora: Date;
    duracionMinutos: number;
    zonaHoraria: string;
    capacidadSinAsignar: number;
    ignoreCitaId?: string | null;
    recursoIds?: readonly string[];
  },
): Promise<string[]> {
  const ocupacion = await getOcupacionAgenda(tx, {
    organizacionId: params.organizacionId,
    sucursalId: params.sucursalId,
    desde: params.fechaHora,
    hasta: new Date(params.fechaHora.getTime() + SUGERENCIA_DIAS * 24 * 60 * 60 * 1000),
  });
  return sugerirHorariosLibres({
    desde: params.fechaHora,
    duracionMinutos: params.duracionMinutos,
    usuarioId: params.usuarioId,
    recursoIds: params.recursoIds,
    ocupacion,
    zonaHoraria: params.zonaHoraria,
    capacidadSinAsignar: params.capacidadSinAsignar,
    ignoreCitaId: params.ignoreCitaId,
  }).map((inicio) => inicio.toISOString());
}

/** Upsert de asignaciones cita↔recurso (mismo patrón que servicios). */
async function syncRecursosCita(
  tx: AgendaDb,
  params: { citaId: string; organizacionId: string; recursoIds: string[]; userId: string },
) {
  const existentes = await tx
    .select({ id: citaRecursos.id, recursoId: citaRecursos.recursoId })
    .from(citaRecursos)
    .where(eq(citaRecursos.citaId, params.citaId));
  const porRecurso = new Map(existentes.map((e) => [e.recursoId, e.id]));
  for (const recursoId of params.recursoIds) {
    const existenteId = porRecurso.get(recursoId);
    if (existenteId) {
      await tx
        .update(citaRecursos)
        .set({ activo: true, updatedBy: params.userId })
        .where(eq(citaRecursos.id, existenteId));
      porRecurso.delete(recursoId);
    } else {
      await tx.insert(citaRecursos).values({
        citaId: params.citaId,
        recursoId,
        organizacionId: params.organizacionId,
        createdBy: params.userId,
      });
    }
  }
  for (const detalleId of porRecurso.values()) {
    await tx
      .update(citaRecursos)
      .set({ activo: false, updatedBy: params.userId })
      .where(eq(citaRecursos.id, detalleId));
  }
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
  const recursoIds = [...new Set(formData.getAll("recursoIds").map(String).filter((v) => v !== ""))];
  if (!recursoIds.every((id) => z.string().uuid().safeParse(id).success)) {
    return { error: "Uno o más recursos son inválidos." };
  }
  const result = citaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Revisa los datos de la cita." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { error: "No tienes permiso para editar la agenda." };
  const { user } = access;
  const db = getDatabase();

  try {
    const outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<CitaActionState> => {
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

      if (recursoIds.length > 0) {
        const recursoRows = await tx
          .select({ id: recursos.id })
          .from(recursos)
          .where(
            and(
              eq(recursos.organizacionId, input.organizacionId),
              eq(recursos.sucursalId, input.sucursalId),
              eq(recursos.activo, true),
              inArray(recursos.id, recursoIds),
            ),
          );
        if (recursoRows.length !== recursoIds.length) {
          return { error: "Uno o más recursos no están disponibles en esta sucursal." };
        }
      }

      let previa: CitaRow | null = null;
      if (input.id) {
        previa = await getCita(tx, input.organizacionId, input.id);
        if (!previa || !previa.activo) return { error: "La cita no existe." };
        if (!isCitaEditable(previa.estado)) {
          return { error: "Una cita cancelada, completada o no asistida solo puede reagendarse." };
        }
        if (!versionCoincide(previa, input.version)) {
          return { error: CITA_STALE_MESSAGE };
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
        capacidadSinAsignar: sucursal.capacidadSinAsignar,
        recursoIds,
      });
      if (!disponibilidad.ok) {
        const sugerencias = await sugerenciasEnConflicto(tx, {
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          usuarioId: input.usuarioId || null,
          fechaHora,
          duracionMinutos: input.duracionMinutos,
          zonaHoraria: sucursal.zonaHoraria,
          capacidadSinAsignar: sucursal.capacidadSinAsignar,
          ignoreCitaId: input.id || null,
          recursoIds,
        });
        return { error: violacionesAError(disponibilidad), sugerencias };
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
      if (previa) {
        // Edición: el estado se preserva (no forma parte de `values`).
        await tx
          .update(citas)
          .set({ ...values, version: previa.version + 1 })
          .where(eq(citas.id, previa.id));
        citaId = previa.id;
      } else {
        const [inserted] = await tx
          .insert(citas)
          .values({ ...values, estado: "pendiente", createdBy: user.id })
          .returning({ id: citas.id });
        citaId = inserted.id;
      }

      await syncServiciosCita(tx, citaId, servicioRows, user.id);
      await syncRecursosCita(tx, { citaId, organizacionId: input.organizacionId, recursoIds, userId: user.id });
      await registrarHistorialCita(tx, {
        citaId,
        organizacionId: input.organizacionId,
        usuarioId: user.id,
        accion: previa ? "editada" : "creada",
        detalle: {
          fechaHora: fechaHora.toISOString(),
          duracionMinutos: input.duracionMinutos,
          profesionalId: input.usuarioId || null,
          servicioIds,
          recursoIds,
          ...(previa
            ? {
                previo: {
                  fechaHora: previa.fechaHora.toISOString(),
                  duracionMinutos: previa.duracionMinutos,
                  profesionalId: previa.usuarioId,
                },
              }
            : {}),
        },
      });
      if (!previa) {
        // El cliente puede autogestionar la cita: el enlace llega en el correo
        // de confirmación (mismo canal que las reservas web).
        const gestion = await emitirTokenGestion(tx, {
          organizacionId: input.organizacionId,
          citaId,
        });
        await encolarAvisoCita(tx, {
          organizacionId: input.organizacionId,
          citaId,
          tipo: TIPO_CONFIRMACION,
          gestionUrl: gestion?.url ?? null,
        });
      } else if (fechaHora.getTime() !== previa.fechaHora.getTime()) {
        await encolarAvisoCita(tx, {
          organizacionId: input.organizacionId,
          citaId,
          tipo: TIPO_CAMBIO,
          fechaHoraPrevia: previa.fechaHora,
        });
      }
      return { success: true, message: "Cita guardada correctamente.", citaId };
    }),
    );

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
  version: z.coerce.number().int().min(1).optional(),
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
    const outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<CitaMutationResult> => {
      const cita = await getCita(tx, input.organizacionId, input.citaId);
      if (!cita || !cita.activo) return { success: false, error: "La cita no existe." };
      if (!canAccessBranch(access, cita.sucursalId)) {
        return { success: false, error: "La cita pertenece a una sucursal sin acceso." };
      }
      if (!isCitaEditable(cita.estado)) {
        return { success: false, error: "Solo se pueden modificar servicios en citas pendientes, confirmadas o en proceso." };
      }
      if (!versionCoincide(cita, input.version)) {
        return { success: false, error: CITA_STALE_MESSAGE };
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
      await tx
        .update(citas)
        .set({ totalEstimado, duracionMinutos: duracion, version: cita.version + 1, updatedBy: user.id })
        .where(eq(citas.id, cita.id));
      await registrarHistorialCita(tx, {
        citaId: cita.id,
        organizacionId: input.organizacionId,
        usuarioId: user.id,
        accion: input.agregar ? "servicio_agregado" : "servicio_quitado",
        detalle: { servicioId: input.servicioId },
      });
      return { success: true, message: input.agregar ? "Servicio agregado." : "Servicio quitado." };
    }),
    );

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
  version: z.coerce.number().int().min(1).optional(),
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
    const outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<CitaMutationResult> => {
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

      if (!versionCoincide(cita, input.version)) {
        return { success: false, error: CITA_STALE_MESSAGE };
      }
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
        // La cita conserva sus recursos asignados al reagendar.
        const recursoIds = await recursosDeCita(tx, cita.id);
        const disponibilidad = await validarDisponibilidadCita(tx, {
          organizacionId: input.organizacionId,
          sucursalId: cita.sucursalId,
          usuarioId: cita.usuarioId,
          fechaHora,
          duracionMinutos: cita.duracionMinutos,
          zonaHoraria: sucursal.zonaHoraria,
          ignoreCitaId: cita.id,
          capacidadSinAsignar: sucursal.capacidadSinAsignar,
          recursoIds,
        });
        if (!disponibilidad.ok) {
          const sugerencias = await sugerenciasEnConflicto(tx, {
            organizacionId: input.organizacionId,
            sucursalId: cita.sucursalId,
            usuarioId: cita.usuarioId,
            fechaHora,
            duracionMinutos: cita.duracionMinutos,
            zonaHoraria: sucursal.zonaHoraria,
            capacidadSinAsignar: sucursal.capacidadSinAsignar,
            ignoreCitaId: cita.id,
            recursoIds,
          });
          return { success: false, error: violacionesAError(disponibilidad), sugerencias };
        }
      }

      await tx
        .update(citas)
        .set({ estado: input.estado, fechaHora, version: cita.version + 1, updatedBy: user.id })
        .where(eq(citas.id, cita.id));
      await registrarHistorialCita(tx, {
        citaId: cita.id,
        organizacionId: input.organizacionId,
        usuarioId: user.id,
        accion: "estado",
        detalle: {
          de: cita.estado,
          a: input.estado,
          ...(fechaHora.getTime() !== cita.fechaHora.getTime()
            ? { fechaHora: fechaHora.toISOString(), fechaHoraPrevia: cita.fechaHora.toISOString() }
            : {}),
        },
      });
      if (input.estado === "cancelada") {
        await encolarAvisoCita(tx, { organizacionId: input.organizacionId, citaId: cita.id, tipo: TIPO_CANCELACION });
      } else if (input.estado === "confirmada") {
        // Citas sin token (legadas o internas) reciben su enlace de
        // autogestión en el correo de confirmación.
        const gestion = await emitirTokenGestion(tx, {
          organizacionId: input.organizacionId,
          citaId: cita.id,
        });
        await encolarAvisoCita(tx, {
          organizacionId: input.organizacionId,
          citaId: cita.id,
          tipo: TIPO_CONFIRMACION,
          gestionUrl: gestion?.url ?? null,
        });
      } else if (input.estado === "pendiente" && fechaHora.getTime() !== cita.fechaHora.getTime()) {
        await encolarAvisoCita(tx, {
          organizacionId: input.organizacionId,
          citaId: cita.id,
          tipo: TIPO_CAMBIO,
          fechaHoraPrevia: cita.fechaHora,
        });
      }
      return { success: true, message: "Estado actualizado." };
    }),
    );

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
  const parsed = z
    .object({
      organizationId: z.string().uuid(),
      id: z.string().uuid(),
      version: z.coerce.number().int().min(1).optional(),
    })
    .safeParse({ organizationId, id, version: formData.get("version") ?? undefined });
  if (!parsed.success) return { success: false, error: "Datos inválidos." };
  const access = await checkPermission(organizationId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar la agenda." };
  const { user } = access;
  const db = getDatabase();
  const [cita] = await db
    .select({ sucursalId: citas.sucursalId, version: citas.version })
    .from(citas)
    .where(and(eq(citas.id, id), eq(citas.organizacionId, organizationId)))
    .limit(1);
  if (!cita) return { success: false, error: "La cita no existe." };
  if (!canAccessBranch(access, cita.sucursalId)) {
    return { success: false, error: "La cita pertenece a una sucursal sin acceso." };
  }
  if (!versionCoincide(cita, parsed.data.version)) {
    return { success: false, error: CITA_STALE_MESSAGE };
  }
  await withDbRetry(() =>
    db.transaction(async (tx) => {
      await tx
        .update(citas)
      .set({ activo: !active, version: cita.version + 1, updatedBy: user.id })
      .where(and(eq(citas.id, id), eq(citas.organizacionId, organizationId)));
    await registrarHistorialCita(tx, {
      citaId: id,
      organizacionId: organizationId,
      usuarioId: user.id,
      accion: active ? "ocultada" : "reactivada",
    });
    if (active) {
      await encolarAvisoCita(tx, { organizacionId: organizationId, citaId: id, tipo: TIPO_CANCELACION });
    }
  }),
  );
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/pos");
  return { success: true, message: active ? "Cita desactivada." : "Cita reactivada." };
}

const moveSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  fechaHora: z.string().min(1),
  usuarioId: z.string().uuid().optional().or(z.literal("")),
  version: z.coerce.number().int().min(1).optional(),
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

  if (!versionCoincide(cita, input.version)) {
    return { success: false, error: CITA_STALE_MESSAGE };
  }

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

  // Mover conserva los recursos asignados a la cita.
  const recursoIds = await recursosDeCita(tx, cita.id);
  const disponibilidad = await validarDisponibilidadCita(tx, {
    organizacionId: input.organizacionId,
    sucursalId: cita.sucursalId,
    usuarioId,
    fechaHora,
    duracionMinutos: cita.duracionMinutos,
    zonaHoraria: sucursal.zonaHoraria,
    ignoreCitaId: cita.id,
    capacidadSinAsignar: sucursal.capacidadSinAsignar,
    recursoIds,
  });
  if (!disponibilidad.ok) {
    const sugerencias = await sugerenciasEnConflicto(tx, {
      organizacionId: input.organizacionId,
      sucursalId: cita.sucursalId,
      usuarioId,
      fechaHora,
      duracionMinutos: cita.duracionMinutos,
      zonaHoraria: sucursal.zonaHoraria,
      capacidadSinAsignar: sucursal.capacidadSinAsignar,
      ignoreCitaId: cita.id,
      recursoIds,
    });
    return { success: false, error: violacionesAError(disponibilidad), sugerencias };
  }

  await tx
    .update(citas)
    .set({
      fechaHora,
      usuarioId,
      ...(opts.reactivarAPendiente ? { estado: "pendiente" } : {}),
      version: cita.version + 1,
      updatedBy: userId,
    })
    .where(eq(citas.id, cita.id));
  await registrarHistorialCita(tx, {
    citaId: cita.id,
    organizacionId: input.organizacionId,
    usuarioId: userId,
    accion: opts.reactivarAPendiente ? "reagendada" : "movida",
    detalle: {
      fechaHoraDe: cita.fechaHora.toISOString(),
      fechaHoraA: fechaHora.toISOString(),
      profesionalDe: cita.usuarioId,
      profesionalA: usuarioId,
      ...(opts.reactivarAPendiente ? { estadoDe: cita.estado } : {}),
    },
  });
  if (fechaHora.getTime() !== cita.fechaHora.getTime()) {
    // Si la cita aún no tiene enlace de autogestión (legada), el correo de
    // cambio lo entrega; si ya lo tiene, el enlace original sigue vigente.
    const gestion = await emitirTokenGestion(tx, {
      organizacionId: input.organizacionId,
      citaId: cita.id,
    });
    await encolarAvisoCita(tx, {
      organizacionId: input.organizacionId,
      citaId: cita.id,
      tipo: TIPO_CAMBIO,
      fechaHoraPrevia: cita.fechaHora,
      gestionUrl: gestion?.url ?? null,
    });
  }
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
    const outcome = await withDbRetry(() =>
      db.transaction((tx) => moverCitaEnTx(tx, input, formData, access, { reactivarAPendiente: false })),
    );
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
    const outcome = await withDbRetry(() =>
      db.transaction((tx) => moverCitaEnTx(tx, input, formData, access, { reactivarAPendiente: true })),
    );
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

const duracionSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  // Rango alineado al asa de la tarjeta: snap de 15 min, 15–720.
  duracionMinutos: z.coerce.number().int().min(15).max(720),
  version: z.coerce.number().int().min(1).optional(),
});

/**
 * Ajusta la duración de una cita (asa inferior de la tarjeta) conservando su
 * inicio, profesional y estado. Valida múltiplo de 15, versión optimista y
 * disponibilidad contra citas, bloqueos y recursos existentes. No encola aviso
 * al cliente: la hora de inicio no cambia.
 */
export async function cambiarDuracionCita(formData: FormData): Promise<CitaMutationResult> {
  const result = duracionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) {
    return { success: false, error: "La duración debe ser un múltiplo de 15 entre 15 y 720 minutos." };
  }
  const input = result.data;
  if (input.duracionMinutos % 15 !== 0) {
    return { success: false, error: "La duración debe ser múltiplo de 15 minutos." };
  }
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar la agenda." };
  const userId = access.user.id;
  const db = getDatabase();

  try {
    const outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<CitaMutationResult> => {
        const referencia = await getCita(tx, input.organizacionId, input.citaId);
      if (!referencia || !referencia.activo) {
        return { success: false, error: "La cita no existe." };
      }
      if (!canAccessBranch(access, referencia.sucursalId)) {
        return { success: false, error: "La cita pertenece a una sucursal sin acceso." };
      }
      const sucursal = await lockSucursalAgenda(tx, input.organizacionId, referencia.sucursalId);
      if (!sucursal) return { success: false, error: "La sucursal ya no existe." };
      // Relectura bajo el lock de sucursal para validar el estado más reciente.
      const cita = await getCita(tx, input.organizacionId, input.citaId);
      if (!cita || !cita.activo) return { success: false, error: "La cita no existe." };
      if (!isCitaEditable(cita.estado)) {
        return {
          success: false,
          error: "Solo se puede ajustar la duración de citas pendientes, confirmadas o en proceso.",
        };
      }
      if (!versionCoincide(cita, input.version)) {
        return { success: false, error: CITA_STALE_MESSAGE };
      }
      if (input.duracionMinutos === cita.duracionMinutos) {
        return { success: true, message: "La duración ya era la indicada." };
      }

      // La cita conserva sus recursos asignados al cambiar duración.
      const recursoIds = await recursosDeCita(tx, cita.id);
      const disponibilidad = await validarDisponibilidadCita(tx, {
        organizacionId: input.organizacionId,
        sucursalId: cita.sucursalId,
        usuarioId: cita.usuarioId,
        fechaHora: cita.fechaHora,
        duracionMinutos: input.duracionMinutos,
        zonaHoraria: sucursal.zonaHoraria,
        ignoreCitaId: cita.id,
        capacidadSinAsignar: sucursal.capacidadSinAsignar,
        recursoIds,
      });
      if (!disponibilidad.ok) {
        const sugerencias = await sugerenciasEnConflicto(tx, {
          organizacionId: input.organizacionId,
          sucursalId: cita.sucursalId,
          usuarioId: cita.usuarioId,
          fechaHora: cita.fechaHora,
          duracionMinutos: input.duracionMinutos,
          zonaHoraria: sucursal.zonaHoraria,
          capacidadSinAsignar: sucursal.capacidadSinAsignar,
          ignoreCitaId: cita.id,
          recursoIds,
        });
        return { success: false, error: violacionesAError(disponibilidad), sugerencias };
      }

      await tx
        .update(citas)
        .set({
          duracionMinutos: input.duracionMinutos,
          version: cita.version + 1,
          updatedBy: userId,
        })
        .where(eq(citas.id, cita.id));
      await registrarHistorialCita(tx, {
        citaId: cita.id,
        organizacionId: input.organizacionId,
        usuarioId: userId,
        accion: "duracion",
        detalle: { de: cita.duracionMinutos, a: input.duracionMinutos },
      });
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: cita.sucursalId,
        usuarioId: userId,
        accion: "agenda.cita_duracion",
        entidad: "citas",
        entidadId: cita.id,
        detalle: {
          duracionDe: cita.duracionMinutos,
          duracionA: input.duracionMinutos,
        },
      });
      return { success: true, message: "Duración actualizada." };
    }),
    );

    if (outcome.success) {
      revalidatePath("/admin/agenda");
      revalidatePath("/admin/pos");
    }
    return outcome;
  } catch (error) {
    console.error("cambiarDuracionCita", error);
    return { success: false, error: "No se pudo cambiar la duración." };
  }
}

/* ------------------------------------------------------------------ */
/* Disponibilidad: horarios, bloqueos y capacidad "sin asignar"          */
/* ------------------------------------------------------------------ */

const horarioSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  diaSemana: z.coerce.number().int().min(0).max(6),
  iniciaMinutos: z.coerce.number().int().min(0).max(1439),
  terminaMinutos: z.coerce.number().int().min(1).max(1440),
});

/** Crea un turno de atención para un día de la semana en la sucursal. */
export async function saveHorarioSucursal(formData: FormData): Promise<CitaMutationResult> {
  const result = horarioSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { success: false, error: "Datos inválidos para el horario." };
  const input = result.data;
  if (input.iniciaMinutos >= input.terminaMinutos) {
    return { success: false, error: "La hora de inicio debe ser anterior a la de cierre." };
  }
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para configurar la agenda." };
  if (!(await assertBranchScope(access, input.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  const db = getDatabase();

  try {
    const outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<CitaMutationResult> => {
        // Rechaza turnos traslapados en el mismo día: los huecos entre turnos
      // (comida, limpieza) se modelan como dos turnos no traslapados.
      const existentes = await tx
        .select({ iniciaMinutos: horariosSucursales.iniciaMinutos, terminaMinutos: horariosSucursales.terminaMinutos })
        .from(horariosSucursales)
        .where(
          and(
            eq(horariosSucursales.sucursalId, input.sucursalId),
            eq(horariosSucursales.diaSemana, input.diaSemana),
            eq(horariosSucursales.activo, true),
          ),
        );
      const traslapa = existentes.some(
        (turno) => input.iniciaMinutos < turno.terminaMinutos && turno.iniciaMinutos < input.terminaMinutos,
      );
      if (traslapa) {
        return { success: false, error: "El turno se traslapa con otro horario activo de ese día." };
      }
      await tx.insert(horariosSucursales).values({
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        diaSemana: input.diaSemana,
        iniciaMinutos: input.iniciaMinutos,
        terminaMinutos: input.terminaMinutos,
        createdBy: access.user.id,
      });
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "agenda.horario_creado",
        entidad: "horarios_sucursales",
        detalle: {
          diaSemana: input.diaSemana,
          iniciaMinutos: input.iniciaMinutos,
          terminaMinutos: input.terminaMinutos,
        },
      });
      return { success: true, message: "Horario agregado." };
    }),
    );
    if (outcome.success) revalidatePath("/admin/agenda");
    return outcome;
  } catch (error) {
    console.error("saveHorarioSucursal", error);
    return { success: false, error: "No se pudo guardar el horario." };
  }
}

/** Activa/desactiva un turno de horario existente. */
export async function toggleHorarioSucursal(formData: FormData): Promise<CitaMutationResult> {
  const parsed = z
    .object({ organizacionId: z.string().uuid(), id: z.string().uuid(), activo: z.coerce.boolean() })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Datos inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para configurar la agenda." };
  const db = getDatabase();
  const [horario] = await db
    .select({ sucursalId: horariosSucursales.sucursalId })
    .from(horariosSucursales)
    .where(and(eq(horariosSucursales.id, input.id), eq(horariosSucursales.organizacionId, input.organizacionId)))
    .limit(1);
  if (!horario) return { success: false, error: "El horario no existe." };
  if (!(await assertBranchScope(access, horario.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  await db
    .update(horariosSucursales)
    .set({ activo: !input.activo, updatedBy: access.user.id })
    .where(eq(horariosSucursales.id, input.id));
  revalidatePath("/admin/agenda");
  return { success: true, message: input.activo ? "Horario desactivado." : "Horario reactivado." };
}

const bloqueoSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  usuarioId: z.string().uuid().optional().or(z.literal("")),
  iniciaAt: z.string().min(1, "Indica el inicio del bloqueo."),
  terminaAt: z.string().min(1, "Indica el fin del bloqueo."),
  tipo: z.enum(BLOQUEO_TIPOS),
  motivo: z.string().trim().max(400).optional().or(z.literal("")),
});

/**
 * Crea un bloqueo de agenda (descanso, cierre, personal, mantenimiento).
 * `usuarioId` vacío = bloqueo general de la sucursal. Las horas se interpretan
 * en la zona horaria de la sucursal.
 */
export async function saveBloqueoAgenda(formData: FormData): Promise<CitaMutationResult> {
  const result = bloqueoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { success: false, error: result.error.issues[0]?.message ?? "Datos inválidos." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para configurar la agenda." };
  const db = getDatabase();

  try {
    const outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<CitaMutationResult> => {
        const sucursal = await lockSucursalAgenda(tx, input.organizacionId, input.sucursalId);
      if (!sucursal) return { success: false, error: "La sucursal no existe o no pertenece a la organización." };
      if (!sucursal.activo) return { success: false, error: "La sucursal está inactiva." };
      if (!canAccessBranch(access, input.sucursalId)) {
        return { success: false, error: "No tienes acceso a esta sucursal." };
      }
      const inicia = parseFechaHoraInput(input.iniciaAt, sucursal.zonaHoraria);
      const termina = parseFechaHoraInput(input.terminaAt, sucursal.zonaHoraria);
      if (!inicia || !termina) return { success: false, error: "Fechas de bloqueo inválidas." };
      if (inicia.getTime() >= termina.getTime()) {
        return { success: false, error: "El inicio del bloqueo debe ser anterior a su fin." };
      }
      if (input.usuarioId) {
        const asignado = await profesionalAsignadoASucursal(tx, input.organizacionId, input.sucursalId, input.usuarioId);
        if (!asignado) return { success: false, error: "El profesional no está asignado a esta sucursal." };
      }
      const [inserted] = await tx
        .insert(bloqueosAgenda)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          usuarioId: input.usuarioId || null,
          iniciaAt: inicia,
          terminaAt: termina,
          tipo: input.tipo,
          motivo: input.motivo || null,
          createdBy: access.user.id,
        })
        .returning({ id: bloqueosAgenda.id });
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "agenda.bloqueo_creado",
        entidad: "bloqueos_agenda",
        entidadId: inserted.id,
        detalle: {
          usuarioId: input.usuarioId || null,
          iniciaAt: inicia.toISOString(),
          terminaAt: termina.toISOString(),
          tipo: input.tipo,
        },
      });
      return { success: true, message: "Bloqueo creado." };
    }),
    );
    if (outcome.success) revalidatePath("/admin/agenda");
    return outcome;
  } catch (error) {
    console.error("saveBloqueoAgenda", error);
    return { success: false, error: "No se pudo crear el bloqueo." };
  }
}

/** Activa/desactiva un bloqueo de agenda. */
export async function toggleBloqueoAgenda(formData: FormData): Promise<CitaMutationResult> {
  const parsed = z
    .object({ organizacionId: z.string().uuid(), id: z.string().uuid(), activo: z.coerce.boolean() })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Datos inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para configurar la agenda." };
  const db = getDatabase();
  const [bloqueo] = await db
    .select({ sucursalId: bloqueosAgenda.sucursalId })
    .from(bloqueosAgenda)
    .where(and(eq(bloqueosAgenda.id, input.id), eq(bloqueosAgenda.organizacionId, input.organizacionId)))
    .limit(1);
  if (!bloqueo) return { success: false, error: "El bloqueo no existe." };
  if (!(await assertBranchScope(access, bloqueo.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  await db
    .update(bloqueosAgenda)
    .set({ activo: !input.activo, updatedBy: access.user.id })
    .where(eq(bloqueosAgenda.id, input.id));
  revalidatePath("/admin/agenda");
  return { success: true, message: input.activo ? "Bloqueo desactivado." : "Bloqueo reactivado." };
}

/**
 * Política de citas sin profesional: cuántas citas "sin asignar" pueden
 * coexistir en el mismo horario de la sucursal (1 = una a la vez).
 */
export async function updateCapacidadSinAsignar(formData: FormData): Promise<CitaMutationResult> {
  const parsed = z
    .object({
      organizacionId: z.string().uuid(),
      sucursalId: z.string().uuid(),
      capacidadSinAsignar: z.coerce.number().int().min(1).max(50),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Indica una capacidad entre 1 y 50." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para configurar la agenda." };
  if (!(await assertBranchScope(access, input.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  const db = getDatabase();
  await withDbRetry(() =>
    db.transaction(async (tx) => {
      await tx
        .update(sucursales)
        .set({ capacidadSinAsignar: input.capacidadSinAsignar, updatedBy: access.user.id })
      .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId)));
    await auditEvent(tx, {
      organizacionId: input.organizacionId,
      sucursalId: input.sucursalId,
      usuarioId: access.user.id,
      accion: "agenda.capacidad_sin_asignar",
      entidad: "sucursales",
      entidadId: input.sucursalId,
      detalle: { capacidadSinAsignar: input.capacidadSinAsignar },
    });
  }),
  );
  revalidatePath("/admin/agenda");
  return { success: true, message: "Capacidad actualizada." };
}

/**
 * Portal público de reservas (/reservar/[slug]): activa/desactiva la
 * sucursal y define si las reservas web se confirman al instante o quedan
 * pendientes de confirmación por el equipo.
 */
export async function updateReservasConfig(formData: FormData): Promise<CitaMutationResult> {
  const parsed = z
    .object({
      organizacionId: z.string().uuid(),
      sucursalId: z.string().uuid(),
      reservasOnline: z.coerce.boolean(),
      reservasAutoConfirmar: z.coerce.boolean(),
      reservasCancelacionHoras: z.coerce.number().int().min(0).max(720).optional(),
      reservasAnticipacionMinutos: z.coerce.number().int().min(0).max(10080).optional(),
      reservasHorizonteDias: z.coerce.number().int().min(1).max(365).optional(),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Configuración inválida." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para configurar la agenda." };
  if (!(await assertBranchScope(access, input.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  if (input.reservasOnline) {
    const negado = await requiereCapacidad(input.organizacionId, "reservas_online");
    if (negado) return { success: false, error: negado };
  }
  if (input.reservasOnline && input.reservasAutoConfirmar) {
    const negado = await requiereCapacidad(input.organizacionId, "reservas_auto_confirmar");
    if (negado) return { success: false, error: negado };
  }
  const db = getDatabase();
  await withDbRetry(() =>
    db.transaction(async (tx) => {
      await tx
        .update(sucursales)
        .set({
          reservasOnline: input.reservasOnline,
        reservasAutoConfirmar: input.reservasOnline ? input.reservasAutoConfirmar : false,
        ...(input.reservasCancelacionHoras !== undefined
          ? { reservasCancelacionHoras: input.reservasCancelacionHoras }
          : {}),
        ...(input.reservasAnticipacionMinutos !== undefined
          ? { reservasAnticipacionMinutos: input.reservasAnticipacionMinutos }
          : {}),
        ...(input.reservasHorizonteDias !== undefined
          ? { reservasHorizonteDias: input.reservasHorizonteDias }
          : {}),
        updatedBy: access.user.id,
      })
      .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId)));
    await auditEvent(tx, {
      organizacionId: input.organizacionId,
      sucursalId: input.sucursalId,
      usuarioId: access.user.id,
      accion: "agenda.reservas_config",
      entidad: "sucursales",
      entidadId: input.sucursalId,
      detalle: {
        reservasOnline: input.reservasOnline,
        reservasAutoConfirmar: input.reservasAutoConfirmar,
        reservasCancelacionHoras: input.reservasCancelacionHoras,
        reservasAnticipacionMinutos: input.reservasAnticipacionMinutos,
        reservasHorizonteDias: input.reservasHorizonteDias,
      },
    });
  }),
  );
  revalidatePath("/admin/agenda");
  return {
    success: true,
    message: input.reservasOnline
      ? "Reservas en línea activadas. Comparte el enlace con tus clientes."
      : "Reservas en línea desactivadas.",
  };
}

/**
 * Recordatorios automáticos por correo (config a nivel organización):
 * activar/desactivar y horas de anticipación (1–168). El cron
 * `/api/cron/recordatorios` respeta esta configuración.
 */
export async function updateRecordatoriosConfig(formData: FormData): Promise<CitaMutationResult> {
  const parsed = z
    .object({
      organizacionId: z.string().uuid(),
      recordatoriosActivos: z.coerce.boolean(),
      recordatoriosHorasAntes: z.coerce.number().int().min(1).max(168),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Indica entre 1 y 168 horas de anticipación." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para configurar la agenda." };
  if (input.recordatoriosActivos) {
    const negado = await requiereCapacidad(input.organizacionId, "recordatorios_email");
    if (negado) return { success: false, error: negado };
  }
  const db = getDatabase();
  await withDbRetry(() =>
    db.transaction(async (tx) => {
      await tx
        .update(organizaciones)
        .set({
        recordatoriosActivos: input.recordatoriosActivos,
        recordatoriosHorasAntes: input.recordatoriosHorasAntes,
        updatedBy: access.user.id,
      })
      .where(eq(organizaciones.id, input.organizacionId));
    await auditEvent(tx, {
      organizacionId: input.organizacionId,
      usuarioId: access.user.id,
      accion: "agenda.recordatorios_config",
      entidad: "organizaciones",
      entidadId: input.organizacionId,
      detalle: {
        recordatoriosActivos: input.recordatoriosActivos,
        recordatoriosHorasAntes: input.recordatoriosHorasAntes,
      },
    });
  }),
  );
  revalidatePath("/admin/agenda");
  return {
    success: true,
    message: input.recordatoriosActivos
      ? `Recordatorios activados: se enviarán ${input.recordatoriosHorasAntes} h antes de cada cita con correo.`
      : "Recordatorios por correo desactivados.",
  };
}

/* ------------------------------------------------------------------ */
/* Historial de la cita (panel lateral, carga perezosa)                  */
/* ------------------------------------------------------------------ */

export interface CitaHistorialEvento {
  id: string;
  accion: string;
  detalle: Record<string, unknown> | null;
  createdAt: string;
  usuarioNombre: string | null;
}

/** Devuelve los últimos movimientos de la cita (más reciente primero). */
export async function getCitaHistorial(formData: FormData): Promise<{
  success: boolean;
  error?: string;
  eventos?: CitaHistorialEvento[];
}> {
  const parsed = z
    .object({ organizacionId: z.string().uuid(), citaId: z.string().uuid() })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Datos inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "agenda.ver");
  if (!access) return { success: false, error: "No tienes permiso para ver la agenda." };
  const db = getDatabase();
  const cita = await getCita(db, input.organizacionId, input.citaId);
  if (!cita) return { success: false, error: "La cita no existe." };
  if (!canAccessBranch(access, cita.sucursalId)) {
    return { success: false, error: "La cita pertenece a una sucursal sin acceso." };
  }
  const rows = await db
    .select({
      id: citasHistorial.id,
      accion: citasHistorial.accion,
      detalle: citasHistorial.detalle,
      createdAt: citasHistorial.createdAt,
      usuarioNombre: usuarios.nombre,
    })
    .from(citasHistorial)
    .leftJoin(usuarios, eq(citasHistorial.usuarioId, usuarios.id))
    .where(
      and(
        eq(citasHistorial.citaId, input.citaId),
        eq(citasHistorial.organizacionId, input.organizacionId),
      ),
    )
    .orderBy(desc(citasHistorial.createdAt))
    .limit(30);
  return {
    success: true,
    eventos: rows.map((row) => ({
      id: row.id,
      accion: row.accion,
      detalle: row.detalle ?? null,
      createdAt: row.createdAt.toISOString(),
      usuarioNombre: row.usuarioNombre ?? null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Recursos físicos (cabina, silla, equipo) y asignación a citas         */
/* ------------------------------------------------------------------ */

const recursoSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  nombre: z.string().trim().min(2, "Indica el nombre del recurso.").max(160),
  tipo: z.enum(RECURSO_TIPOS),
  capacidad: z.coerce.number().int().min(1).max(100),
  notas: z.string().trim().max(400).optional().or(z.literal("")),
});

/** Registra un recurso físico de la sucursal (cabina, silla, equipo…). */
export async function saveRecurso(formData: FormData): Promise<CitaMutationResult> {
  const result = recursoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { success: false, error: result.error.issues[0]?.message ?? "Datos inválidos." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para configurar la agenda." };
  if (!(await assertBranchScope(access, input.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  const db = getDatabase();
  try {
    const outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<CitaMutationResult> => {
        const [inserted] = await tx
          .insert(recursos)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          nombre: input.nombre,
          tipo: input.tipo,
          capacidad: input.capacidad,
          notas: input.notas || null,
          createdBy: access.user.id,
        })
        .returning({ id: recursos.id });
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "agenda.recurso_creado",
        entidad: "recursos",
        entidadId: inserted.id,
        detalle: { nombre: input.nombre, tipo: input.tipo, capacidad: input.capacidad },
      });
      return { success: true, message: "Recurso registrado." };
    }),
    );
    if (outcome.success) revalidatePath("/admin/agenda");
    return outcome;
  } catch (error) {
    console.error("saveRecurso", error);
    return { success: false, error: "No se pudo registrar el recurso." };
  }
}

/** Activa/desactiva un recurso. Desactivar no libera citas ya agendadas. */
export async function toggleRecurso(formData: FormData): Promise<CitaMutationResult> {
  const parsed = z
    .object({ organizacionId: z.string().uuid(), id: z.string().uuid(), activo: z.coerce.boolean() })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Datos inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para configurar la agenda." };
  const db = getDatabase();
  const [recurso] = await db
    .select({ sucursalId: recursos.sucursalId })
    .from(recursos)
    .where(and(eq(recursos.id, input.id), eq(recursos.organizacionId, input.organizacionId)))
    .limit(1);
  if (!recurso) return { success: false, error: "El recurso no existe." };
  if (!(await assertBranchScope(access, recurso.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  await db
    .update(recursos)
    .set({ activo: !input.activo, updatedBy: access.user.id })
    .where(eq(recursos.id, input.id));
  revalidatePath("/admin/agenda");
  return { success: true, message: input.activo ? "Recurso desactivado." : "Reactivado." };
}

const recursoCitaSchema = z.object({
  organizacionId: z.string().uuid(),
  citaId: z.string().uuid(),
  recursoId: z.string().uuid(),
  agregar: z.coerce.boolean(),
  version: z.coerce.number().int().min(1).optional(),
});

/**
 * Asigna o libera un recurso en una cita existente (panel lateral). Al
 * agregarlo se valida que el recurso esté libre en el horario de la cita.
 */
export async function toggleRecursoCita(formData: FormData): Promise<CitaMutationResult> {
  const result = recursoCitaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!result.success) return { success: false, error: "Datos inválidos para el recurso." };
  const input = result.data;
  const access = await checkPermission(input.organizacionId, "agenda.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar la agenda." };
  const { user } = access;
  const db = getDatabase();

  try {
    const outcome = await withDbRetry(() =>
      db.transaction(async (tx): Promise<CitaMutationResult> => {
        const cita = await getCita(tx, input.organizacionId, input.citaId);
      if (!cita || !cita.activo) return { success: false, error: "La cita no existe." };
      if (!canAccessBranch(access, cita.sucursalId)) {
        return { success: false, error: "La cita pertenece a una sucursal sin acceso." };
      }
      if (!isCitaEditable(cita.estado)) {
        return { success: false, error: "Solo se pueden modificar recursos en citas pendientes, confirmadas o en proceso." };
      }
      if (!versionCoincide(cita, input.version)) {
        return { success: false, error: CITA_STALE_MESSAGE };
      }

      const [recurso] = await tx
        .select({ id: recursos.id, nombre: recursos.nombre })
        .from(recursos)
        .where(
          and(
            eq(recursos.id, input.recursoId),
            eq(recursos.organizacionId, input.organizacionId),
            eq(recursos.sucursalId, cita.sucursalId),
            eq(recursos.activo, true),
          ),
        )
        .limit(1);
      if (!recurso) return { success: false, error: "El recurso no está disponible en esta sucursal." };

      const [existente] = await tx
        .select({ id: citaRecursos.id, activo: citaRecursos.activo })
        .from(citaRecursos)
        .where(and(eq(citaRecursos.citaId, cita.id), eq(citaRecursos.recursoId, input.recursoId)))
        .limit(1);

      if (input.agregar) {
        if (existente?.activo) return { success: true, message: "El recurso ya está en la cita." };
        // El recurso debe estar libre en el horario actual de la cita.
        const sucursal = await lockSucursalAgenda(tx, input.organizacionId, cita.sucursalId);
        if (!sucursal) return { success: false, error: "La sucursal ya no existe." };
        const actuales = await recursosDeCita(tx, cita.id);
        const recursoIds = [...actuales.filter((id) => id !== input.recursoId), input.recursoId];
        const disponibilidad = await validarDisponibilidadCita(tx, {
          organizacionId: input.organizacionId,
          sucursalId: cita.sucursalId,
          usuarioId: cita.usuarioId,
          fechaHora: cita.fechaHora,
          duracionMinutos: cita.duracionMinutos,
          zonaHoraria: sucursal.zonaHoraria,
          ignoreCitaId: cita.id,
          capacidadSinAsignar: sucursal.capacidadSinAsignar,
          recursoIds,
        });
        if (!disponibilidad.ok) return { success: false, error: violacionesAError(disponibilidad) };
        if (existente) {
          await tx.update(citaRecursos).set({ activo: true, updatedBy: user.id }).where(eq(citaRecursos.id, existente.id));
        } else {
          await tx.insert(citaRecursos).values({
            citaId: cita.id,
            recursoId: input.recursoId,
            organizacionId: input.organizacionId,
            createdBy: user.id,
          });
        }
      } else {
        if (!existente?.activo) return { success: true, message: "El recurso no estaba en la cita." };
        await tx.update(citaRecursos).set({ activo: false, updatedBy: user.id }).where(eq(citaRecursos.id, existente.id));
      }

      await tx.update(citas).set({ version: cita.version + 1, updatedBy: user.id }).where(eq(citas.id, cita.id));
      await registrarHistorialCita(tx, {
        citaId: cita.id,
        organizacionId: input.organizacionId,
        usuarioId: user.id,
        accion: input.agregar ? "recurso_agregado" : "recurso_quitado",
        detalle: { recursoId: input.recursoId, nombre: recurso.nombre },
      });
      return { success: true, message: input.agregar ? "Recurso asignado." : "Recurso liberado." };
    }),
    );

    if (outcome.success) {
      revalidatePath("/admin/agenda");
      revalidatePath("/admin/pos");
    }
    return outcome;
  } catch (error) {
    console.error("toggleRecursoCita", error);
    return { success: false, error: "No se pudo actualizar los recursos." };
  }
}
