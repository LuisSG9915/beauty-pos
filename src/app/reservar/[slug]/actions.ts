"use server";

import { getDatabase } from "@/db/client";
import { getOcupacionAgenda } from "@/modules/agenda/service";
import { dayBoundsUtc } from "@/modules/agenda/timezone";
import { getServiciosReservables, getSucursalReservable } from "@/modules/reservas/queries";
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
}): Promise<{ ok: true; slots: string[] } | { ok: false; error: string }> {
  const sucursal = await getSucursalReservable(input.organizacionId, input.sucursalId);
  if (!sucursal) return { ok: false, error: "La sucursal no acepta reservas en línea." };

  const servicios = await getServiciosReservables(input.organizacionId);
  const servicio = servicios.find((s) => s.id === input.servicioId);
  if (!servicio) return { ok: false, error: "El servicio no está disponible." };

  const bounds = dayBoundsUtc(input.diaKey, sucursal.zonaHoraria);
  if (!bounds) return { ok: false, error: "Fecha inválida." };

  const db = getDatabase();
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
    ahora: new Date(),
    pasoMinutos: 30,
  });

  return { ok: true, slots: slots.map((s) => s.toISOString()) };
}

export async function confirmarReserva(input: {
  organizacionId: string;
  sucursalId: string;
  servicioId: string;
  fechaHora: string;
  nombre: string;
  telefono: string;
  correo?: string;
  notas?: string;
}): Promise<{ ok: true; confirmada: boolean } | { ok: false; error: string }> {
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
    cliente: {
      nombre: input.nombre,
      telefono: input.telefono,
      correo: input.correo,
      notas: input.notas,
    },
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, confirmada: result.confirmada };
}
