import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { catMediosPago } from "@/db/schema/catalogs";
import { usuarios } from "@/db/schema/core";
import { detalleVentasComisiones, detalleVentasServicios, liquidacionesComisiones, ventas } from "@/db/schema/operations";
import { servicios } from "@/db/schema/catalogs";

type Db = ReturnType<typeof getDatabase>;

/** Momento de la comisión: cobro confirmado, con fallback histórico explícito. */
const fechaComision = () => sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;

export type FiltroComisiones = {
  organizacionId: string;
  sucursalId: string;
  /** Límites UTC del periodo sobre la fecha de cobro de la venta. */
  iniciaAt: Date;
  terminaAt: Date;
  usuarioId?: string;
};

export type ComisionPendienteRow = {
  id: string;
  usuarioId: string;
  profesional: string;
  servicio: string | null;
  ventaId: string;
  base: string;
  monto: string;
  fecha: Date;
};

/** Comisiones devengadas, activas y aún sin liquidar en el periodo. */
export async function listarComisionesPendientes(db: Db, filtro: FiltroComisiones): Promise<ComisionPendienteRow[]> {
  const fecha = fechaComision();
  return db
    .select({
      id: detalleVentasComisiones.id,
      usuarioId: detalleVentasComisiones.usuarioId,
      profesional: usuarios.nombre,
      servicio: servicios.nombre,
      ventaId: detalleVentasComisiones.ventaId,
      base: detalleVentasComisiones.base,
      monto: detalleVentasComisiones.monto,
      fecha,
    })
    .from(detalleVentasComisiones)
    .innerJoin(ventas, eq(detalleVentasComisiones.ventaId, ventas.id))
    .innerJoin(usuarios, eq(detalleVentasComisiones.usuarioId, usuarios.id))
    .leftJoin(detalleVentasServicios, eq(detalleVentasComisiones.detalleVentaServicioId, detalleVentasServicios.id))
    .leftJoin(servicios, eq(detalleVentasServicios.servicioId, servicios.id))
    .where(
      and(
        eq(ventas.organizacionId, filtro.organizacionId),
        eq(ventas.sucursalId, filtro.sucursalId),
        eq(ventas.activo, true),
        eq(detalleVentasComisiones.activo, true),
        isNull(detalleVentasComisiones.liquidacionId),
        gte(fecha, filtro.iniciaAt),
        lt(fecha, filtro.terminaAt),
        filtro.usuarioId ? eq(detalleVentasComisiones.usuarioId, filtro.usuarioId) : undefined,
      ),
    )
    .orderBy(usuarios.nombre, fecha);
}

export type LiquidacionRow = {
  id: string;
  profesional: string;
  periodoDesde: string;
  periodoHasta: string;
  total: string;
  medio: string;
  estado: string;
  notas: string | null;
  motivoReversion: string | null;
  createdAt: Date;
};

/** Historial de liquidaciones del periodo (por fecha de creación). */
export async function listarLiquidaciones(
  db: Db,
  filtro: Pick<FiltroComisiones, "organizacionId" | "sucursalId">,
): Promise<LiquidacionRow[]> {
  return db
    .select({
      id: liquidacionesComisiones.id,
      profesional: usuarios.nombre,
      periodoDesde: liquidacionesComisiones.periodoDesde,
      periodoHasta: liquidacionesComisiones.periodoHasta,
      total: liquidacionesComisiones.total,
      medio: catMediosPago.nombre,
      estado: liquidacionesComisiones.estado,
      notas: liquidacionesComisiones.notas,
      motivoReversion: liquidacionesComisiones.motivoReversion,
      createdAt: liquidacionesComisiones.createdAt,
    })
    .from(liquidacionesComisiones)
    .innerJoin(usuarios, eq(liquidacionesComisiones.usuarioId, usuarios.id))
    .innerJoin(catMediosPago, eq(liquidacionesComisiones.medioPagoId, catMediosPago.id))
    .where(
      and(
        eq(liquidacionesComisiones.organizacionId, filtro.organizacionId),
        eq(liquidacionesComisiones.sucursalId, filtro.sucursalId),
      ),
    )
    .orderBy(desc(liquidacionesComisiones.createdAt))
    .limit(50);
}
