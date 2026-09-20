import { and, desc, eq, gte, inArray, isNotNull, lt, ne } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { planes, suscripciones } from "@/db/schema/billing";
import { clientes, organizaciones, sucursales } from "@/db/schema/core";
import { servicios } from "@/db/schema/catalogs";
import { citas, detalleCitasServicios, recordatoriosEnvios } from "@/db/schema/operations";
import { sendRecordatorioCita } from "@/lib/email/recordatorio-email";
import { estadoEfectivoSuscripcion } from "@/modules/billing/rules";
import { resolveTimeZone } from "@/modules/agenda/timezone";
import { debeEnviarRecordatorio, TIPO_RECORDATORIO_CITA } from "./rules";

export type ResultadoRecordatorios = {
  organizaciones: number;
  enviados: number;
  fallidos: number;
  omitidos: number;
};

const MARGEN_MINUTOS = 30;
const LOTE_MAX = 200;

/**
 * Procesa una corrida del cron de recordatorios: para cada organización con
 * el envío activo busca las citas dentro de la ventana `[ahora+horas-margen,
 * ahora+horas+margen)` y manda el correo. La fila `recordatorios_envios`
 * (única por cita+tipo) se inserta ANTES de enviar para reclamar el envío:
 * corridas concurrentes o repetidas no duplican correos.
 */
export async function procesarRecordatorios(ahora = new Date()): Promise<ResultadoRecordatorios> {
  const db = getDatabase();
  const resultado: ResultadoRecordatorios = { organizaciones: 0, enviados: 0, fallidos: 0, omitidos: 0 };

  const orgs = await db
    .select({
      id: organizaciones.id,
      nombre: organizaciones.nombre,
      zonaHoraria: organizaciones.zonaHoraria,
      horasAntes: organizaciones.recordatoriosHorasAntes,
    })
    .from(organizaciones)
    .where(and(eq(organizaciones.activo, true), eq(organizaciones.recordatoriosActivos, true)));

  // Suscripción más reciente por organización con su plan: solo los planes
  // con la capacidad recordatorios_email y suscripción vigente envían.
  const ultimas = new Map<string, { estado: string; trialTerminaAt: Date | null; periodoTerminaAt: Date | null; capacidades: string[] | null }>();
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
      .where(
        inArray(
          suscripciones.organizacionId,
          orgs.map((o) => o.id),
        ),
      )
      .orderBy(desc(suscripciones.createdAt));
    for (const row of susRows) {
      if (!ultimas.has(row.organizacionId)) ultimas.set(row.organizacionId, row);
    }
  }

  for (const org of orgs) {
    const sus = ultimas.get(org.id);
    const permitido =
      !sus ||
      (estadoEfectivoSuscripcion(sus, ahora) === "vigente" &&
        (sus.capacidades ?? []).includes("recordatorios_email"));
    if (!permitido) continue;
    resultado.organizaciones += 1;
    const margenMs = MARGEN_MINUTOS * 60_000;
    const objetivo = ahora.getTime() + org.horasAntes * 60 * 60_000;
    const inicio = new Date(objetivo - margenMs);
    const fin = new Date(objetivo + margenMs);

    // Citas candidatas de la ventana con correo del cliente.
    const candidatas = await db
      .select({
        id: citas.id,
        fechaHora: citas.fechaHora,
        estado: citas.estado,
        activo: citas.activo,
        sucursalId: citas.sucursalId,
        correoCliente: clientes.correo,
        nombreCliente: clientes.nombre,
        sucursalNombre: sucursales.nombre,
        sucursalZonaHoraria: sucursales.zonaHoraria,
      })
      .from(citas)
      .innerJoin(clientes, eq(citas.clienteId, clientes.id))
      .innerJoin(sucursales, eq(citas.sucursalId, sucursales.id))
      .where(
        and(
          eq(citas.organizacionId, org.id),
          eq(citas.activo, true),
          inArray(citas.estado, ["pendiente", "confirmada"]),
          isNotNull(clientes.correo),
          ne(clientes.correo, ""),
          gte(citas.fechaHora, inicio),
          lt(citas.fechaHora, fin),
        ),
      )
      .limit(LOTE_MAX);
    if (candidatas.length === 0) continue;

    // Envíos ya registrados para estas citas (dedupe lógico; el índice único
    // de (cita_id, tipo) es la garantía real de la carrera).
    const enviados = await db
      .select({ citaId: recordatoriosEnvios.citaId })
      .from(recordatoriosEnvios)
      .where(
        and(
          eq(recordatoriosEnvios.organizacionId, org.id),
          inArray(recordatoriosEnvios.citaId, candidatas.map((c) => c.id)),
          eq(recordatoriosEnvios.tipo, TIPO_RECORDATORIO_CITA),
        ),
      );
    const yaEnviadas = new Set(enviados.map((e) => e.citaId));

    for (const cita of candidatas) {
      const elegible = debeEnviarRecordatorio(
        {
          id: cita.id,
          fechaHora: cita.fechaHora,
          estado: cita.estado,
          activo: cita.activo,
          correoCliente: cita.correoCliente,
          yaEnviada: yaEnviadas.has(cita.id),
        },
        { ahora, horasAntes: org.horasAntes, margenMinutos: MARGEN_MINUTOS },
      );
      if (!elegible) {
        resultado.omitidos += 1;
        continue;
      }

      // Reclama el envío dentro de la unicidad antes de llamar a Brevo.
      const [claim] = await db
        .insert(recordatoriosEnvios)
        .values({
          organizacionId: org.id,
          citaId: cita.id,
          tipo: TIPO_RECORDATORIO_CITA,
          correoDestino: cita.correoCliente!,
          fechaHoraSnapshot: cita.fechaHora,
          estado: "pendiente",
        })
        .onConflictDoNothing({ target: [recordatoriosEnvios.citaId, recordatoriosEnvios.tipo] })
        .returning({ id: recordatoriosEnvios.id });
      if (!claim) {
        resultado.omitidos += 1;
        continue;
      }

      // Primer servicio activo de la cita para el detalle del correo.
      const [detalle] = await db
        .select({ nombre: servicios.nombre })
        .from(detalleCitasServicios)
        .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
        .where(and(eq(detalleCitasServicios.citaId, cita.id), eq(detalleCitasServicios.activo, true)))
        .limit(1);

      const zonaHoraria = resolveTimeZone(cita.sucursalZonaHoraria, org.zonaHoraria);
      const fechaHoraTexto = new Intl.DateTimeFormat("es-MX", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        timeZone: zonaHoraria,
      }).format(cita.fechaHora);

      try {
        await sendRecordatorioCita({
          to: cita.correoCliente!,
          nombreCliente: cita.nombreCliente,
          nombreNegocio: org.nombre,
          sucursalNombre: cita.sucursalNombre,
          fechaHoraTexto,
          servicioNombre: detalle?.nombre ?? null,
        });
        await db
          .update(recordatoriosEnvios)
          .set({ estado: "enviado", enviadoAt: new Date() })
          .where(eq(recordatoriosEnvios.id, claim.id));
        resultado.enviados += 1;
      } catch (error) {
        await db
          .update(recordatoriosEnvios)
          .set({ estado: "fallido", error: error instanceof Error ? error.message : String(error) })
          .where(eq(recordatoriosEnvios.id, claim.id));
        resultado.fallidos += 1;
      }
    }
  }

  return resultado;
}
