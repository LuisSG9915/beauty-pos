import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { planes, suscripciones } from "@/db/schema/billing";
import { clientes, organizaciones, sucursales } from "@/db/schema/core";
import { servicios } from "@/db/schema/catalogs";
import { citas, detalleCitasServicios, notificacionesEnvios } from "@/db/schema/operations";
import { sendAvisoCita } from "@/lib/email/aviso-email";
import { resolveTimeZone } from "@/modules/agenda/timezone";
import { estadoEfectivoSuscripcion } from "@/modules/billing/rules";
import type { AgendaDb } from "@/modules/agenda/service";
import {
  alcanzoMaximoIntentos,
  backoffMs,
  decidirAviso,
  instanteRecordatorio,
  LEASE_MINUTOS,
  TIPO_RECORDATORIO,
  type TipoNotificacion,
} from "./rules";

export type ResultadoNotificaciones = {
  organizaciones: number;
  encolados: number;
  enviados: number;
  omitidos: number;
  reintentos: number;
  fallidos: number;
};

const MARGEN_MINUTOS = 30;
const FRECUENCIA_CRON_MINUTOS = 30;
const LOTE_SCAN = 400;
const LOTE_DRAIN = 100;

type AvisoDetalle = { fechaHoraPrevia?: string | null } | null;

/**
 * Encola un aviso ligado a la versión actual de la cita, dentro de la misma
 * transacción que la mutación. No hace nada si la cita no tiene correo de
 * cliente o la organización tiene los avisos desactivados. La unicidad
 * (cita, tipo, versión) vuelve la operación idempotente ante doble submit.
 */
export async function encolarAvisoCita(
  tx: AgendaDb,
  params: {
    organizacionId: string;
    citaId: string;
    tipo: TipoNotificacion;
    /** Solo para `cambio`: horario previo para el correo. */
    fechaHoraPrevia?: Date | null;
    ahora?: Date;
  },
): Promise<void> {
  const [row] = await tx
    .select({
      citaId: citas.id,
      version: citas.version,
      fechaHora: citas.fechaHora,
      correoCliente: clientes.correo,
      avisosActivos: organizaciones.recordatoriosActivos,
      horasAntes: organizaciones.recordatoriosHorasAntes,
    })
    .from(citas)
    .innerJoin(organizaciones, eq(citas.organizacionId, organizaciones.id))
    .leftJoin(clientes, eq(citas.clienteId, clientes.id))
    .where(and(eq(citas.id, params.citaId), eq(citas.organizacionId, params.organizacionId)))
    .limit(1);
  if (!row || !row.avisosActivos || !row.correoCliente) return;

  const ahora = params.ahora ?? new Date();
  const programadoPara =
    params.tipo === TIPO_RECORDATORIO ? instanteRecordatorio(row.fechaHora, row.horasAntes) : ahora;
  // Un recordatorio cuyo instante ya pasó no se encola (la cita es inminente
  // o el cron ya debió mandarlo; lo cubre el escaneo si aplica).
  if (params.tipo === TIPO_RECORDATORIO && programadoPara.getTime() < ahora.getTime() - MARGEN_MINUTOS * 60_000) {
    return;
  }

  await tx
    .insert(notificacionesEnvios)
    .values({
      organizacionId: params.organizacionId,
      citaId: row.citaId,
      tipo: params.tipo,
      correoDestino: row.correoCliente,
      fechaHoraSnapshot: row.fechaHora,
      versionCita: row.version,
      programadoPara,
      detalle: params.fechaHoraPrevia ? { fechaHoraPrevia: params.fechaHoraPrevia.toISOString() } : null,
    })
    .onConflictDoNothing({
      target: [notificacionesEnvios.citaId, notificacionesEnvios.tipo, notificacionesEnvios.versionCita],
    });
}

function formatoFechaHora(fecha: Date, zonaHoraria: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zonaHoraria,
  }).format(fecha);
}

function sanitizarError(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error);
  return mensaje.slice(0, 300);
}

type OrgContexto = {
  nombre: string;
  zonaHoraria: string;
  horasAntes: number;
  permitido: boolean;
};

