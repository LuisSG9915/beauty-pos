"use server";

import { getDatabase } from "@/db/client";
import { clientIp } from "@/lib/client-ip";
import { verificarTurnstileToken } from "@/lib/turnstile";
import { getOcupacionAgenda } from "@/modules/agenda/service";
import { dayBoundsUtc } from "@/modules/agenda/timezone";
import { esProfesionalReservable, getServiciosReservables, getSucursalReservable } from "@/modules/reservas/queries";
import { slotsDisponiblesDia } from "@/modules/reservas/rules";
import { crearReservaPublica } from "@/modules/reservas/service";

/**
 * Slots libres (ISO 8601) de un día para un servicio en una sucursal
 * reservable. Endpoint público: solo devuelve horarios, nunca datos de
 * clientes ni de otras citas.
 */
export async function obtenerSlotsReserva(input: {
  organizacionId: string;
  sucursalId: string;
  servicioId: string;
  diaKey: string;
  usuarioId?: string | null;
}): Promise<{ ok: true; slots: string[] } | { ok: false; error: string }> {
  const sucursal = await getSucursalReservable(input.organizacionId, input.sucursalId);
  if (!sucursal) return { ok: false, error: "La sucursal no acepta reservas en línea." };

  const servicios = await getServiciosReservables(input.organizacionId);
  const servicio = servicios.find((s) => s.id === input.servicioId);
  if (!servicio) return { ok: false, error: "El servicio no está disponible." };

  const db = getDatabase();
  const usuarioId = input.usuarioId || null;
  if (usuarioId && !(await esProfesionalReservable(db, input.organizacionId, input.sucursalId, usuarioId))) {
    return { ok: false, error: "El profesional elegido no está disponible." };
  }

  const bounds = dayBoundsUtc(input.diaKey, sucursal.zonaHoraria);
  if (!bounds) return { ok: false, error: "Fecha inválida." };

  const ahora = new Date();
  // Horizonte máximo: días fuera de la ventana no exponen horarios.
  if (bounds.terminaAt.getTime() > ahora.getTime() + sucursal.horizonteDias * 24 * 60 * 60_000) {
    return { ok: true, slots: [] };
  }

  const ocupacion = await getOcupacionAgenda(db, {
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    desde: bounds.iniciaAt,
    hasta: bounds.terminaAt,
  });

  const slots = slotsDisponiblesDia({
    diaKey: input.diaKey,
    duracionMinutos: servicio.duracionMinutos,
    ocupacion,
    zonaHoraria: sucursal.zonaHoraria,
    capacidadSinAsignar: sucursal.capacidadSinAsignar,
    // La anticipación mínima corre el "ahora" efectivo hacia adelante.
    ahora: new Date(ahora.getTime() + sucursal.anticipacionMinutos * 60_000),
    pasoMinutos: 30,
    usuarioId,
  });

  return { ok: true, slots: slots.map((s) => s.toISOString()) };
}

export async function confirmarReserva(input: {
  organizacionId: string;
  sucursalId: string;
  servicioId: string;
  fechaHora: string;
  usuarioId?: string | null;
  nombre: string;
  telefono: string;
  correo?: string;
  notas?: string;
  turnstileToken?: string | null;
}): Promise<{ ok: true; confirmada: boolean; gestionUrl: string | null } | { ok: false; error: string }> {
  const ip = await clientIp();

  const turnstileValido = await verificarTurnstileToken(input.turnstileToken, ip);
  if (!turnstileValido) {
    return { ok: false, error: "Verificación de seguridad fallida. Por favor intenta de nuevo." };
  }

  const fechaHora = new Date(input.fechaHora);
  if (Number.isNaN(fechaHora.getTime())) {
    return { ok: false, error: "Horario inválido." };
  }

  const sucursal = await getSucursalReservable(input.organizacionId, input.sucursalId);
  if (!sucursal) {
    return { ok: false, error: "La sucursal no acepta reservas en línea." };
  }

  const result = await crearReservaPublica({
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    servicioId: input.servicioId,
    fechaHora,
    usuarioId: input.usuarioId || null,
    cliente: {
      nombre: input.nombre,
      telefono: input.telefono,
      correo: input.correo,
      notas: input.notas,
    },
    ip: await clientIp(),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, confirmada: result.confirmada, gestionUrl: result.gestionUrl };
}
