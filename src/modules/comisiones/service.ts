import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";

import { cortesCaja, detalleVentasComisiones, liquidacionesComisiones, movimientosCaja, ventas } from "@/db/schema/operations";

type Schema = typeof import("@/db/schema");

/** Conexión usable dentro o fuera de una transacción. */
export type ComisionDb = NodePgDatabase<Schema> | NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;

export type LiquidarComisionesInput = {
  organizacionId: string;
  sucursalId: string;
  /** Profesional que recibe el pago. */
  usuarioId: string;
  iniciaAt: Date;
  terminaAt: Date;
  periodoDesde: string;
  periodoHasta: string;
  medioPagoId: string;
  /** El llamador resuelve `cat_medios_pago.categoria === 'efectivo'`. */
  medioEsEfectivo: boolean;
  notas: string | null;
  actorId: string;
};

/**
 * Paga todas las comisiones pendientes del profesional en el periodo. Las
 * líneas se bloquean (`for update`), se ligan a la liquidación y, si el
 * medio es efectivo, sale un `retiro` del corte abierto en la misma
 * transacción: el dinero sale del cajón exactamente una vez.
 */
export async function liquidarComisiones(
  db: ComisionDb,
  input: LiquidarComisionesInput,
): Promise<{ liquidacionId: string; total: string; cantidad: number; movimientoCajaId: string | null }> {
  const fechaComision = sql<Date>`coalesce(${ventas.cobradaAt}, ${ventas.createdAt})`;
  const pendientes = await db
    .select({ id: detalleVentasComisiones.id, monto: detalleVentasComisiones.monto })
    .from(detalleVentasComisiones)
    .innerJoin(ventas, eq(detalleVentasComisiones.ventaId, ventas.id))
    .where(
      and(
        eq(ventas.organizacionId, input.organizacionId),
        eq(ventas.sucursalId, input.sucursalId),
        eq(ventas.activo, true),
        eq(detalleVentasComisiones.activo, true),
        eq(detalleVentasComisiones.usuarioId, input.usuarioId),
        isNull(detalleVentasComisiones.liquidacionId),
        gte(fechaComision, input.iniciaAt),
        lt(fechaComision, input.terminaAt),
      ),
    )
    .for("update");

  if (pendientes.length === 0) {
    throw new Error("sin_pendientes");
  }

  const total = pendientes.reduce((suma, row) => suma + Number(row.monto), 0);

  let movimientoCajaId: string | null = null;
  if (input.medioEsEfectivo) {
    const [corte] = await db
      .select({ id: cortesCaja.id })
      .from(cortesCaja)
      .where(
        and(
          eq(cortesCaja.organizacionId, input.organizacionId),
          eq(cortesCaja.sucursalId, input.sucursalId),
          eq(cortesCaja.estado, "abierto"),
          eq(cortesCaja.activo, true),
        ),
      )
      .limit(1)
      .for("update");
    if (corte) {
      const [movimiento] = await db
        .insert(movimientosCaja)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          corteId: corte.id,
          medioPagoId: input.medioPagoId,
          tipo: "retiro",
          monto: total.toFixed(2),
          notas: "Pago de comisiones",
          usuarioId: input.actorId,
          createdBy: input.actorId,
        })
        .returning({ id: movimientosCaja.id });
      movimientoCajaId = movimiento?.id ?? null;
    }
  }

  const [liquidacion] = await db
    .insert(liquidacionesComisiones)
    .values({
      organizacionId: input.organizacionId,
      sucursalId: input.sucursalId,
      usuarioId: input.usuarioId,
      periodoDesde: input.periodoDesde,
      periodoHasta: input.periodoHasta,
      total: total.toFixed(2),
      medioPagoId: input.medioPagoId,
      movimientoCajaId,
      notas: input.notas,
      estado: "confirmada",
      createdBy: input.actorId,
    })
    .returning({ id: liquidacionesComisiones.id });

  await db
    .update(detalleVentasComisiones)
    .set({ liquidacionId: liquidacion.id, updatedBy: input.actorId })
    .where(inArray(detalleVentasComisiones.id, pendientes.map((row) => row.id)));

  return { liquidacionId: liquidacion.id, total: total.toFixed(2), cantidad: pendientes.length, movimientoCajaId };
}

/**
 * Reversa una liquidación confirmada: queda `revertida` con motivo y autor,
 * sus líneas vuelven a pendientes y, si salió efectivo del cajón, se anota
 * una `entrada` compensatoria en el corte abierto ACTUAL (los cortes
 * cerrados no se tocan).
 */
export async function revertirLiquidacion(
  db: ComisionDb,
  input: {
    liquidacion: {
      id: string;
      organizacionId: string;
      sucursalId: string;
      total: string;
      medioPagoId: string;
      movimientoCajaId: string | null;
    };
    motivo: string;
    usuarioId: string;
  },
): Promise<{ entradaCajaId: string | null }> {
  const ahora = new Date();
  await db
    .update(liquidacionesComisiones)
    .set({
      estado: "revertida",
      revertidaAt: ahora,
      revertidaPor: input.usuarioId,
      motivoReversion: input.motivo,
      updatedBy: input.usuarioId,
    })
    .where(eq(liquidacionesComisiones.id, input.liquidacion.id));

  await db
    .update(detalleVentasComisiones)
    .set({ liquidacionId: null, updatedBy: input.usuarioId })
    .where(eq(detalleVentasComisiones.liquidacionId, input.liquidacion.id));

  let entradaCajaId: string | null = null;
  if (input.liquidacion.movimientoCajaId) {
    const [corte] = await db
      .select({ id: cortesCaja.id })
      .from(cortesCaja)
      .where(
        and(
          eq(cortesCaja.organizacionId, input.liquidacion.organizacionId),
          eq(cortesCaja.sucursalId, input.liquidacion.sucursalId),
          eq(cortesCaja.estado, "abierto"),
          eq(cortesCaja.activo, true),
        ),
      )
      .limit(1);
    if (corte) {
      const [movimiento] = await db
        .insert(movimientosCaja)
        .values({
          organizacionId: input.liquidacion.organizacionId,
          sucursalId: input.liquidacion.sucursalId,
          corteId: corte.id,
          medioPagoId: input.liquidacion.medioPagoId,
          tipo: "entrada",
          monto: input.liquidacion.total,
          notas: "Reversión de liquidación de comisiones",
          usuarioId: input.usuarioId,
          createdBy: input.usuarioId,
        })
        .returning({ id: movimientosCaja.id });
      entradaCajaId = movimiento?.id ?? null;
    }
  }
  return { entradaCajaId };
}