/**
 * Una corrida del worker de avisos:
 * 1. Libera leases expirados (worker muerto a mitad de envío).
 * 2. Productor: encola recordatorios de citas que entran a su ventana.
 * 3. Drenaje: toma avisos vencidos con lease, decide contra el estado ACTUAL
 *    de la cita y envía/omite/reintenta.
 */
export async function procesarNotificaciones(ahora = new Date()): Promise<ResultadoNotificaciones> {
  const db = getDatabase();
  const resultado: ResultadoNotificaciones = {
    organizaciones: 0,
    encolados: 0,
    enviados: 0,
    omitidos: 0,
    reintentos: 0,
    fallidos: 0,
  };

  // 1. Recuperación de leases muertos.
  await db
    .update(notificacionesEnvios)
    .set({ estado: "pendiente", leaseHasta: null })
    .where(and(eq(notificacionesEnvios.estado, "enviando"), lt(notificacionesEnvios.leaseHasta, ahora)));

  // 2. Contexto de organizaciones con avisos activos + entitlement vigente.
  const orgs = await db
    .select({
      id: organizaciones.id,
      nombre: organizaciones.nombre,
      zonaHoraria: organizaciones.zonaHoraria,
      horasAntes: organizaciones.recordatoriosHorasAntes,
    })
    .from(organizaciones)
    .where(and(eq(organizaciones.activo, true), eq(organizaciones.recordatoriosActivos, true)));

  const contextos = new Map<string, OrgContexto>();
  if (orgs.length > 0) {
    const susRows = await db
      .select({
        organizacionId: suscripciones.organizacionId,
        estado: suscripciones.estado,
        trialTerminaAt: suscripciones.trialTerminaAt,
        periodoTerminaAt: suscripciones.periodoTerminaAt,
        capacidades: planes.capacidades,
        createdAt: suscripciones.createdAt,
      })
      .from(suscripciones)
      .leftJoin(planes, eq(suscripciones.planId, planes.id))
      .where(inArray(suscripciones.organizacionId, orgs.map((o) => o.id)))
      .orderBy(desc(suscripciones.createdAt));
    const ultimas = new Map<string, (typeof susRows)[number]>();
    for (const row of susRows) {
      if (!ultimas.has(row.organizacionId)) ultimas.set(row.organizacionId, row);
    }
    for (const org of orgs) {
      const sus = ultimas.get(org.id);
      const permitido =
        !sus ||
        (estadoEfectivoSuscripcion(sus, ahora) === "vigente" &&
          (sus.capacidades ?? []).includes("recordatorios_email"));
      contextos.set(org.id, {
        nombre: org.nombre,
        zonaHoraria: org.zonaHoraria,
        horasAntes: org.horasAntes,
        permitido,
      });
    }
  }

  // 3. Productor: encola recordatorios para citas cuya ventana llega.
  for (const org of orgs) {
    const ctx = contextos.get(org.id);
    if (!ctx?.permitido) continue;
    resultado.organizaciones += 1;

    // Citas cuyo instante de recordatorio cae en [ahora-margen, ahora+frecuencia).
    const desde = new Date(ahora.getTime() - MARGEN_MINUTOS * 60_000 + org.horasAntes * 60 * 60_000);
    const hasta = new Date(
      ahora.getTime() + FRECUENCIA_CRON_MINUTOS * 60_000 + org.horasAntes * 60 * 60_000,
    );
    const candidatas = await db
      .select({
        id: citas.id,
        fechaHora: citas.fechaHora,
        version: citas.version,
        correoCliente: clientes.correo,
      })
      .from(citas)
      .innerJoin(clientes, eq(citas.clienteId, clientes.id))
      .where(
        and(
          eq(citas.organizacionId, org.id),
          eq(citas.activo, true),
          inArray(citas.estado, ["pendiente", "confirmada"]),
          isNotNull(clientes.correo),
          ne(clientes.correo, ""),
          gte(citas.fechaHora, desde),
          lt(citas.fechaHora, hasta),
        ),
      )
      .limit(LOTE_SCAN);

    for (const cita of candidatas) {
      const [encolado] = await db
        .insert(notificacionesEnvios)
        .values({
          organizacionId: org.id,
          citaId: cita.id,
          tipo: TIPO_RECORDATORIO,
          correoDestino: cita.correoCliente!,
          fechaHoraSnapshot: cita.fechaHora,
          versionCita: cita.version,
          programadoPara: instanteRecordatorio(cita.fechaHora, org.horasAntes),
        })
        .onConflictDoNothing({
          target: [notificacionesEnvios.citaId, notificacionesEnvios.tipo, notificacionesEnvios.versionCita],
        })
        .returning({ id: notificacionesEnvios.id });
      if (encolado) resultado.encolados += 1;
    }
  }

  // 4. Drenaje: avisos vencidos. El lease se toma con UPDATE condicional para
  // que dos workers no procesen el mismo aviso.
  const pendientes = await db
    .select()
    .from(notificacionesEnvios)
    .where(
      and(
        eq(notificacionesEnvios.estado, "pendiente"),
        lte(notificacionesEnvios.programadoPara, ahora),
        or(isNull(notificacionesEnvios.proximoIntento), lte(notificacionesEnvios.proximoIntento, ahora)),
      ),
    )
    .orderBy(notificacionesEnvios.programadoPara)
    .limit(LOTE_DRAIN);

  for (const aviso of pendientes) {
    // Reclamo atómico: solo un worker lo toma.
    const [claim] = await db
      .update(notificacionesEnvios)
      .set({
        estado: "enviando",
        leaseHasta: new Date(ahora.getTime() + LEASE_MINUTOS * 60_000),
        intentos: aviso.intentos + 1,
      })
      .where(and(eq(notificacionesEnvios.id, aviso.id), eq(notificacionesEnvios.estado, "pendiente")))
      .returning({ id: notificacionesEnvios.id });
    if (!claim) continue;

    const [cita] = await db
      .select({
        id: citas.id,
        fechaHora: citas.fechaHora,
        estado: citas.estado,
        activo: citas.activo,
        version: citas.version,
        sucursalId: citas.sucursalId,
        correoCliente: clientes.correo,
        nombreCliente: clientes.nombre,
        sucursalNombre: sucursales.nombre,
        sucursalZonaHoraria: sucursales.zonaHoraria,
      })
      .from(citas)
      .leftJoin(clientes, eq(citas.clienteId, clientes.id))
      .innerJoin(sucursales, eq(citas.sucursalId, sucursales.id))
      .where(eq(citas.id, aviso.citaId))
      .limit(1);

    const ctx = contextos.get(aviso.organizacionId);
    const horasAntes = ctx?.horasAntes ?? 24;
    const decision = ctx?.permitido
      ? decidirAviso(aviso, cita ?? null, { ahora, horasAntes, margenMinutos: MARGEN_MINUTOS })
      : { accion: "omitir" as const, motivo: "La suscripción no incluye avisos por correo." };

    if (decision.accion === "omitir") {
      await db
        .update(notificacionesEnvios)
        .set({ estado: "omitido", error: decision.motivo, leaseHasta: null })
        .where(eq(notificacionesEnvios.id, aviso.id));
      resultado.omitidos += 1;
      continue;
    }

    if (decision.accion === "reprogramar") {
      // La cita se movió: este aviso queda obsoleto y se encola el
      // recordatorio correcto para la nueva versión (idempotente).
      await db
        .update(notificacionesEnvios)
        .set({ estado: "omitido", error: "Reprogramado por reagenda.", leaseHasta: null })
        .where(eq(notificacionesEnvios.id, aviso.id));
      await db
        .insert(notificacionesEnvios)
        .values({
          organizacionId: aviso.organizacionId,
          citaId: aviso.citaId,
          tipo: aviso.tipo,
          correoDestino: aviso.correoDestino,
          fechaHoraSnapshot: decision.fechaHoraSnapshot,
          versionCita: decision.versionCita,
          programadoPara: decision.programadoPara,
        })
        .onConflictDoNothing({
          target: [notificacionesEnvios.citaId, notificacionesEnvios.tipo, notificacionesEnvios.versionCita],
        });
      resultado.omitidos += 1;
      continue;
    }

    // Enviar.
    try {
      const [detalle] = await db
        .select({ nombre: servicios.nombre })
        .from(detalleCitasServicios)
        .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
        .where(and(eq(detalleCitasServicios.citaId, aviso.citaId), eq(detalleCitasServicios.activo, true)))
        .limit(1);

      const zonaHoraria = resolveTimeZone(cita!.sucursalZonaHoraria, ctx?.zonaHoraria);
      const detalleAviso = (aviso.detalle ?? null) as AvisoDetalle;
      const { proveedorId } = await sendAvisoCita(aviso.tipo, {
        to: aviso.correoDestino,
        nombreCliente: cita!.nombreCliente ?? "cliente",
        nombreNegocio: ctx?.nombre ?? "el negocio",
        sucursalNombre: cita!.sucursalNombre,
        fechaHoraTexto: formatoFechaHora(cita!.fechaHora, zonaHoraria),
        fechaHoraPreviaTexto: detalleAviso?.fechaHoraPrevia
          ? formatoFechaHora(new Date(detalleAviso.fechaHoraPrevia), zonaHoraria)
          : null,
        servicioNombre: detalle?.nombre ?? null,
      });

      await db
        .update(notificacionesEnvios)
        .set({ estado: "enviado", enviadoAt: new Date(), proveedorId, leaseHasta: null, error: null })
        .where(eq(notificacionesEnvios.id, aviso.id));
      resultado.enviados += 1;
    } catch (error) {
      const mensaje = sanitizarError(error);
      if (alcanzoMaximoIntentos(aviso.intentos + 1)) {
        await db
          .update(notificacionesEnvios)
          .set({ estado: "fallido", error: mensaje, leaseHasta: null })
          .where(eq(notificacionesEnvios.id, aviso.id));
        resultado.fallidos += 1;
      } else {
        await db
          .update(notificacionesEnvios)
          .set({
            estado: "pendiente",
            proximoIntento: new Date(ahora.getTime() + backoffMs(aviso.intentos + 1)),
            error: mensaje,
            leaseHasta: null,
          })
          .where(eq(notificacionesEnvios.id, aviso.id));
        resultado.reintentos += 1;
      }
    }
  }

  return resultado;
}

