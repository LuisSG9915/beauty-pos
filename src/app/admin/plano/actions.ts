"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import {
  MOBILIARIO_ESTADOS,
  MOBILIARIO_TIPOS,
  PISO_MAX_COLUMNAS,
  PISO_MAX_FILAS,
  PISO_MIN_COLUMNAS,
  PISO_MIN_FILAS,
  UBICACION_TIPOS,
  inventarioUbicaciones,
  mobiliario,
  pisos,
  ubicaciones,
} from "@/db/schema/plano";
import { recursos } from "@/db/schema/operations";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent, registrarAuditoria } from "@/lib/audit";
import { assertBranchScope, checkPermission } from "@/lib/auth/authorization";
import type { ToggleActivoResult } from "@/components/admin/toggle-activo";
import {
  elementosFueraDelPiso,
  primerEspacioLibre,
  validarColocacion,
  type ElementoPlano,
  type PlanoRect,
} from "@/modules/plano";

type PlanoDb = ReturnType<typeof getDatabase>;

/** Resultado simple para las acciones llamadas desde el lienzo (no form). */
export type PlanoMutationResult = { success: boolean; error?: string; message?: string };

/**
 * Elementos activos del piso: ubicaciones y mobiliario comparten la misma
 * cuadrícula, así que la validación de encimados los mezcla.
 */
async function elementosDelPiso(db: PlanoDb, pisoId: string): Promise<ElementoPlano[]> {
  const campos = { id: ubicaciones.id, x: ubicaciones.x, y: ubicaciones.y, ancho: ubicaciones.ancho, alto: ubicaciones.alto };
  const [ubs, mbs] = await Promise.all([
    db.select(campos).from(ubicaciones)
      .where(and(eq(ubicaciones.pisoId, pisoId), eq(ubicaciones.activo, true))),
    db.select({ id: mobiliario.id, x: mobiliario.x, y: mobiliario.y, ancho: mobiliario.ancho, alto: mobiliario.alto })
      .from(mobiliario)
      .where(and(eq(mobiliario.pisoId, pisoId), eq(mobiliario.activo, true))),
  ]);
  return [...ubs, ...mbs];
}

/** Piso de la org (con su sucursal para el chequeo de alcance). */
async function getPiso(
  db: PlanoDb,
  organizacionId: string,
  pisoId: string,
): Promise<typeof pisos.$inferSelect | null> {
  const [piso] = await db
    .select()
    .from(pisos)
    .where(and(eq(pisos.id, pisoId), eq(pisos.organizacionId, organizacionId)))
    .limit(1);
  return piso ?? null;
}

/* ------------------------------------------------------------------ */
/* Pisos                                                               */
/* ------------------------------------------------------------------ */

const pisoSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  pisoId: z.string().uuid().optional().or(z.literal("")),
  nombre: z.string().trim().min(2, "Indica el nombre del piso.").max(80),
  columnas: z.coerce.number().int().min(PISO_MIN_COLUMNAS, `Mínimo ${PISO_MIN_COLUMNAS} columnas.`).max(PISO_MAX_COLUMNAS, `Máximo ${PISO_MAX_COLUMNAS} columnas.`),
  filas: z.coerce.number().int().min(PISO_MIN_FILAS, `Mínimo ${PISO_MIN_FILAS} filas.`).max(PISO_MAX_FILAS, `Máximo ${PISO_MAX_FILAS} filas.`),
});

