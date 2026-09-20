import { and, eq, or } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { servicios } from "@/db/schema/catalogs";
import { clientes, sucursales } from "@/db/schema/core";
import { citas, detalleCitasServicios } from "@/db/schema/operations";
import { auditEvent } from "@/lib/audit";
import { contextoSuscripcion, tieneCapacidad } from "@/modules/billing/queries";
import { getOcupacionAgenda, lockSucursalAgenda, registrarHistorialCita } from "@/modules/agenda/service";
import { validateCitaAvailability } from "@/modules/agenda/rules";
import { getZonedParts } from "@/modules/agenda/timezone";
import { intervalFromDates } from "@/modules/agenda/types";
import { normalizarContacto, validarDatosReserva, type ReservaClienteInput } from "./rules";

export type ReservaResult =
  | { ok: true; citaId: string; confirmada: boolean }
  | { ok: false; error: string };

type Tx = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

/** Cliente por teléfono o correo normalizados dentro de la organización. */
async function findOrCreateCliente(
  tx: Tx,
  organizacionId: string,
  input: ReservaClienteInput,
): Promise<string> {
  const telefonoNormalizado = normalizarContacto(input.telefono);
  const correoNormalizado = normalizarContacto(input.correo);

  const conditions = [eq(clientes.organizacionId, organizacionId), eq(clientes.activo, true)];
  const coincidencias = [];
  if (telefonoNormalizado) coincidencias.push(eq(clientes.telefonoNormalizado, telefonoNormalizado));
  if (correoNormalizado) coincidencias.push(eq(clientes.correoNormalizado, correoNormalizado));
  if (coincidencias.length > 0) {
    const [existente] = await tx
      .select({ id: clientes.id })
      .from(clientes)
      .where(and(...conditions, or(...coincidencias)))
      .limit(1);
    if (existente) return existente.id;
  }

  const nombreCompleto = input.nombre.trim();
  const [nombre, ...resto] = nombreCompleto.split(/\s+/);
  const [insertado] = await tx
    .insert(clientes)
    .values({
      organizacionId,
      nombre: nombre ?? nombreCompleto,
      apellidoPaterno: resto.length > 0 ? resto.join(" ") : null,
      telefono: input.telefono.trim(),
      telefonoNormalizado,
      correo: input.correo?.trim() || null,
      correoNormalizado,
    })
    .returning({ id: clientes.id });
  if (!insertado) throw new Error("No se pudo registrar al cliente.");
  return insertado.id;
}

/**
 * Crea una reserva desde el portal público. Serializa con el lock de agenda de
 * la sucursal (mismo que `saveCita`), re-valida disponibilidad dentro de la
 * transacción y deja historial + auditoría con usuarioId null (canal web).
 */