/** Aviso serializado para el panel operativo (fechas en ISO). */
export type AvisoReciente = {
  id: string;
  tipo: string;
  correoDestino: string;
  estado: string;
  intentos: number;
  programadoPara: string;
  enviadoAt: string | null;
  proveedorId: string | null;
  error: string | null;
  citaFechaHora: string | null;
};

/** Avisos recientes de una organización para el panel operativo. */
export async function avisosRecientes(organizacionId: string, limite = 12): Promise<AvisoReciente[]> {
  const db = getDatabase();
  const rows = await db
    .select({
      id: notificacionesEnvios.id,
      tipo: notificacionesEnvios.tipo,
      correoDestino: notificacionesEnvios.correoDestino,
      estado: notificacionesEnvios.estado,
      intentos: notificacionesEnvios.intentos,
      programadoPara: notificacionesEnvios.programadoPara,
      enviadoAt: notificacionesEnvios.enviadoAt,
      proveedorId: notificacionesEnvios.proveedorId,
      error: notificacionesEnvios.error,
      citaFechaHora: citas.fechaHora,
    })
    .from(notificacionesEnvios)
    .leftJoin(citas, eq(notificacionesEnvios.citaId, citas.id))
    .where(eq(notificacionesEnvios.organizacionId, organizacionId))
    .orderBy(desc(notificacionesEnvios.createdAt))
    .limit(limite);
  return rows.map((row) => ({
    ...row,
    programadoPara: row.programadoPara.toISOString(),
    enviadoAt: row.enviadoAt?.toISOString() ?? null,
    citaFechaHora: row.citaFechaHora?.toISOString() ?? null,
  }));
}