export async function guardarPiso(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(pisoSchema, Object.fromEntries(formData.entries()), "Revisa los datos del piso.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return actionError("No tienes permiso para editar el plano de la sucursal.");
  if (!(await assertBranchScope(access, input.sucursalId))) {
    return actionError("La sucursal no existe, está inactiva o no tienes acceso a ella.");
  }
  const db = getDatabase();
  try {
    const pisoId = input.pisoId || undefined;
    if (pisoId) {
      const piso = await getPiso(db, input.organizacionId, pisoId);
      if (!piso || piso.sucursalId !== input.sucursalId) {
        return actionError("El piso no existe en esta sucursal.");
      }
      // Reducir la cuadrícula falla si deja elementos activos fuera.
      const fuera = elementosFueraDelPiso(
        input.columnas,
        input.filas,
        await elementosDelPiso(db, pisoId),
      );
      if (fuera.length > 0) {
        return actionError(
          `El tamaño nuevo deja ${fuera.length} elemento(s) fuera del piso. Muévelos o quítalos primero.`,
        );
      }
      await db
        .update(pisos)
        .set({ nombre: input.nombre, columnas: input.columnas, filas: input.filas, updatedBy: access.user.id })
        .where(eq(pisos.id, pisoId));
      await registrarAuditoria({
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "plano.piso_guardado",
        entidad: "piso",
        entidadId: pisoId,
        detalle: { nombre: input.nombre, columnas: input.columnas, filas: input.filas },
      });
      revalidatePath("/admin/plano");
      return actionSuccess("Piso actualizado.");
    }

    const insertado = await db.transaction(async (tx) => {
      // Orden al final de los pisos existentes de la sucursal.
      const { rows: ordenRows } = await tx.execute<{ siguiente: number }>(sql`
        select coalesce(max(${pisos.orden}), -1) + 1 as siguiente
          from ${pisos}
         where ${pisos.sucursalId} = ${input.sucursalId}
      `);
      const siguiente = Number(ordenRows[0]?.siguiente ?? 0);
      const [row] = await tx
        .insert(pisos)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          nombre: input.nombre,
          orden: siguiente,
          columnas: input.columnas,
          filas: input.filas,
          createdBy: access.user.id,
        })
        .returning({ id: pisos.id });
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "plano.piso_creado",
        entidad: "piso",
        entidadId: row.id,
        detalle: { nombre: input.nombre, columnas: input.columnas, filas: input.filas },
      });
      return row;
    });
    revalidatePath("/admin/plano");
    return actionSuccess("Piso agregado al plano.", { id: insertado.id });
  } catch (error) {
    console.error("guardarPiso", error);
    return actionError("No se pudo guardar el piso. Intenta de nuevo.");
  }
}

