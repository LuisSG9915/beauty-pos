import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, lt } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { clientes, organizaciones, sucursales } from "@/db/schema/core";
import { servicios } from "@/db/schema/catalogs";
import { citas, detalleCitasServicios, rateLimitEventos, reservasGestionTokens } from "@/db/schema/operations";
import { auditEvent } from "@/lib/audit";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  getOcupacionAgenda,
  lockSucursalAgenda,
  recursosDeCita,
  registrarHistorialCita,
  validarDisponibilidadCita,
  violacionesAError,
  type AgendaDb,
} from "@/modules/agenda/service";
import { resolveTimeZone, dayBoundsUtc } from "@/modules/agenda/timezone";
import { encolarAvisoCita } from "@/modules/notificaciones/service";
import { TIPO_CAMBIO, TIPO_CANCELACION } from "@/modules/notificaciones/rules";
import {
  dentroDeVentanaReserva,
  LIMITES_RESERVAS,
  normalizarContacto,
  puedeGestionarCita,
  rateLimitExcedido,
  slotsDisponiblesDia,
  type PoliticaReservas,
} from "./rules";

type Tx = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

export type GestionResult = { ok: true } | { ok: false; error: string };

const TOKEN_BYTES = 32;

/** Token en claro (solo se muestra una vez: pantalla de éxito y correo). */
export function generarTokenGestion(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

export function hashTokenGestion(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** URL pública de autogestión para correos y pantalla de éxito. */
export function urlGestion(token: string): string {
  const base = (getRuntimeEnv().BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/mi-cita/${token}`;
}

/**
 * Emite el token de autogestión de una cita dentro de la tx que la crea.
 * Devuelve token en claro + URL lista para el correo; en BD queda solo el hash.
 */
export async function emitirTokenGestion(
  tx: AgendaDb,
  params: { organizacionId: string; citaId: string },
): Promise<{ token: string; url: string } | null> {
  const token = generarTokenGestion();
  // Un solo token activo por cita: si ya existe, su enlace original sigue
  // vigente (el claro no se puede recuperar del hash).
  const [row] = await tx
    .insert(reservasGestionTokens)
    .values({
      organizacionId: params.organizacionId,
      citaId: params.citaId,
      tokenHash: hashTokenGestion(token),
    })
    .onConflictDoNothing({ target: reservasGestionTokens.citaId })
    .returning({ id: reservasGestionTokens.id });
  if (!row) return null;
  return { token, url: urlGestion(token) };
}

/**
 * Antiabuso persistente: registra el intento y evalúa el límite de ventana
 * deslizante. Los intentos bloqueados también se registran (escalan el costo
 * de abusar). Devuelve true si el intento excede el límite.
 */
async function excedeRateLimit(
  tx: Tx,
  params: { bucket: string; clave: string; limite: number; ventanaMs: number },
  ahora: Date,
): Promise<boolean> {
  const corte = new Date(ahora.getTime() - params.ventanaMs);
  const eventos = await tx
    .select({ createdAt: rateLimitEventos.createdAt })
    .from(rateLimitEventos)
    .where(
      and(
        eq(rateLimitEventos.bucket, params.bucket),
        eq(rateLimitEventos.clave, params.clave),
        gt(rateLimitEventos.createdAt, corte),
      ),
    );
  const excede = rateLimitExcedido(
    eventos.map((e) => e.createdAt),
    { limite: params.limite, ventanaMs: params.ventanaMs },
    ahora,
  );
  await tx.insert(rateLimitEventos).values({ bucket: params.bucket, clave: params.clave });
  // Poda: conserva solo el historial reciente de esta clave.
  await tx
    .delete(rateLimitEventos)
    .where(
      and(
        eq(rateLimitEventos.bucket, params.bucket),
        eq(rateLimitEventos.clave, params.clave),
        lt(rateLimitEventos.createdAt, new Date(ahora.getTime() - params.ventanaMs * 4)),
      ),
    );
  return excede;
}

/** Rate limit de creación pública: por IP+org y por contacto normalizado. */
export async function verificarAbusoReserva(
  tx: Tx,
  params: { organizacionId: string; ip: string | null; telefono: string | null; correo: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ahora = new Date();
  if (params.ip) {
    const excede = await excedeRateLimit(tx, {
      bucket: "reserva_create",
      clave: `${params.organizacionId}:${params.ip}`,
      ...LIMITES_RESERVAS.porIpHora,
    }, ahora);
    if (excede) return { ok: false, error: "Demasiadas reservas desde esta conexión. Inténtalo más tarde." };
  }
  const contacto = params.correo ?? params.telefono;
  if (contacto) {
    const excede = await excedeRateLimit(tx, {
      bucket: "reserva_create",
      clave: `contacto:${createHash("sha256").update(`${params.organizacionId}:${contacto}`).digest("hex").slice(0, 32)}`,
      ...LIMITES_RESERVAS.porContactoHora,
    }, ahora);
    if (excede) {
      return { ok: false, error: "Ya tienes varias reservas recientes. Comunícate con el negocio." };
    }
  }
  return { ok: true };
}

type ReservaGestionRow = {
  tokenId: string;
  revocadoAt: Date | null;
  /** Teléfono normalizado del cliente (verificación de contacto). */
  clienteTelefono: string | null;
  cita: {
    id: string;
    organizacionId: string;
    sucursalId: string;
    usuarioId: string | null;
    fechaHora: Date;
    duracionMinutos: number;
    estado: string;
    activo: boolean;
    origen: string;
  };
  sucursal: { nombre: string; zonaHoraria: string | null; capacidadSinAsignar: number; cancelacionHoras: number; anticipacionMinutos: number; horizonteDias: number };
  organizacion: { nombre: string; slug: string; zonaHoraria: string };
  cliente: { nombre: string } | null;
  servicio: { nombre: string } | null;
};

async function reservaPorHash(tx: Tx, tokenHash: string): Promise<ReservaGestionRow | null> {
  const [row] = await tx
    .select({
      tokenId: reservasGestionTokens.id,
      revocadoAt: reservasGestionTokens.revocadoAt,
      citaId: citas.id,
      organizacionId: citas.organizacionId,
      sucursalId: citas.sucursalId,
      usuarioId: citas.usuarioId,
      fechaHora: citas.fechaHora,
      duracionMinutos: citas.duracionMinutos,
      estado: citas.estado,
      activo: citas.activo,
      origen: citas.origen,
      sucursalNombre: sucursales.nombre,
      sucursalZonaHoraria: sucursales.zonaHoraria,
      capacidadSinAsignar: sucursales.capacidadSinAsignar,
      cancelacionHoras: sucursales.reservasCancelacionHoras,
      anticipacionMinutos: sucursales.reservasAnticipacionMinutos,
      horizonteDias: sucursales.reservasHorizonteDias,
      orgNombre: organizaciones.nombre,
      orgSlug: organizaciones.slug,
      orgZonaHoraria: organizaciones.zonaHoraria,
      clienteNombre: clientes.nombre,
      clienteTelefono: clientes.telefonoNormalizado,
    })
    .from(reservasGestionTokens)
    .innerJoin(citas, eq(reservasGestionTokens.citaId, citas.id))
    .innerJoin(sucursales, eq(citas.sucursalId, sucursales.id))
    .innerJoin(organizaciones, eq(citas.organizacionId, organizaciones.id))
    .leftJoin(clientes, eq(citas.clienteId, clientes.id))
    .where(eq(reservasGestionTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;

  const [servicio] = await tx
    .select({ nombre: servicios.nombre })
    .from(detalleCitasServicios)
    .innerJoin(servicios, eq(detalleCitasServicios.servicioId, servicios.id))
    .where(and(eq(detalleCitasServicios.citaId, row.citaId), eq(detalleCitasServicios.activo, true)))
    .limit(1);

  return {
    tokenId: row.tokenId,
    revocadoAt: row.revocadoAt,
    clienteTelefono: row.clienteTelefono,
    cita: {
      id: row.citaId,
      organizacionId: row.organizacionId,
      sucursalId: row.sucursalId,
      usuarioId: row.usuarioId,
      fechaHora: row.fechaHora,
      duracionMinutos: row.duracionMinutos,
      estado: row.estado,
      activo: row.activo,
      origen: row.origen,
    },
    sucursal: {
      nombre: row.sucursalNombre,
      zonaHoraria: row.sucursalZonaHoraria,
      capacidadSinAsignar: row.capacidadSinAsignar,
      cancelacionHoras: row.cancelacionHoras,
      anticipacionMinutos: row.anticipacionMinutos,
      horizonteDias: row.horizonteDias,
    },
    organizacion: { nombre: row.orgNombre, slug: row.orgSlug, zonaHoraria: row.orgZonaHoraria },
    cliente: row.clienteNombre ? { nombre: row.clienteNombre } : null,
    servicio: servicio ?? null,
  };
}

function politicaDe(row: ReservaGestionRow): PoliticaReservas {
  return {
    cancelacionHoras: row.sucursal.cancelacionHoras,
    anticipacionMinutos: row.sucursal.anticipacionMinutos,
    horizonteDias: row.sucursal.horizonteDias,
  };
}

/**
 * Verificación de contacto para mutaciones: el enlace (posesión) basta para
 * consultar el estado, pero cancelar/reagendar exige también el teléfono con
 * que se reservó — un enlace reenviado o filtrado no permite modificar la cita.
 * Si la cita no tiene teléfono registrado se omite el segundo factor.
 */
function telefonoCoincide(row: ReservaGestionRow, telefono: string | undefined): boolean {
  if (!row.clienteTelefono) return true;
  return normalizarContacto(telefono) === row.clienteTelefono;
}

export type ReservaGestionPublica = {
  estado: string;
  fechaHora: string;
  duracionMinutos: number;
  organizacionNombre: string;
  organizacionSlug: string;
  sucursalNombre: string;
  servicioNombre: string | null;
  clienteNombre: string | null;
  zonaHoraria: string;
  /** Puede cancelar/reagendar ahora mismo según la política. */
  gestionable: boolean;
  motivoNoGestionable: string | null;
  cancelacionHoras: number;
  horizonteDias: number;
  origen: string;
  /** La reserva tiene teléfono registrado: las mutaciones lo pedirán. */
  verificacionContacto: boolean;
};

/**
 * Consulta pública del estado de la cita por su token. Expone solo lo que el
 * cliente necesita; nada financiero ni datos del staff. Rate-limited por IP.
 */
export async function obtenerReservaPorToken(
  token: string,
  params: { ip?: string | null } = {},
): Promise<ReservaGestionPublica | null> {
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  const db = getDatabase();
  const ahora = new Date();
  const tokenHash = hashTokenGestion(token);

  if (params.ip) {
    const excede = await db.transaction((tx) =>
      excedeRateLimit(tx, {
        bucket: "token_lookup",
        clave: `ip:${params.ip}`,
        ...LIMITES_RESERVAS.tokenPorIpMinuto,
      }, ahora),
    );
    if (excede) return null;
  }

  const row = await db.transaction((tx) => reservaPorHash(tx, tokenHash));
  if (!row || row.revocadoAt) return null;

  // Marca de uso (fuera del camino crítico: best-effort en la misma lectura).
  await db
    .update(reservasGestionTokens)
    .set({ ultimoUsoAt: ahora })
    .where(eq(reservasGestionTokens.id, row.tokenId));

  const politica = politicaDe(row);
  const gestion = puedeGestionarCita(row.cita, politica, ahora);
  return {
    estado: row.cita.estado,
    fechaHora: row.cita.fechaHora.toISOString(),
    duracionMinutos: row.cita.duracionMinutos,
    organizacionNombre: row.organizacion.nombre,
    organizacionSlug: row.organizacion.slug,
    sucursalNombre: row.sucursal.nombre,
    servicioNombre: row.servicio?.nombre ?? null,
    clienteNombre: row.cliente?.nombre ?? null,
    zonaHoraria: resolveTimeZone(row.sucursal.zonaHoraria, row.organizacion.zonaHoraria),
    gestionable: gestion.puede,
    motivoNoGestionable: gestion.puede ? null : gestion.motivo,
    cancelacionHoras: politica.cancelacionHoras,
    horizonteDias: politica.horizonteDias,
    origen: row.cita.origen,
    verificacionContacto: Boolean(row.clienteTelefono),
  };
}

/**
 * Cancelación pública por token: verifica el token, aplica la política de
 * corte y deja historial + auditoría + aviso de cancelación encolado, todo
 * dentro del lock de agenda de la sucursal.
 */
export async function cancelarReservaPublica(token: string, telefono?: string): Promise<GestionResult> {
  if (!/^[0-9a-f]{64}$/i.test(token)) return { ok: false, error: "Enlace inválido." };
  const db = getDatabase();
  const ahora = new Date();
  const tokenHash = hashTokenGestion(token);

  try {
    return await db.transaction(async (tx): Promise<GestionResult> => {
      const row = await reservaPorHash(tx, tokenHash);
      if (!row || row.revocadoAt) return { ok: false, error: "Enlace inválido o revocado." };

      const excede = await excedeRateLimit(tx, {
        bucket: "reserva_manage",
        clave: `token:${tokenHash.slice(0, 24)}`,
        ...LIMITES_RESERVAS.gestionPorTokenHora,
      }, ahora);
      if (excede) return { ok: false, error: "Demasiados cambios en poco tiempo. Comunícate con el negocio." };
      if (!telefonoCoincide(row, telefono)) {
        return { ok: false, error: "El teléfono no coincide con el registrado en la reserva." };
      }

      const gestion = puedeGestionarCita(row.cita, politicaDe(row), ahora);
      if (!gestion.puede) return { ok: false, error: gestion.motivo };

      await lockSucursalAgenda(tx, row.cita.organizacionId, row.cita.sucursalId);
      // Relectura bajo el lock por si cambió entre la consulta y la mutación.
      const [actual] = await tx
        .select({ estado: citas.estado, activo: citas.activo, fechaHora: citas.fechaHora, version: citas.version })
        .from(citas)
        .where(eq(citas.id, row.cita.id))
        .limit(1);
      if (!actual) return { ok: false, error: "La cita ya no existe." };
      const revalida = puedeGestionarCita(
        { fechaHora: actual.fechaHora, estado: actual.estado, activo: actual.activo },
        politicaDe(row),
        ahora,
      );
      if (!revalida.puede) return { ok: false, error: revalida.motivo };

      await tx
        .update(citas)
        .set({ estado: "cancelada", version: actual.version + 1 })
        .where(eq(citas.id, row.cita.id));
      await registrarHistorialCita(tx, {
        citaId: row.cita.id,
        organizacionId: row.cita.organizacionId,
        usuarioId: null,
        accion: "estado",
        detalle: { de: actual.estado, a: "cancelada", origen: "web" },
      });
      await auditEvent(tx, {
        organizacionId: row.cita.organizacionId,
        sucursalId: row.cita.sucursalId,
        usuarioId: null,
        accion: "cita.cancelada_web",
        entidad: "cita",
        entidadId: row.cita.id,
        detalle: { estadoPrevio: actual.estado },
      });
      await encolarAvisoCita(tx, {
        organizacionId: row.cita.organizacionId,
        citaId: row.cita.id,
        tipo: TIPO_CANCELACION,
      });
      return { ok: true };
    });
  } catch (error) {
    console.error("cancelarReservaPublica", error);
    return { ok: false, error: "No se pudo cancelar la cita. Inténtalo de nuevo." };
  }
}

/**
 * Reagendado público por token: misma política que cancelar + validación de
 * disponibilidad con la agenda real (bloqueos, citas, recursos, profesional
 * asignado si existe). Deja historial + auditoría + aviso de cambio.
 */
export async function reagendarReservaPublica(
  token: string,
  fechaHora: Date,
  telefono?: string,
): Promise<GestionResult> {
  if (!/^[0-9a-f]{64}$/i.test(token)) return { ok: false, error: "Enlace inválido." };
  if (Number.isNaN(fechaHora.getTime())) return { ok: false, error: "Horario inválido." };
  const db = getDatabase();
  const ahora = new Date();
  const tokenHash = hashTokenGestion(token);

  try {
    return await db.transaction(async (tx): Promise<GestionResult> => {
      const row = await reservaPorHash(tx, tokenHash);
      if (!row || row.revocadoAt) return { ok: false, error: "Enlace inválido o revocado." };

      const excede = await excedeRateLimit(tx, {
        bucket: "reserva_manage",
        clave: `token:${tokenHash.slice(0, 24)}`,
        ...LIMITES_RESERVAS.gestionPorTokenHora,
      }, ahora);
      if (excede) return { ok: false, error: "Demasiados cambios en poco tiempo. Comunícate con el negocio." };
      if (!telefonoCoincide(row, telefono)) {
        return { ok: false, error: "El teléfono no coincide con el registrado en la reserva." };
      }

      const politica = politicaDe(row);
      const gestion = puedeGestionarCita(row.cita, politica, ahora);
      if (!gestion.puede) return { ok: false, error: gestion.motivo };

      const ventana = dentroDeVentanaReserva(fechaHora, politica, ahora);
      if (!ventana.ok) return { ok: false, error: ventana.error };

      const sucursal = await lockSucursalAgenda(tx, row.cita.organizacionId, row.cita.sucursalId);
      if (!sucursal) return { ok: false, error: "La sucursal ya no existe." };
      const [actual] = await tx
        .select({ estado: citas.estado, activo: citas.activo, fechaHora: citas.fechaHora, version: citas.version, usuarioId: citas.usuarioId })
        .from(citas)
        .where(eq(citas.id, row.cita.id))
        .limit(1);
      if (!actual) return { ok: false, error: "La cita ya no existe." };
      const revalida = puedeGestionarCita(
        { fechaHora: actual.fechaHora, estado: actual.estado, activo: actual.activo },
        politica,
        ahora,
      );
      if (!revalida.puede) return { ok: false, error: revalida.motivo };
      if (actual.fechaHora.getTime() === fechaHora.getTime()) {
        return { ok: false, error: "La cita ya está en ese horario." };
      }

      // Disponibilidad real: conserva recursos y profesional asignados; si la
      // cita tiene profesional, el horario debe respetar SU agenda.
      const recursoIds = await recursosDeCita(tx, row.cita.id);
      const disponibilidad = await validarDisponibilidadCita(tx, {
        organizacionId: row.cita.organizacionId,
        sucursalId: row.cita.sucursalId,
        usuarioId: actual.usuarioId,
        fechaHora,
        duracionMinutos: row.cita.duracionMinutos,
        zonaHoraria: sucursal.zonaHoraria,
        ignoreCitaId: row.cita.id,
        capacidadSinAsignar: sucursal.capacidadSinAsignar,
        recursoIds,
      });
      if (!disponibilidad.ok) {
        return { ok: false, error: violacionesAError(disponibilidad) };
      }

      await tx
        .update(citas)
        .set({ fechaHora, version: actual.version + 1 })
        .where(eq(citas.id, row.cita.id));
      await registrarHistorialCita(tx, {
        citaId: row.cita.id,
        organizacionId: row.cita.organizacionId,
        usuarioId: null,
        accion: "reagendada",
        detalle: {
          fechaHoraDe: actual.fechaHora.toISOString(),
          fechaHoraA: fechaHora.toISOString(),
          origen: "web",
        },
      });
      await auditEvent(tx, {
        organizacionId: row.cita.organizacionId,
        sucursalId: row.cita.sucursalId,
        usuarioId: null,
        accion: "cita.reagendada_web",
        entidad: "cita",
        entidadId: row.cita.id,
        detalle: { fechaHoraDe: actual.fechaHora.toISOString(), fechaHoraA: fechaHora.toISOString() },
      });
      await encolarAvisoCita(tx, {
        organizacionId: row.cita.organizacionId,
        citaId: row.cita.id,
        tipo: TIPO_CAMBIO,
        fechaHoraPrevia: actual.fechaHora,
        gestionUrl: urlGestion(token),
      });
      return { ok: true };
    });
  } catch (error) {
    console.error("reagendarReservaPublica", error);
    return { ok: false, error: "No se pudo reagendar la cita. Inténtalo de nuevo." };
  }
}

/**
 * Slots libres para reagendar por token. Cuando la cita tiene profesional
 * asignado, los horarios respetan la agenda de ESE profesional; sin asignar,
 * usa el carril compartido como en la reserva original.
 */
export async function slotsGestionReserva(
  token: string,
  diaKey: string,
): Promise<{ ok: true; slots: string[] } | { ok: false; error: string }> {
  if (!/^[0-9a-f]{64}$/i.test(token)) return { ok: false, error: "Enlace inválido." };
  const db = getDatabase();
  const ahora = new Date();
  const row = await db.transaction((tx) => reservaPorHash(tx, hashTokenGestion(token)));
  if (!row || row.revocadoAt) return { ok: false, error: "Enlace inválido o revocado." };

  const politica = politicaDe(row);
  const gestion = puedeGestionarCita(row.cita, politica, ahora);
  if (!gestion.puede) return { ok: false, error: gestion.motivo };

  const zonaHoraria = resolveTimeZone(row.sucursal.zonaHoraria, row.organizacion.zonaHoraria);
  const bounds = dayBoundsUtc(diaKey, zonaHoraria);
  if (!bounds) return { ok: false, error: "Fecha inválida." };
  // El día pedido debe caber en la ventana de reserva de la sucursal.
  if (bounds.terminaAt.getTime() > ahora.getTime() + politica.horizonteDias * 24 * 60 * 60_000) {
    return { ok: true, slots: [] };
  }

  const ocupacion = await getOcupacionAgenda(db, {
    organizacionId: row.cita.organizacionId,
    sucursalId: row.cita.sucursalId,
    desde: bounds.iniciaAt,
    hasta: bounds.terminaAt,
  });

  const slots = slotsDisponiblesDia({
    diaKey,
    duracionMinutos: row.cita.duracionMinutos,
    ocupacion,
    zonaHoraria,
    capacidadSinAsignar: row.sucursal.capacidadSinAsignar ?? 1,
    usuarioId: row.cita.usuarioId,
    ignoreCitaId: row.cita.id,
    ahora: new Date(ahora.getTime() + politica.anticipacionMinutos * 60_000),
    pasoMinutos: 30,
  });
  return { ok: true, slots: slots.map((s) => s.toISOString()) };
}
