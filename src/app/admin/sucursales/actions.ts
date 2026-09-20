"use server";

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { miembrosOrganizaciones, relUsuariosSucursales, sucursales, usuarios } from "@/db/schema/core";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { checkPermission } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import { isValidTimeZone } from "@/modules/agenda/timezone";
import { getSuscripcionActual, validarLimiteSucursales, type BillingDb } from "@/modules/billing/queries";

const sucursalSchema = z.object({
  organizacionId: z.string().uuid(),
  nombre: z.string().trim().min(2).max(160),
  clave: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/i, "La clave solo admite letras, números y guiones."),
  direccion: z.string().trim().max(300).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  correo: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),
  zonaHoraria: z.string().trim().max(80),
});

function limpiar(input: z.infer<typeof sucursalSchema>) {
  return {
    nombre: input.nombre,
    clave: input.clave.toLowerCase(),
    direccion: input.direccion || null,
    telefono: input.telefono || null,
    correo: input.correo || null,
    zonaHoraria: input.zonaHoraria,
  };
}

/**
 * Sucursales activas + `adicionales` no pueden exceder las sucursales
 * facturadas de la suscripción vigente: la suscripción cobra por sucursal,
 * activar de más sin ampliar la cobertura sería facturación incorrecta.
 * Sin suscripción → sin tope facturado.
 */
async function validarCoberturaFacturada(
  organizacionId: string,
  db: BillingDb,
  adicionales = 1,
): Promise<{ ok: boolean; error?: string }> {
  const suscripcion = await getSuscripcionActual(organizacionId, db);
  if (!suscripcion) return { ok: true };
  const cubiertas = suscripcion.sucursalesFacturadas ?? 1;
  const [{ activas }] = await db
    .select({ activas: count() })
    .from(sucursales)
    .where(and(eq(sucursales.organizacionId, organizacionId), eq(sucursales.activo, true)));
  if (activas + adicionales > cubiertas) {
    return {
      ok: false,
      error: `Tu suscripción cubre ${cubiertas} sucursal(es) activa(s) y ya usas ${activas}. Amplía la cobertura desde Suscripción antes de activar otra.`,
    };
  }
  return { ok: true };
}

