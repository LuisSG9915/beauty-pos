"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import {
  INCIDENTE_ESTADOS,
  INCIDENTE_PRIORIDADES,
  incidentesError,
  incidentesHistorial,
} from "@/db/schema/incidents";
import { usuarios } from "@/db/schema/core";
import {
  actionError,
  actionSuccess,
  parseWithSchema,
  type ActionState,
} from "@/lib/action-state";
import { requirePlatformAdmin } from "@/lib/auth/access";

const idSchema = z.uuid();
const notaSchema = z.object({
  incidenteId: idSchema,
  comentario: z.string().trim().min(1, "Escribe una nota.").max(1000),
});
const estadoSchema = z.object({
  incidenteId: idSchema,
  estado: z.enum(INCIDENTE_ESTADOS),
});
const prioridadSchema = z.object({
  incidenteId: idSchema,
  prioridad: z.enum(INCIDENTE_PRIORIDADES),
});
const asignacionSchema = z.object({
  incidenteId: idSchema,
  asignadoA: idSchema.nullish(),
});
const resolverSchema = z.object({
  incidenteId: idSchema,
  nota: z.string().trim().min(1, "Describe la solución aplicada.").max(1000),
  releaseCorregido: z.string().trim().max(60).optional().or(z.literal("")),
});

type Db = ReturnType<typeof getDatabase>;

// La tx de drizzle no tiene `$client`: basta con el método insert.
type HistorialDb = {
  insert: (table: typeof incidentesHistorial) => {
    values: (row: typeof incidentesHistorial.$inferInsert) => unknown;
  };
};

async function registrarHistorial(
  db: HistorialDb,
  params: {
    incidenteId: string;
    usuarioId: string;
    tipo: string;
    valorAnterior?: string | null;
    valorNuevo?: string | null;
    comentario?: string | null;
  },
) {
  await db.insert(incidentesHistorial).values({
    incidenteId: params.incidenteId,
    usuarioId: params.usuarioId,
    tipo: params.tipo,
    valorAnterior: params.valorAnterior ?? null,
    valorNuevo: params.valorNuevo ?? null,
    comentario: params.comentario ?? null,
  });
}

async function obtenerOError(db: Db, incidenteId: string) {
  const [incidente] = await db
    .select({
      id: incidentesError.id,
      estado: incidentesError.estado,
      prioridad: incidentesError.prioridad,
      asignadoA: incidentesError.asignadoA,
    })
    .from(incidentesError)
    .where(eq(incidentesError.id, incidenteId))
    .limit(1);
  return incidente ?? null;
}

function revalidar(incidenteId: string) {
  revalidatePath("/admin/incidentes");
  revalidatePath(`/admin/incidentes/${incidenteId}`);
}

export async function cambiarEstadoIncidente(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requirePlatformAdmin();
  const parsed = parseWithSchema(
    estadoSchema,
    Object.fromEntries(formData.entries()),
    "Revisa el estado seleccionado.",
  );
  if (!parsed.success) return parsed.state;
  const db = getDatabase();

  const incidente = await obtenerOError(db, parsed.data.incidenteId);
  if (!incidente) return actionError("El incidente no existe.");

  await db.transaction(async (tx) => {
    await tx
      .update(incidentesError)
      .set({
        estado: parsed.data.estado,
        resueltoAt: parsed.data.estado === "resuelto" ? new Date() : incidente.estado === "resuelto" ? null : undefined,
        resueltoPor:
          parsed.data.estado === "resuelto"
            ? user.id
            : incidente.estado === "resuelto"
              ? null
              : undefined,
        updatedAt: new Date(),
      })
      .where(eq(incidentesError.id, incidente.id));
    await registrarHistorial(tx, {
      incidenteId: incidente.id,
      usuarioId: user.id,
      tipo: "estado",
      valorAnterior: incidente.estado,
      valorNuevo: parsed.data.estado,
    });
  });

  revalidar(incidente.id);
  return actionSuccess("Estado actualizado.");
}

