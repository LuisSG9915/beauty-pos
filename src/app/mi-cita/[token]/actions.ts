"use server";

import {
  cancelarReservaPublica,
  obtenerReservaPorToken,
  reagendarReservaPublica,
  slotsGestionReserva,
  type ReservaGestionPublica,
} from "@/modules/reservas/gestion";
import { clientIp } from "@/lib/client-ip";

/**
 * Consulta del estado de la cita por su enlace de autogestión. El token se
 * trata como secreto: solo viaja en la URL del cliente y en su correo; en la
 * base queda hasheado. La consulta está limitada por IP para frenar fuerza
 * bruta sobre tokens arbitrarios.
 */
export async function consultarMiCita(token: string): Promise<ReservaGestionPublica | null> {
  return obtenerReservaPorToken(token, { ip: await clientIp() });
}

export async function slotsMiCita(
  token: string,
  diaKey: string,
): Promise<{ ok: true; slots: string[] } | { ok: false; error: string }> {
  return slotsGestionReserva(token, diaKey);
}

export async function cancelarMiCita(
  token: string,
  telefono: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return cancelarReservaPublica(token, telefono);
}

export async function reagendarMiCita(
  token: string,
  fechaHora: string,
  telefono: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fecha = new Date(fechaHora);
  if (Number.isNaN(fecha.getTime())) return { ok: false, error: "Horario inválido." };
  return reagendarReservaPublica(token, fecha, telefono);
}