/** Desactiva/reactiva un piso. Falla si aún tiene elementos activos. */
export async function desactivarPiso(formData: FormData): Promise<ToggleActivoResult> {
  const parsed = z
    .object({
      organizacionId: z.string().uuid(),
      id: z.string().uuid(),
      activar: z.coerce.boolean(),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return { error: "No tienes permiso para editar el plano de la sucursal." };
  const db = getDatabase();
  const piso = await getPiso(db, input.organizacionId, input.id);
  if (!piso) return { error: "El piso no existe." };
  if (!(await assertBranchScope(access, piso.sucursalId))) {
    return { error: "No tienes acceso a esta sucursal." };
  }
  if (!input.activar) {
    const elementos = await elementosDelPiso(db, piso.id);
    if (elementos.length > 0) {
      return {
        error: `El piso tiene ${elementos.length} elemento(s) activos. Quítalos o muévelos a otro piso primero.`,
      };
    }
  }
  try {
    await db
      .update(pisos)
      .set({ activo: input.activar, updatedBy: access.user.id })
      .where(eq(pisos.id, piso.id));
    await registrarAuditoria({
      organizacionId: input.organizacionId,
      sucursalId: piso.sucursalId,
      usuarioId: access.user.id,
      accion: input.activar ? "plano.piso_reactivado" : "plano.piso_desactivado",
      entidad: "piso",
      entidadId: piso.id,
      detalle: { nombre: piso.nombre },
    });
    revalidatePath("/admin/plano");
    return { success: true };
  } catch (error) {
    console.error("desactivarPiso", error);
    return { error: "No se pudo actualizar el piso." };
  }
}

/**
 * Intercambia el `orden` del piso con su vecino activo de la misma sucursal
 * (`izquierda` = orden anterior, `derecha` = siguiente). No-op en los extremos.
 */
export async function reordenarPiso(formData: FormData): Promise<PlanoMutationResult> {
  const parsed = z
    .object({
      organizacionId: z.string().uuid(),
      pisoId: z.string().uuid(),
      direccion: z.enum(["izquierda", "derecha"]),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Datos inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar el plano." };
  const db = getDatabase();
  const piso = await getPiso(db, input.organizacionId, input.pisoId);
  if (!piso || !piso.activo) return { success: false, error: "El piso no existe o está inactivo." };
  if (!(await assertBranchScope(access, piso.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  try {
    const movio = await db.transaction(async (tx) => {
      // Vecino activo inmediato en la dirección pedida (empates por id).
      const { rows: vecinos } = await tx.execute<{ id: string; orden: number }>(
        input.direccion === "izquierda"
          ? sql`select ${pisos.id} as id, ${pisos.orden} as orden from ${pisos}
                 where ${pisos.sucursalId} = ${piso.sucursalId} and ${pisos.activo}
                   and (${pisos.orden} < ${piso.orden} or (${pisos.orden} = ${piso.orden} and ${pisos.id} < ${piso.id}))
                 order by ${pisos.orden} desc, ${pisos.id} desc limit 1`
          : sql`select ${pisos.id} as id, ${pisos.orden} as orden from ${pisos}
                 where ${pisos.sucursalId} = ${piso.sucursalId} and ${pisos.activo}
                   and (${pisos.orden} > ${piso.orden} or (${pisos.orden} = ${piso.orden} and ${pisos.id} > ${piso.id}))
                 order by ${pisos.orden} asc, ${pisos.id} asc limit 1`,
      );
      const vecino = vecinos[0];
      if (!vecino) return false;
      await tx.update(pisos).set({ orden: vecino.orden, updatedBy: access.user.id }).where(eq(pisos.id, piso.id));
      await tx.update(pisos).set({ orden: piso.orden, updatedBy: access.user.id }).where(eq(pisos.id, vecino.id));
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: piso.sucursalId,
        usuarioId: access.user.id,
        accion: "plano.piso_reordenado",
        entidad: "piso",
        entidadId: piso.id,
        detalle: { nombre: piso.nombre, direccion: input.direccion },
      });
      return true;
    });
    if (!movio) return { success: false, error: "Ya está en ese extremo." };
    revalidatePath("/admin/plano");
    return { success: true, message: "Piso reordenado." };
  } catch (error) {
    console.error("reordenarPiso", error);
    return { success: false, error: "No se pudo reordenar el piso." };
  }
}

/* ------------------------------------------------------------------ */
/* Ubicaciones (dónde se guarda la mercancía)                          */
/* ------------------------------------------------------------------ */

const ubicacionSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  ubicacionId: z.string().uuid().optional().or(z.literal("")),
  pisoId: z.string().uuid(),
  tipo: z.enum(UBICACION_TIPOS),
  nombre: z.string().trim().min(2, "Indica el nombre de la ubicación.").max(80),
});

export async function guardarUbicacion(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(ubicacionSchema, Object.fromEntries(formData.entries()), "Revisa los datos de la ubicación.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return actionError("No tienes permiso para editar el plano de la sucursal.");
  if (!(await assertBranchScope(access, input.sucursalId))) {
    return actionError("La sucursal no existe, está inactiva o no tienes acceso a ella.");
  }
  const db = getDatabase();
  try {
    const piso = await getPiso(db, input.organizacionId, input.pisoId);
    if (!piso || !piso.activo || piso.sucursalId !== input.sucursalId) {
      return actionError("El piso no existe o está inactivo en esta sucursal.");
    }

    const ubicacionId = input.ubicacionId || undefined;
    if (ubicacionId) {
      const [actual] = await db
        .select({ id: ubicaciones.id })
        .from(ubicaciones)
        .where(
          and(
            eq(ubicaciones.id, ubicacionId),
            eq(ubicaciones.organizacionId, input.organizacionId),
            eq(ubicaciones.sucursalId, input.sucursalId),
          ),
        )
        .limit(1);
      if (!actual) return actionError("La ubicación no existe en esta sucursal.");
      await db
        .update(ubicaciones)
        .set({ tipo: input.tipo, nombre: input.nombre, updatedBy: access.user.id })
        .where(eq(ubicaciones.id, ubicacionId));
      await registrarAuditoria({
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "plano.ubicacion_guardada",
        entidad: "ubicacion",
        entidadId: ubicacionId,
        detalle: { nombre: input.nombre, tipo: input.tipo },
      });
      revalidatePath("/admin/plano");
      return actionSuccess("Ubicación actualizada.");
    }

    // Alta: se coloca en la primera celda libre (2×1) del piso elegido.
    const elementos = await elementosDelPiso(db, piso.id);
    const libre = primerEspacioLibre({
      columnas: piso.columnas,
      filas: piso.filas,
      elementos,
    });
    if (!libre) {
      return actionError("El piso está lleno; agrándalo o quita elementos primero.");
    }
    const insertado = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(ubicaciones)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          pisoId: piso.id,
          tipo: input.tipo,
          nombre: input.nombre,
          x: libre.x,
          y: libre.y,
          ancho: 2,
          alto: 1,
          createdBy: access.user.id,
        })
        .returning({ id: ubicaciones.id });
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "plano.ubicacion_creada",
        entidad: "ubicacion",
        entidadId: row.id,
        detalle: { nombre: input.nombre, tipo: input.tipo, pisoId: piso.id },
      });
      return row;
    });
    revalidatePath("/admin/plano");
    return actionSuccess("Ubicación agregada al plano.", { id: insertado.id });
  } catch (error) {
    console.error("guardarUbicacion", error);
    return actionError("No se pudo guardar la ubicación. Intenta de nuevo.");
  }
}

