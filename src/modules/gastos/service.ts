import { and, eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";

import { gastos } from "@/db/schema/finance";
import { cortesCaja, movimientosCaja } from "@/db/schema/operations";

type Schema = typeof import("@/db/schema");

/** Conexión usable dentro o fuera de una transacción. */
export type GastoDb = NodePgDatabase<Schema> | NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;

export type RegistrarGastoInput = {
  organizacionId: string;
  sucursalId: string;
  categoriaId: string | null;
  concepto: string;
  /** Fecha del gasto (YYYY-MM-DD), distinta de la fecha de registro. */
  fechaGasto: string;
  importe: string;
  medioPagoId: string;
  /** El llamador resuelve `cat_medios_pago.categoria === 'efectivo'`. */
  medioEsEfectivo: boolean;
  proveedor: string | null;
  referencia: string | null;
  notas: string | null;
  usuarioId: string;
};

/**
 * Registra un gasto. Si el medio es efectivo y hay un corte abierto en la
 * sucursal, genera el movimiento de caja `gasto` en la misma transacción y
 * lo vincula: el dinero sale del cajón exactamente una vez. Sin corte
 * abierto el gasto se registra igual (el efectivo salió antes de abrir).
 */
export async function registrarGasto(
  db: GastoDb,
  input: RegistrarGastoInput,
): Promise<{ gastoId: string; movimientoCajaId: string | null }> {
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
          tipo: "gasto",
          monto: input.importe,
          notas: `Gasto: ${input.concepto}`,
          usuarioId: input.usuarioId,
          createdBy: input.usuarioId,
        })
        .returning({ id: movimientosCaja.id });
      movimientoCajaId = movimiento?.id ?? null;
    }
  }

  const [gasto] = await db
    .insert(gastos)
    .values({
      organizacionId: input.organizacionId,
      sucursalId: input.sucursalId,
      categoriaId: input.categoriaId,
      concepto: input.concepto,
      fechaGasto: input.fechaGasto,
      importe: input.importe,
      medioPagoId: input.medioPagoId,
      proveedor: input.proveedor,
      referencia: input.referencia,
      notas: input.notas,
      movimientoCajaId,
      estado: "confirmado",
      usuarioId: input.usuarioId,
      createdBy: input.usuarioId,
    })
    .returning({ id: gastos.id });

  return { gastoId: gasto.id, movimientoCajaId };
}

/**
 * Reversa un gasto confirmado: queda `revertido` con motivo y autor, sin
 * borrar el documento. Si el gasto salió del cajón (tenía movimiento de
 * caja), registra una `entrada` compensatoria en el corte abierto ACTUAL —
 * nunca reabre ni muta un corte ya cerrado.
 */
export async function revertirGasto(
  db: GastoDb,
  input: {
    gasto: {
      id: string;
      organizacionId: string;
      sucursalId: string;
      concepto: string;
      importe: string;
      medioPagoId: string;
      movimientoCajaId: string | null;
    };
    motivo: string;
    usuarioId: string;
  },
): Promise<{ entradaCajaId: string | null }> {
  const ahora = new Date();
  await db
    .update(gastos)
    .set({
      estado: "revertido",
      revertidoAt: ahora,
      revertidoPor: input.usuarioId,
      motivoReversion: input.motivo,
      updatedBy: input.usuarioId,
    })
    .where(eq(gastos.id, input.gasto.id));

  let entradaCajaId: string | null = null;
  if (input.gasto.movimientoCajaId) {
    const [corte] = await db
      .select({ id: cortesCaja.id })
      .from(cortesCaja)
      .where(
        and(
          eq(cortesCaja.organizacionId, input.gasto.organizacionId),
          eq(cortesCaja.sucursalId, input.gasto.sucursalId),
          eq(cortesCaja.estado, "abierto"),
          eq(cortesCaja.activo, true),
        ),
      )
      .limit(1);
    if (corte) {
      const [movimiento] = await db
        .insert(movimientosCaja)
        .values({
          organizacionId: input.gasto.organizacionId,
          sucursalId: input.gasto.sucursalId,
          corteId: corte.id,
          medioPagoId: input.gasto.medioPagoId,
          tipo: "entrada",
          monto: input.gasto.importe,
          notas: `Reversión de gasto: ${input.gasto.concepto}`,
          usuarioId: input.usuarioId,
          createdBy: input.usuarioId,
        })
        .returning({ id: movimientosCaja.id });
      entradaCajaId = movimiento?.id ?? null;
    }
  }
  return { entradaCajaId };
}
