import { eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { configuracionPos } from "@/db/schema/core";
import {
  CARACTERISTICAS_POR_DEFECTO,
  CLAVES_CARACTERISTICAS_POS,
  type ClaveCaracteristicaPos,
} from "./caracteristicas";

export type ConfiguracionPos = Record<ClaveCaracteristicaPos, boolean>;

/**
 * Lee la configuración de características del POS para una organización.
 * Devuelve todas las claves con su valor; las que no tengan fila en la
 * tabla usan el valor por defecto (`true`).
 */
export async function cargarConfiguracionPos(
  organizacionId: string,
): Promise<ConfiguracionPos> {
  const db = getDatabase();
  const filas = await db
    .select({ clave: configuracionPos.clave, valor: configuracionPos.valor })
    .from(configuracionPos)
    .where(eq(configuracionPos.organizacionId, organizacionId));

  const configuracion: ConfiguracionPos = { ...CARACTERISTICAS_POR_DEFECTO };
  for (const fila of filas) {
    configuracion[fila.clave as ClaveCaracteristicaPos] = fila.valor;
  }
  return configuracion;
}

/**
 * Indica si la organización ya guardó al menos una característica del POS.
 * Se usa para saber si ya completó la pantalla inicial de selección.
 */
export async function existeConfiguracionPos(
  organizacionId: string,
): Promise<boolean> {
  const db = getDatabase();
  const [fila] = await db
    .select({ id: configuracionPos.id })
    .from(configuracionPos)
    .where(eq(configuracionPos.organizacionId, organizacionId))
    .limit(1);
  return !!fila;
}

/**
 * Guarda (o crea) el valor de una característica para una organización.
 * Upsert: si ya existe la fila `(organizacion_id, clave)`, actualiza;
 * si no, la inserta.
 */
export async function guardarConfiguracionPos(
  organizacionId: string,
  clave: ClaveCaracteristicaPos,
  valor: boolean,
): Promise<void> {
  const db = getDatabase();
  await db
    .insert(configuracionPos)
    .values({ organizacionId, clave, valor })
    .onConflictDoUpdate({
      target: [configuracionPos.organizacionId, configuracionPos.clave],
      set: {
        valor,
        actualizadaAt: new Date(),
      },
    });
}

/** Guarda varias características de una vez en una transacción. */
export async function guardarConfiguracionesPos(
  organizacionId: string,
  valores: Record<ClaveCaracteristicaPos, boolean>,
): Promise<void> {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    for (const [clave, valor] of Object.entries(valores)) {
      const claveNormalizada = clave as ClaveCaracteristicaPos;
      if (!CLAVES_CARACTERISTICAS_POS.includes(claveNormalizada)) continue;
      await tx
        .insert(configuracionPos)
        .values({ organizacionId, clave: claveNormalizada, valor })
        .onConflictDoUpdate({
          target: [
            configuracionPos.organizacionId,
            configuracionPos.clave,
          ],
          set: {
            valor,
            actualizadaAt: new Date(),
          },
        });
    }
  });
}