export async function cambiarPrioridadIncidente(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requirePlatformAdmin();
  const parsed = parseWithSchema(
    prioridadSchema,
    Object.fromEntries(formData.entries()),
    "Revisa la prioridad seleccionada.",
  );
  if (!parsed.success) return parsed.state;
  const db = getDatabase();

  const incidente = await obtenerOError(db, parsed.data.incidenteId);
  if (!incidente) return actionError("El incidente no existe.");

  await db.transaction(async (tx) => {
    await tx
      .update(incidentesError)
      .set({ prioridad: parsed.data.prioridad, updatedAt: new Date() })
      .where(eq(incidentesError.id, incidente.id));
    await registrarHistorial(tx, {
      incidenteId: incidente.id,
      usuarioId: user.id,
      tipo: "prioridad",
      valorAnterior: incidente.prioridad,
      valorNuevo: parsed.data.prioridad,
    });
  });

  revalidar(incidente.id);
  return actionSuccess("Prioridad actualizada.");
}

export async function asignarIncidente(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requirePlatformAdmin();
  const parsed = parseWithSchema(
    asignacionSchema,
    Object.fromEntries(formData.entries()),
    "Revisa la asignación.",
  );
  if (!parsed.success) return parsed.state;
  const db = getDatabase();

  const incidente = await obtenerOError(db, parsed.data.incidenteId);
  if (!incidente) return actionError("El incidente no existe.");

  // Solo se puede asignar a administradores de plataforma.
  if (parsed.data.asignadoA) {
    const [destino] = await db
      .select({ id: usuarios.id, nombre: usuarios.nombre })
      .from(usuarios)
      .where(eq(usuarios.id, parsed.data.asignadoA))
      .limit(1);
    if (!destino?.id || !(await esAdminPlataforma(db, destino.id))) {
      return actionError("Solo se puede asignar a un administrador de la plataforma.");
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(incidentesError)
      .set({
        asignadoA: parsed.data.asignadoA ?? null,
        estado:
          incidente.estado === "nuevo" && parsed.data.asignadoA
            ? "en_revision"
            : incidente.estado,
        updatedAt: new Date(),
      })
      .where(eq(incidentesError.id, incidente.id));
    await registrarHistorial(tx, {
      incidenteId: incidente.id,
      usuarioId: user.id,
      tipo: "asignacion",
      valorAnterior: incidente.asignadoA,
      valorNuevo: parsed.data.asignadoA ?? null,
    });
  });

  revalidar(incidente.id);
  return actionSuccess("Responsable actualizado.");
}

async function esAdminPlataforma(db: Db, usuarioId: string): Promise<boolean> {
  const [u] = await db
    .select({ es: usuarios.esAdministradorPlataforma })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1);
  return u?.es ?? false;
}

export async function agregarNotaIncidente(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requirePlatformAdmin();
  const parsed = parseWithSchema(
    notaSchema,
    Object.fromEntries(formData.entries()),
    "Revisa la nota.",
  );
  if (!parsed.success) return parsed.state;
  const db = getDatabase();

  const incidente = await obtenerOError(db, parsed.data.incidenteId);
  if (!incidente) return actionError("El incidente no existe.");

  await registrarHistorial(db, {
    incidenteId: incidente.id,
    usuarioId: user.id,
    tipo: "nota",
    comentario: parsed.data.comentario,
  });

  revalidar(incidente.id);
  return actionSuccess("Nota agregada.");
}

export async function resolverIncidente(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requirePlatformAdmin();
  const parsed = parseWithSchema(
    resolverSchema,
    Object.fromEntries(formData.entries()),
    "Revisa la resolución.",
  );
  if (!parsed.success) return parsed.state;
  const db = getDatabase();

  const incidente = await obtenerOError(db, parsed.data.incidenteId);
  if (!incidente) return actionError("El incidente no existe.");

  await db.transaction(async (tx) => {
    await tx
      .update(incidentesError)
      .set({
        estado: "resuelto",
        resueltoAt: new Date(),
        resueltoPor: user.id,
        notaResolucion: parsed.data.nota,
        releaseCorregido: parsed.data.releaseCorregido || null,
        updatedAt: new Date(),
      })
      .where(eq(incidentesError.id, incidente.id));
    await registrarHistorial(tx, {
      incidenteId: incidente.id,
      usuarioId: user.id,
      tipo: "estado",
      valorAnterior: incidente.estado,
      valorNuevo: "resuelto",
      comentario: parsed.data.nota,
    });
  });

  revalidar(incidente.id);
  return actionSuccess("Incidente marcado como resuelto.");
}