/** Alta de sucursal (`sucursales.editar` + límite de plan + cobertura). */
export async function crearSucursalAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(sucursalSchema, Object.fromEntries(formData.entries()), "Revisa los datos de la sucursal.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return actionError("No tienes permiso para gestionar sucursales.");
  const { user } = access;
  if (!isValidTimeZone(input.zonaHoraria)) return actionError("La zona horaria no es válida.");

  const db = getDatabase();
  try {
    await db.transaction(async (tx) => {
      // Serializa altas concurrentes: la validación y el insert ven el mismo
      // número de sucursales activas.
      await tx.execute(sql`select id from organizaciones where id = ${input.organizacionId} for update`);
      const limite = await validarLimiteSucursales(input.organizacionId, tx);
      if (!limite.ok) throw new Error(limite.error);
      const cobertura = await validarCoberturaFacturada(input.organizacionId, tx);
      if (!cobertura.ok) throw new Error(cobertura.error);

      const [creada] = await tx
        .insert(sucursales)
        .values({ organizacionId: input.organizacionId, ...limpiar(input), createdBy: user.id })
        .returning({ id: sucursales.id });

      // Si el creador tiene alcance restringido (asignaciones explícitas),
      // se auto-asigna a la nueva sucursal para poder operarla de inmediato.
      // Sin restricción (`branchIds === null`) no se inserta nada: ya ve todas.
      if (access.branchIds !== null) {
        await tx
          .insert(relUsuariosSucursales)
          .values({ organizacionId: input.organizacionId, usuarioId: user.id, sucursalId: creada.id, createdBy: user.id })
          .onConflictDoNothing();
      }

      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: creada.id,
        usuarioId: user.id,
        accion: "sucursal.creada",
        entidad: "sucursal",
        entidadId: creada.id,
        detalle: { nombre: input.nombre, clave: input.clave },
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la sucursal.";
    if (message.includes("sucursales_organizacion_clave_uq")) {
      return actionError("Ya existe una sucursal con esa clave.");
    }
    return actionError(message);
  }

  revalidatePath("/admin/sucursales");
  revalidateCatalogos(input.organizacionId);
  return actionSuccess("Sucursal creada.");
}

const editSchema = sucursalSchema.extend({
  sucursalId: z.string().uuid(),
  capacidadSinAsignar: z.coerce.number().int().min(1).max(20),
  exigirCorteParaCobrar: z.coerce.boolean(),
  reservasOnline: z.coerce.boolean(),
  reservasAutoConfirmar: z.coerce.boolean(),
  reservasCancelacionHoras: z.coerce.number().int().min(0).max(720),
  reservasAnticipacionMinutos: z.coerce.number().int().min(0).max(43200),
  reservasHorizonteDias: z.coerce.number().int().min(1).max(365),
});

/** Edición de datos y políticas de la sucursal (`sucursales.editar`). */
export async function actualizarSucursalAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = parseWithSchema(
    editSchema,
    {
      ...raw,
      exigirCorteParaCobrar: raw.exigirCorteParaCobrar === "on" || raw.exigirCorteParaCobrar === "true",
      reservasOnline: raw.reservasOnline === "on" || raw.reservasOnline === "true",
      reservasAutoConfirmar: raw.reservasAutoConfirmar === "on" || raw.reservasAutoConfirmar === "true",
    },
    "Revisa los datos de la sucursal.",
  );
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return actionError("No tienes permiso para gestionar sucursales.");
  const { user } = access;
  if (!isValidTimeZone(input.zonaHoraria)) return actionError("La zona horaria no es válida.");

  const db = getDatabase();
  const [actualizada] = await db
    .update(sucursales)
    .set({
      ...limpiar(input),
      capacidadSinAsignar: input.capacidadSinAsignar,
      exigirCorteParaCobrar: input.exigirCorteParaCobrar,
      reservasOnline: input.reservasOnline,
      reservasAutoConfirmar: input.reservasAutoConfirmar,
      reservasCancelacionHoras: input.reservasCancelacionHoras,
      reservasAnticipacionMinutos: input.reservasAnticipacionMinutos,
      reservasHorizonteDias: input.reservasHorizonteDias,
      updatedBy: user.id,
    })
    .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId)))
    .returning({ id: sucursales.id });
  if (!actualizada) return actionError("La sucursal no pertenece a la organización.");

  await auditEvent(db, {
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    usuarioId: user.id,
    accion: "sucursal.actualizada",
    entidad: "sucursal",
    entidadId: input.sucursalId,
    detalle: { nombre: input.nombre },
  });
  revalidatePath("/admin/sucursales");
  revalidateCatalogos(input.organizacionId);
  return actionSuccess("Sucursal actualizada.");
}

const toggleSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  // OJO: z.coerce.boolean() convierte "false" → true (string no vacío).
  activo: z.enum(["true", "false"]).transform((v) => v === "true"),
});

/**
 * Activa/desactiva una sucursal. Desactivar jamás borra historia — solo sale
 * de los selectores operativos. Activar valida el plan (capacidad
 * `multisucursal`, `max_sucursales`) y la cobertura facturada.
 */