export async function crearReservaPublica(input: {
  organizacionId: string;
  sucursalId: string;
  servicioId: string;
  /** Instante UTC elegido por el cliente. */
  fechaHora: Date;
  cliente: ReservaClienteInput;
}): Promise<ReservaResult> {
  const datos = validarDatosReserva(input.cliente);
  if (!datos.ok) return { ok: false, error: datos.error };
  if (input.fechaHora.getTime() <= Date.now()) {
    return { ok: false, error: "Elige un horario futuro." };
  }

  const db = getDatabase();
  try {
    return await db.transaction(async (tx): Promise<ReservaResult> => {
      // El lock FOR UPDATE serializa reservas web y cambios de agenda de la
      // sucursal: dos clientes no pueden tomar el mismo horario a la vez.
      const sucursal = await lockSucursalAgenda(tx, input.organizacionId, input.sucursalId);
      if (!sucursal || !sucursal.activo) {
        return { ok: false, error: "La sucursal no está disponible." };
      }

      const [config] = await tx
        .select({
          reservasOnline: sucursales.reservasOnline,
          autoConfirmar: sucursales.reservasAutoConfirmar,
        })
        .from(sucursales)
        .where(eq(sucursales.id, input.sucursalId))
        .limit(1);
      if (!config?.reservasOnline) {
        return { ok: false, error: "Esta sucursal no acepta reservas en línea por ahora." };
      }

      // Re-verificación dentro del lock: el plan o la suscripción pudieron
      // cambiar entre el render del portal y el submit del cliente.
      const suscripcion = await contextoSuscripcion(input.organizacionId, tx);
      if (!tieneCapacidad(suscripcion, "reservas_online")) {
        return { ok: false, error: "El negocio no puede recibir reservas en línea por ahora." };
      }
      // La auto-confirmación solo aplica si el plan la incluye: si el negocio
      // bajó de plan con el flag activo, las reservas quedan pendientes.
      const autoConfirmar = config.autoConfirmar && tieneCapacidad(suscripcion, "reservas_auto_confirmar");

      const [servicio] = await tx
        .select({
          id: servicios.id,
          precio: servicios.precioBase,
          duracionMinutos: servicios.duracionMinutos,
        })
        .from(servicios)
        .where(
          and(
            eq(servicios.id, input.servicioId),
            eq(servicios.organizacionId, input.organizacionId),
            eq(servicios.activo, true),
            eq(servicios.visibleAgenda, true),
          ),
        )
        .limit(1);
      if (!servicio) {
        return { ok: false, error: "El servicio elegido ya no está disponible." };
      }

      const candidato = intervalFromDates(input.fechaHora, servicio.duracionMinutos);
      const partes = getZonedParts(input.fechaHora, sucursal.zonaHoraria);
      const ocupacion = await getOcupacionAgenda(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        desde: input.fechaHora,
        hasta: new Date(candidato.terminaAtMs),
      });
      const disponibilidad = validateCitaAvailability({
        candidato: { ...candidato, usuarioId: null },
        diaSemana: partes.diaSemana,
        iniciaMinutosLocal: partes.minutosDelDia,
        duracionMinutos: servicio.duracionMinutos,
        horarios: ocupacion.horarios,
        bloqueos: ocupacion.bloqueos,
        citas: ocupacion.citas,
        recursos: ocupacion.recursos,
        capacidadSinAsignar: sucursal.capacidadSinAsignar,
      });
      if (!disponibilidad.ok) {
        return { ok: false, error: "Ese horario acaba de ocuparse. Elige otro." };
      }

      const clienteId = await findOrCreateCliente(tx, input.organizacionId, input.cliente);

      const [cita] = await tx
        .insert(citas)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          clienteId,
          usuarioId: null,
          fechaHora: input.fechaHora,
          duracionMinutos: servicio.duracionMinutos,
          estado: autoConfirmar ? "confirmada" : "pendiente",
          origen: "web",
          notas: input.cliente.notas?.trim() || null,
          totalEstimado: servicio.precio,
        })
        .returning({ id: citas.id });
      if (!cita) throw new Error("No se pudo crear la reserva.");

      await tx.insert(detalleCitasServicios).values({
        citaId: cita.id,
        servicioId: servicio.id,
        precio: servicio.precio,
      });

      await registrarHistorialCita(tx, {
        citaId: cita.id,
        organizacionId: input.organizacionId,
        usuarioId: null,
        accion: "creada",
        detalle: {
          origen: "web",
          fechaHora: input.fechaHora.toISOString(),
          duracionMinutos: servicio.duracionMinutos,
          servicioIds: [servicio.id],
        },
      });

      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: null,
        accion: "cita.reservada_web",
        entidad: "cita",
        entidadId: cita.id,
        detalle: { servicioId: servicio.id, autoConfirmada: autoConfirmar },
      });

      return { ok: true, citaId: cita.id, confirmada: autoConfirmar };
    });
  } catch (error) {
    console.error("crearReservaPublica", error);
    return { ok: false, error: "No se pudo completar la reserva. Inténtalo de nuevo." };
  }
}