/**
 * Quita una ubicación del plano. Falla cuando aún tiene mercancía asignada
 * (Σ cantidades > 0): hay que pasarla a otra ubicación primero.
 */
export async function desactivarUbicacion(formData: FormData): Promise<ToggleActivoResult> {
  const parsed = z
    .object({
      organizacionId: z.string().uuid(),
      id: z.string().uuid(),
      activar: z.coerce.boolean(),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return { error: "No tienes permiso para editar el plano de la sucursal." };
  const db = getDatabase();
  const [ubicacion] = await db
    .select({ id: ubicaciones.id, sucursalId: ubicaciones.sucursalId, nombre: ubicaciones.nombre })
    .from(ubicaciones)
    .where(and(eq(ubicaciones.id, input.id), eq(ubicaciones.organizacionId, input.organizacionId)))
    .limit(1);
  if (!ubicacion) return { error: "La ubicación no existe." };
  if (!(await assertBranchScope(access, ubicacion.sucursalId))) {
    return { error: "No tienes acceso a esta sucursal." };
  }
  if (!input.activar) {
    const { rows } = await db.execute<{ total: string | number | null }>(sql`
      select coalesce(sum(${inventarioUbicaciones.cantidad}), 0) as total
        from ${inventarioUbicaciones}
       where ${inventarioUbicaciones.ubicacionId} = ${ubicacion.id}
    `);
    if (Number(rows[0]?.total ?? 0) > 0) {
      return { error: "Pasa la mercancía a otra ubicación primero." };
    }
  }
  try {
    await db
      .update(ubicaciones)
      .set({ activo: input.activar, updatedBy: access.user.id })
      .where(eq(ubicaciones.id, ubicacion.id));
    await registrarAuditoria({
      organizacionId: input.organizacionId,
      sucursalId: ubicacion.sucursalId,
      usuarioId: access.user.id,
      accion: input.activar ? "plano.ubicacion_reactivada" : "plano.ubicacion_desactivada",
      entidad: "ubicacion",
      entidadId: ubicacion.id,
      detalle: { nombre: ubicacion.nombre },
    });
    revalidatePath("/admin/plano");
    revalidatePath("/admin/inventario");
    return { success: true };
  } catch (error) {
    console.error("desactivarUbicacion", error);
    return { error: "No se pudo actualizar la ubicación." };
  }
}

/* ------------------------------------------------------------------ */
/* Mover / redimensionar (arrastre en el lienzo)                        */
/* ------------------------------------------------------------------ */

const moverSchema = z.object({
  organizacionId: z.string().uuid(),
  tipo: z.enum(["ubicacion", "mobiliario"]),
  id: z.string().uuid(),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
  ancho: z.coerce.number().int().min(1).max(20),
  alto: z.coerce.number().int().min(1).max(20),
});

/**
 * Una sola acción para arrastre y redimensión: valida límites de piso y
 * encimados contra los demás elementos activos, y devuelve error legible
 * para que el lienzo revierta la actualización optimista.
 */
export async function moverElemento(formData: FormData): Promise<PlanoMutationResult> {
  const parsed = moverSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Datos del movimiento inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar el plano." };
  const db = getDatabase();

  const rect: PlanoRect = { x: input.x, y: input.y, ancho: input.ancho, alto: input.alto };
  let sucursalElemento: string | null = null;
  try {
    if (input.tipo === "ubicacion") {
      const [elemento] = await db
        .select({ id: ubicaciones.id, pisoId: ubicaciones.pisoId, sucursalId: ubicaciones.sucursalId })
        .from(ubicaciones)
        .where(and(eq(ubicaciones.id, input.id), eq(ubicaciones.organizacionId, input.organizacionId)))
        .limit(1);
      if (!elemento) return { success: false, error: "La ubicación no existe." };
      if (!(await assertBranchScope(access, elemento.sucursalId))) {
        return { success: false, error: "No tienes acceso a esta sucursal." };
      }
      sucursalElemento = elemento.sucursalId;
      const piso = await getPiso(db, input.organizacionId, elemento.pisoId);
      if (!piso || !piso.activo) return { success: false, error: "El piso no existe o está inactivo." };
      const violaciones = validarColocacion({
        rect,
        columnas: piso.columnas,
        filas: piso.filas,
        elementos: await elementosDelPiso(db, elemento.pisoId),
        ignorarId: elemento.id,
      });
      if (violaciones.length > 0) return { success: false, error: violaciones[0].mensaje };
      await db
        .update(ubicaciones)
        .set({ x: input.x, y: input.y, ancho: input.ancho, alto: input.alto, updatedBy: access.user.id })
        .where(eq(ubicaciones.id, elemento.id));
    } else {
      const [elemento] = await db
        .select({ id: mobiliario.id, pisoId: mobiliario.pisoId, sucursalId: mobiliario.sucursalId })
        .from(mobiliario)
        .where(and(eq(mobiliario.id, input.id), eq(mobiliario.organizacionId, input.organizacionId)))
        .limit(1);
      if (!elemento) return { success: false, error: "El mueble no existe." };
      if (!(await assertBranchScope(access, elemento.sucursalId))) {
        return { success: false, error: "No tienes acceso a esta sucursal." };
      }
      sucursalElemento = elemento.sucursalId;
      if (!elemento.pisoId) {
        return { success: false, error: "Coloca el mueble en un piso primero." };
      }
      const piso = await getPiso(db, input.organizacionId, elemento.pisoId);
      if (!piso || !piso.activo) return { success: false, error: "El piso no existe o está inactivo." };
      const violaciones = validarColocacion({
        rect,
        columnas: piso.columnas,
        filas: piso.filas,
        elementos: await elementosDelPiso(db, elemento.pisoId),
        ignorarId: elemento.id,
      });
      if (violaciones.length > 0) return { success: false, error: violaciones[0].mensaje };
      await db
        .update(mobiliario)
        .set({ x: input.x, y: input.y, ancho: input.ancho, alto: input.alto, updatedBy: access.user.id })
        .where(eq(mobiliario.id, elemento.id));
    }
    await registrarAuditoria({
      organizacionId: input.organizacionId,
      sucursalId: sucursalElemento,
      usuarioId: access.user.id,
      accion: "plano.elemento_movido",
      entidad: input.tipo,
      entidadId: input.id,
      detalle: { x: input.x, y: input.y, ancho: input.ancho, alto: input.alto },
    });
    revalidatePath("/admin/plano");
    return { success: true };
  } catch (error) {
    console.error("moverElemento", error);
    return { success: false, error: "No se pudo mover el elemento. Intenta de nuevo." };
  }
}

/* ------------------------------------------------------------------ */
/* Mobiliario                                                           */
/* ------------------------------------------------------------------ */

const mobiliarioSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  mobiliarioId: z.string().uuid().optional().or(z.literal("")),
  // "" = mueble registrado sin colocar en el plano.
  pisoId: z.string().uuid().optional().or(z.literal("")),
  tipo: z.enum(MOBILIARIO_TIPOS),
  nombre: z.string().trim().min(2, "Indica el nombre del mueble.").max(80),
  estado: z.enum(MOBILIARIO_ESTADOS).default("bueno"),
  recursoId: z.string().uuid().optional().or(z.literal("")),
  fechaAdquisicion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  // "" (input vacío) → undefined → la columna queda null, no 0.00.
  costo: z.preprocess(
    (valor) => (valor === "" || valor == null ? undefined : valor),
    z.coerce.number().min(0).optional(),
  ),
  notas: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function guardarMobiliario(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(mobiliarioSchema, Object.fromEntries(formData.entries()), "Revisa los datos del mueble.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return actionError("No tienes permiso para editar el plano de la sucursal.");
  if (!(await assertBranchScope(access, input.sucursalId))) {
    return actionError("La sucursal no existe, está inactiva o no tienes acceso a ella.");
  }
  const db = getDatabase();
  try {
    const pisoId = input.pisoId || null;
    let piso: Awaited<ReturnType<typeof getPiso>> = null;
    if (pisoId) {
      piso = await getPiso(db, input.organizacionId, pisoId);
      if (!piso || !piso.activo || piso.sucursalId !== input.sucursalId) {
        return actionError("El piso no existe o está inactivo en esta sucursal.");
      }
    }

    const recursoId = input.recursoId || null;
    if (recursoId) {
      // El recurso enlazado debe ser de la misma sucursal (regla del plan).
      const [recurso] = await db
        .select({ id: recursos.id })
        .from(recursos)
        .where(
          and(
            eq(recursos.id, recursoId),
            eq(recursos.organizacionId, input.organizacionId),
            eq(recursos.sucursalId, input.sucursalId),
            eq(recursos.activo, true),
          ),
        )
        .limit(1);
      if (!recurso) return actionError("El recurso de agenda elegido no pertenece a esta sucursal.");
    }

    const mobiliarioId = input.mobiliarioId || undefined;
    if (mobiliarioId) {
      const [actual] = await db
        .select()
        .from(mobiliario)
        .where(
          and(
            eq(mobiliario.id, mobiliarioId),
            eq(mobiliario.organizacionId, input.organizacionId),
            eq(mobiliario.sucursalId, input.sucursalId),
          ),
        )
        .limit(1);
      if (!actual) return actionError("El mueble no existe en esta sucursal.");

      // Cambio de piso (o colocar por primera vez): primera celda libre.
      let posicion: PlanoRect = { x: actual.x, y: actual.y, ancho: actual.ancho, alto: actual.alto };
      if (pisoId !== actual.pisoId) {
        if (!piso) {
          posicion = { x: 0, y: 0, ancho: actual.ancho, alto: actual.alto };
        } else {
          const libre = primerEspacioLibre({
            columnas: piso.columnas,
            filas: piso.filas,
            elementos: await elementosDelPiso(db, piso.id),
            ancho: Math.min(actual.ancho, piso.columnas),
            alto: Math.min(actual.alto, piso.filas),
          });
          if (!libre) {
            return actionError("El piso elegido está lleno; agrándalo o quita elementos primero.");
          }
          posicion = { x: libre.x, y: libre.y, ancho: Math.min(actual.ancho, piso.columnas), alto: Math.min(actual.alto, piso.filas) };
        }
      }
      await db
        .update(mobiliario)
        .set({
          pisoId,
          tipo: input.tipo,
          nombre: input.nombre,
          estado: input.estado,
          recursoId,
          fechaAdquisicion: input.fechaAdquisicion || null,
          costo: input.costo == null ? null : input.costo.toFixed(2),
          notas: input.notas || null,
          ...posicion,
          updatedBy: access.user.id,
        })
        .where(eq(mobiliario.id, mobiliarioId));
      await registrarAuditoria({
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "plano.mobiliario_guardado",
        entidad: "mobiliario",
        entidadId: mobiliarioId,
        detalle: { nombre: input.nombre, tipo: input.tipo, estado: input.estado, pisoId, recursoId },
      });
      revalidatePath("/admin/plano");
      return actionSuccess("Mueble actualizado.");
    }

    // Alta: si se eligió piso, primera celda libre 2×1; si no, sin colocar.
    let posicion: PlanoRect = { x: 0, y: 0, ancho: 2, alto: 1 };
    if (piso) {
      const libre = primerEspacioLibre({
        columnas: piso.columnas,
        filas: piso.filas,
        elementos: await elementosDelPiso(db, piso.id),
      });
      if (!libre) {
        return actionError("El piso elegido está lleno; agrándalo o quita elementos primero.");
      }
      posicion = { x: libre.x, y: libre.y, ancho: 2, alto: 1 };
    }
    const insertado = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(mobiliario)
        .values({
          organizacionId: input.organizacionId,
          sucursalId: input.sucursalId,
          pisoId,
          tipo: input.tipo,
          nombre: input.nombre,
          estado: input.estado,
          recursoId,
          fechaAdquisicion: input.fechaAdquisicion || null,
          costo: input.costo == null ? null : input.costo.toFixed(2),
          notas: input.notas || null,
          ...posicion,
          createdBy: access.user.id,
        })
        .returning({ id: mobiliario.id });
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "plano.mobiliario_creado",
        entidad: "mobiliario",
        entidadId: row.id,
        detalle: { nombre: input.nombre, tipo: input.tipo, pisoId, recursoId },
      });
      return row;
    });
    revalidatePath("/admin/plano");
    return actionSuccess("Mueble agregado al plano.", { id: insertado.id });
  } catch (error) {
    console.error("guardarMobiliario", error);
    return actionError("No se pudo guardar el mueble. Intenta de nuevo.");
  }
}