export async function toggleSucursalAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(toggleSchema, {
    organizacionId: formData.get("organizacionId"),
    sucursalId: formData.get("sucursalId"),
    activo: formData.get("activo"),
  });
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return actionError("No tienes permiso para gestionar sucursales.");
  const { user } = access;

  const db = getDatabase();
  const [sucursal] = await db
    .select({ id: sucursales.id, activo: sucursales.activo, nombre: sucursales.nombre })
    .from(sucursales)
    .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId)))
    .limit(1);
  if (!sucursal) return actionError("La sucursal no pertenece a la organización.");
  if (sucursal.activo === input.activo) {
    return actionSuccess(input.activo ? "La sucursal ya estaba activa." : "La sucursal ya estaba inactiva.");
  }

  if (input.activo) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select id from organizaciones where id = ${input.organizacionId} for update`);
        const limite = await validarLimiteSucursales(input.organizacionId, tx);
        if (!limite.ok) throw new Error(limite.error);
        const cobertura = await validarCoberturaFacturada(input.organizacionId, tx);
        if (!cobertura.ok) throw new Error(cobertura.error);
      });
    } catch (error) {
      return actionError(error instanceof Error ? error.message : "No se pudo activar la sucursal.");
    }
  } else {
    // No permitir desactivar la última sucursal activa: dejaría la operación
    // sin contexto (la agenda y el POS exigen una sucursal).
    const [{ activas }] = await db
      .select({ activas: count() })
      .from(sucursales)
      .where(and(eq(sucursales.organizacionId, input.organizacionId), eq(sucursales.activo, true)));
    if (activas <= 1) {
      return actionError("No puedes desactivar la única sucursal activa del negocio.");
    }
  }

  await db
    .update(sucursales)
    .set({ activo: input.activo, updatedBy: user.id })
    .where(eq(sucursales.id, input.sucursalId));
  await auditEvent(db, {
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    usuarioId: user.id,
    accion: input.activo ? "sucursal.activada" : "sucursal.desactivada",
    entidad: "sucursal",
    entidadId: input.sucursalId,
    detalle: { nombre: sucursal.nombre },
  });
  revalidatePath("/admin/sucursales");
  revalidateCatalogos(input.organizacionId);
  return actionSuccess(input.activo ? "Sucursal activada." : "Sucursal desactivada. Su historial se conserva.");
}

const asignacionSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  usuarioIds: z.array(z.string().uuid()).max(200),
});

/**
 * Define qué miembros ven la sucursal (`sucursales.editar` + alcance propio).
 * OJO con la semántica del acceso: un miembro SIN asignaciones ve TODAS las
 * sucursales — quitar la última asignación amplía su alcance, no lo reduce.
 */
export async function setSucursalUsuariosAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const usuarioIds = [...new Set(formData.getAll("usuarioIds").map(String).filter(Boolean))];
  const parsed = parseWithSchema(asignacionSchema, {
    organizacionId: formData.get("organizacionId"),
    sucursalId: formData.get("sucursalId"),
    usuarioIds,
  });
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return actionError("No tienes permiso para gestionar sucursales.");

  const db = getDatabase();
  try {
    await db.transaction(async (tx) => {
      const [sucursal] = await tx
        .select({ id: sucursales.id })
        .from(sucursales)
        .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId)))
        .limit(1);
      if (!sucursal) throw new Error("La sucursal no pertenece a la organización.");

      // Solo miembros activos de la organización pueden asignarse.
      if (input.usuarioIds.length > 0) {
        const validos = await tx
          .select({ usuarioId: miembrosOrganizaciones.usuarioId })
          .from(miembrosOrganizaciones)
          .innerJoin(usuarios, eq(miembrosOrganizaciones.usuarioId, usuarios.id))
          .where(
            and(
              inArray(miembrosOrganizaciones.usuarioId, input.usuarioIds),
              eq(miembrosOrganizaciones.organizacionId, input.organizacionId),
              eq(miembrosOrganizaciones.estado, "activo"),
            ),
          );
        if (validos.length !== input.usuarioIds.length) {
          throw new Error("Uno o más usuarios no son miembros activos.");
        }
      }

      await tx
        .delete(relUsuariosSucursales)
        .where(
          and(
            eq(relUsuariosSucursales.organizacionId, input.organizacionId),
            eq(relUsuariosSucursales.sucursalId, input.sucursalId),
          ),
        );
      if (input.usuarioIds.length > 0) {
        await tx.insert(relUsuariosSucursales).values(
          input.usuarioIds.map((usuarioId) => ({
            organizacionId: input.organizacionId,
            usuarioId,
            sucursalId: input.sucursalId,
            createdBy: access.user.id,
          })),
        );
      }
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: input.sucursalId,
        usuarioId: access.user.id,
        accion: "sucursal.usuarios",
        entidad: "sucursal",
        entidadId: input.sucursalId,
        detalle: { usuarioIds: input.usuarioIds },
      });
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "No se pudo actualizar la asignación.");
  }

  revalidatePath("/admin/sucursales");
  revalidateCatalogos(input.organizacionId);
  return actionSuccess("Asignación actualizada.");
}
