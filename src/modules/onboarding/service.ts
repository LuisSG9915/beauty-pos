import { and, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { eventosProducto, progresoGuias } from "@/db/schema/onboarding";
import { EVENTOS_PRODUCTO, GUIA_CONFIGURACION, GUIA_VERSION } from "./types";
import type { EstadoGuia } from "./types";

type Db = ReturnType<typeof getDatabase>;

export type AccionGuia = "omitir" | "reanudar" | "reiniciar";

const ESTADO_POR_ACCION: Record<AccionGuia, EstadoGuia> = {
  omitir: "omitida",
  reanudar: "en_progreso",
  reiniciar: "en_progreso",
};

const EVENTO_POR_ACCION: Record<AccionGuia, string> = {
  omitir: EVENTOS_PRODUCTO.guiaOmitida,
  reanudar: EVENTOS_PRODUCTO.guiaReanudada,
  reiniciar: EVENTOS_PRODUCTO.guiaReiniciada,
};

/**
 * Persiste la decisión del usuario sobre la guía (omitir / reanudar /
 * reiniciar) y registra el hito de producto en la misma transacción.
 * El avance real de los pasos nunca se escribe: se deriva del negocio.
 */
export async function registrarAccionGuia(
  db: Db,
  input: {
    organizacionId: string;
    usuarioId: string;
    accion: AccionGuia;
    /** Índice del siguiente paso pendiente; informativo para reanudar. */
    pasoActual: number;
  },
): Promise<void> {
  const estado = ESTADO_POR_ACCION[input.accion];
  const pasoActual = input.accion === "reiniciar" ? 0 : Math.max(0, input.pasoActual);

  await db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: progresoGuias.id })
      .from(progresoGuias)
      .where(
        and(
          eq(progresoGuias.organizacionId, input.organizacionId),
          eq(progresoGuias.usuarioId, input.usuarioId),
          eq(progresoGuias.guiaClave, GUIA_CONFIGURACION),
          eq(progresoGuias.guiaVersion, GUIA_VERSION),
        ),
      )
      .limit(1);

    await tx
      .insert(progresoGuias)
      .values({
        organizacionId: input.organizacionId,
        usuarioId: input.usuarioId,
        guiaClave: GUIA_CONFIGURACION,
        guiaVersion: GUIA_VERSION,
        pasoActual,
        estado,
      })
      .onConflictDoUpdate({
        target: [
          progresoGuias.usuarioId,
          progresoGuias.organizacionId,
          progresoGuias.guiaClave,
          progresoGuias.guiaVersion,
        ],
        set: {
          estado,
          pasoActual,
          actualizadaAt: new Date(),
          terminadaAt: null,
        },
      });

    // Si la persona «reanuda» sin haber interactuado antes, el hito real es
    // que la guía empezó por primera vez.
    const nombre = input.accion === "reanudar" && !existente
      ? EVENTOS_PRODUCTO.guiaIniciada
      : EVENTO_POR_ACCION[input.accion];

    await tx.insert(eventosProducto).values({
      organizacionId: input.organizacionId,
      usuarioId: input.usuarioId,
      nombre,
      atributos: { guia: GUIA_CONFIGURACION, version: GUIA_VERSION, pasoActual },
    });
  });
}