/** Cambia el estado físico del mueble (bueno / mantenimiento / baja). */
export async function cambiarEstadoMobiliario(formData: FormData): Promise<PlanoMutationResult> {
  const parsed = z
    .object({
      organizacionId: z.string().uuid(),
      id: z.string().uuid(),
      estado: z.enum(MOBILIARIO_ESTADOS),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { success: false, error: "Datos inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar el plano." };
  const db = getDatabase();
  const [mueble] = await db
    .select({ id: mobiliario.id, sucursalId: mobiliario.sucursalId, nombre: mobiliario.nombre })
    .from(mobiliario)
    .where(and(eq(mobiliario.id, input.id), eq(mobiliario.organizacionId, input.organizacionId)))
    .limit(1);
  if (!mueble) return { success: false, error: "El mueble no existe." };
  if (!(await assertBranchScope(access, mueble.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  try {
    await db
      .update(mobiliario)
      .set({ estado: input.estado, updatedBy: access.user.id })
      .where(eq(mobiliario.id, mueble.id));
    await registrarAuditoria({
      organizacionId: input.organizacionId,
      sucursalId: mueble.sucursalId,
      usuarioId: access.user.id,
      accion: "plano.mobiliario_estado",
      entidad: "mobiliario",
      entidadId: mueble.id,
      detalle: { nombre: mueble.nombre, estado: input.estado },
    });
    revalidatePath("/admin/plano");
    return { success: true };
  } catch (error) {
    console.error("cambiarEstadoMobiliario", error);
    return { success: false, error: "No se pudo actualizar el mueble." };
  }
}

/** Quita/reactiva un mueble del plano (baja lógica con `activo`). */
export async function desactivarMobiliario(formData: FormData): Promise<ToggleActivoResult> {
  const parsed = z
    .object({
      organizacionId: z.string().uuid(),
      id: z.string().uuid(),
      activar: z.coerce.boolean(),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Datos inválidos." };
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return { error: "No tienes permiso para editar el plano de la sucursal." };
  const db = getDatabase();
  const [mueble] = await db
    .select({ id: mobiliario.id, sucursalId: mobiliario.sucursalId, nombre: mobiliario.nombre })
    .from(mobiliario)
    .where(and(eq(mobiliario.id, input.id), eq(mobiliario.organizacionId, input.organizacionId)))
    .limit(1);
  if (!mueble) return { error: "El mueble no existe." };
  if (!(await assertBranchScope(access, mueble.sucursalId))) {
    return { error: "No tienes acceso a esta sucursal." };
  }
  try {
    await db
      .update(mobiliario)
      .set({ activo: input.activar, updatedBy: access.user.id })
      .where(eq(mobiliario.id, mueble.id));
    await registrarAuditoria({
      organizacionId: input.organizacionId,
      sucursalId: mueble.sucursalId,
      usuarioId: access.user.id,
      accion: input.activar ? "plano.mobiliario_reactivado" : "plano.mobiliario_desactivado",
      entidad: "mobiliario",
      entidadId: mueble.id,
      detalle: { nombre: mueble.nombre },
    });
    revalidatePath("/admin/plano");
    return { success: true };
  } catch (error) {
    console.error("desactivarMobiliario", error);
    return { error: "No se pudo actualizar el mueble." };
  }
}

/* ------------------------------------------------------------------ */
/* Cantidades por ubicación (informativas; no tocan inventario_stock)   */
/* ------------------------------------------------------------------ */

const cantidadSchema = z.object({
  organizacionId: z.string().uuid(),
  ubicacionId: z.string().uuid(),
  productoId: z.string().uuid(),
  cantidad: z.coerce.number().min(0, "La cantidad no puede ser negativa."),
});

/**
 * Fija cuánto stock de un producto se guarda en una ubicación (informativo).
 * `cantidad = 0` borra la fila. Nunca toca `inventario_stock`: las ventas
 * siguen descontando del stock de la sucursal como siempre.
 */
export async function fijarCantidadUbicacion(formData: FormData): Promise<PlanoMutationResult> {
  const parsed = cantidadSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const input = parsed.data;
  const access = await checkPermission(input.organizacionId, "inventario.editar");
  if (!access) return { success: false, error: "No tienes permiso para editar el inventario." };
  const db = getDatabase();
  const [ubicacion] = await db
    .select({ id: ubicaciones.id, sucursalId: ubicaciones.sucursalId })
    .from(ubicaciones)
    .where(
      and(
        eq(ubicaciones.id, input.ubicacionId),
        eq(ubicaciones.organizacionId, input.organizacionId),
        eq(ubicaciones.activo, true),
      ),
    )
    .limit(1);
  if (!ubicacion) return { success: false, error: "La ubicación no existe o está inactiva." };
  if (!(await assertBranchScope(access, ubicacion.sucursalId))) {
    return { success: false, error: "No tienes acceso a esta sucursal." };
  }
  try {
    if (input.cantidad === 0) {
      await db
        .delete(inventarioUbicaciones)
        .where(
          and(
            eq(inventarioUbicaciones.ubicacionId, input.ubicacionId),
            eq(inventarioUbicaciones.productoId, input.productoId),
          ),
        );
    } else {
      await db
        .insert(inventarioUbicaciones)
        .values({
          organizacionId: input.organizacionId,
          ubicacionId: input.ubicacionId,
          productoId: input.productoId,
          cantidad: input.cantidad.toFixed(3),
          createdBy: access.user.id,
        })
        .onConflictDoUpdate({
          target: [inventarioUbicaciones.ubicacionId, inventarioUbicaciones.productoId],
          set: { cantidad: input.cantidad.toFixed(3), updatedBy: access.user.id },
        });
    }
    await registrarAuditoria({
      organizacionId: input.organizacionId,
      sucursalId: ubicacion.sucursalId,
      usuarioId: access.user.id,
      accion: "plano.cantidad_ubicada",
      entidad: "ubicacion",
      entidadId: input.ubicacionId,
      detalle: { productoId: input.productoId, cantidad: input.cantidad },
    });
    revalidatePath("/admin/plano");
    revalidatePath("/admin/inventario");
    return { success: true };
  } catch (error) {
    console.error("fijarCantidadUbicacion", error);
    return { success: false, error: "No se pudo guardar la cantidad. Intenta de nuevo." };
  }
}
