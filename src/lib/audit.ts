import { auditoriaEventos } from "@/db/schema/access";

type AuditDb = {
  insert: (table: typeof auditoriaEventos) => {
    values: (row: typeof auditoriaEventos.$inferInsert) => unknown;
  };
};

export type AuditInput = {
  organizacionId: string;
  sucursalId?: string | null;
  /** Quien ejecuta la acción (null = proceso de plataforma/sistema). */
  usuarioId: string | null;
  /** Ej. "venta.cobrada", "miembro.roles", "invitacion.creada". */
  accion: string;
  entidad?: string;
  entidadId?: string | null;
  detalle?: Record<string, unknown>;
};

/**
 * Registra un evento sensible en `auditoria_eventos`. Se invoca con el `tx`
 * de la transacción que origina el cambio, de modo que el evento queda
 * comprometido o revertido junto con la operación. Nunca lanza hacia afuera:
 * una falla de bitácora no debe tumbar la operación de negocio.
 */
export async function auditEvent(db: AuditDb, input: AuditInput): Promise<void> {
  try {
    await db.insert(auditoriaEventos).values({
      organizacionId: input.organizacionId,
      sucursalId: input.sucursalId ?? null,
      usuarioId: input.usuarioId,
      accion: input.accion,
      entidad: input.entidad ?? null,
      entidadId: input.entidadId ?? null,
      detalle: input.detalle ?? null,
    });
  } catch (error) {
    console.error("auditEvent", input.accion, error);
  }
}
