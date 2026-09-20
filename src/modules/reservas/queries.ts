import { and, asc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { organizaciones, sucursales } from "@/db/schema/core";
import { servicios } from "@/db/schema/catalogs";
import { contextoSuscripcion, tieneCapacidad } from "@/modules/billing/queries";
import { resolveTimeZone } from "@/modules/agenda/timezone";

/**
 * Datos públicos del portal de reservas. Solo se exponen campos seguros:
 * nada de teléfonos internos, correos del staff ni configuración financiera.
 */

export type PortalReservas = {
  organizacion: { id: string; nombre: string; slug: string };
  sucursales: Array<{
    id: string;
    nombre: string;
    direccion: string | null;
    autoConfirmar: boolean;
    zonaHoraria: string;
  }>;
};

export async function getPortalReservas(slug: string): Promise<PortalReservas | null> {
  const db = getDatabase();
  const [org] = await db
    .select({
      id: organizaciones.id,
      nombre: organizaciones.nombre,
      slug: organizaciones.slug,
      zonaHoraria: organizaciones.zonaHoraria,
    })
    .from(organizaciones)
    .where(and(eq(organizaciones.slug, slug), eq(organizaciones.activo, true)))
    .limit(1);
  if (!org) return null;

  // Plan sin reservas en línea (o suscripción vencida) → no se publican horarios.
  const suscripcion = await contextoSuscripcion(org.id, db);
  if (!tieneCapacidad(suscripcion, "reservas_online")) return null;
  const puedeAutoConfirmar = tieneCapacidad(suscripcion, "reservas_auto_confirmar");

  const branchRows = await db
    .select({
      id: sucursales.id,
      nombre: sucursales.nombre,
      direccion: sucursales.direccion,
      autoConfirmar: sucursales.reservasAutoConfirmar,
      zonaHoraria: sucursales.zonaHoraria,
    })
    .from(sucursales)
    .where(
      and(
        eq(sucursales.organizacionId, org.id),
        eq(sucursales.activo, true),
        eq(sucursales.reservasOnline, true),
      ),
    )
    .orderBy(asc(sucursales.nombre));

  return {
    organizacion: { id: org.id, nombre: org.nombre, slug: org.slug },
    sucursales: branchRows.map((b) => ({
      ...b,
      autoConfirmar: b.autoConfirmar && puedeAutoConfirmar,
      zonaHoraria: resolveTimeZone(b.zonaHoraria, org.zonaHoraria),
    })),
  };
}

export type ServicioReservable = {
  id: string;
  nombre: string;
  descripcion: string | null;
  duracionMinutos: number;
  precio: string;
  categoria: string | null;
};

/** Servicios reservables en línea: activos y marcados visibles en agenda. */
export async function getServiciosReservables(organizacionId: string): Promise<ServicioReservable[]> {
  const db = getDatabase();
  const rows = await db
    .select({
      id: servicios.id,
      nombre: servicios.nombre,
      descripcion: servicios.descripcion,
      duracionMinutos: servicios.duracionMinutos,
      precio: servicios.precioBase,
      categoria: servicios.categoriaId,
    })
    .from(servicios)
    .where(
      and(
        eq(servicios.organizacionId, organizacionId),
        eq(servicios.activo, true),
        eq(servicios.visibleAgenda, true),
      ),
    )
    .orderBy(asc(servicios.nombre));
  return rows;
}

/** Sucursal reservable con su configuración (valida org + flag + entitlement). */
export async function getSucursalReservable(organizacionId: string, sucursalId: string) {
  const db = getDatabase();
  const suscripcion = await contextoSuscripcion(organizacionId, db);
  if (!tieneCapacidad(suscripcion, "reservas_online")) return null;
  const [row] = await db
    .select({
      id: sucursales.id,
      nombre: sucursales.nombre,
      reservasOnline: sucursales.reservasOnline,
      autoConfirmar: sucursales.reservasAutoConfirmar,
      capacidadSinAsignar: sucursales.capacidadSinAsignar,
      anticipacionMinutos: sucursales.reservasAnticipacionMinutos,
      horizonteDias: sucursales.reservasHorizonteDias,
      cancelacionHoras: sucursales.reservasCancelacionHoras,
      zonaHoraria: sucursales.zonaHoraria,
      orgZonaHoraria: organizaciones.zonaHoraria,
    })
    .from(sucursales)
    .innerJoin(organizaciones, eq(sucursales.organizacionId, organizaciones.id))
    .where(
      and(
        eq(sucursales.id, sucursalId),
        eq(sucursales.organizacionId, organizacionId),
        eq(sucursales.activo, true),
        eq(organizaciones.activo, true),
      ),
    )
    .limit(1);
  if (!row || !row.reservasOnline) return null;
  return {
    id: row.id,
    nombre: row.nombre,
    autoConfirmar: row.autoConfirmar && tieneCapacidad(suscripcion, "reservas_auto_confirmar"),
    capacidadSinAsignar: row.capacidadSinAsignar,
    anticipacionMinutos: row.anticipacionMinutos,
    horizonteDias: row.horizonteDias,
    cancelacionHoras: row.cancelacionHoras,
    zonaHoraria: resolveTimeZone(row.zonaHoraria, row.orgZonaHoraria),
  };
}
