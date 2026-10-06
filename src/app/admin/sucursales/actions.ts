"use server";

import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { miembrosOrganizaciones, relUsuariosSucursales, sucursales, usuarios } from "@/db/schema/core";
import { horariosSucursales } from "@/db/schema/operations";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import type { ToggleActivoResult } from "@/components/admin/toggle-activo";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { canAccessBranch, checkPermission, resolveAccessSafe } from "@/lib/auth/authorization";
import { revalidateCatalogos } from "@/lib/catalogo-cache";
import { claveDisponible } from "@/lib/clave";
import { escribirNombreSucursalOmitida } from "@/lib/sucursal-cookie";
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
    .regex(/^[a-z0-9-]+$/i, "La clave solo admite letras, números y guiones.")
    .optional()
    .or(z.literal("")),
  direccion: z.string().trim().max(300).optional().or(z.literal("")),
  telefono: z.string().trim().max(30).optional().or(z.literal("")),
  correo: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),
  zonaHoraria: z.string().trim().max(80),
});

function limpiar(input: z.infer<typeof sucursalSchema>) {
  return {
    nombre: input.nombre,
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

      // La clave llega explícita (opcional) o se genera del nombre; el
      // FOR UPDATE de arriba serializa la generación entre altas y el
      // único (org, clave) cubre también filas inactivas.
      const claveManual = input.clave ? input.clave.toLowerCase() : undefined;
      let clave: string;
      if (claveManual) {
        const [duplicada] = await tx
          .select({ id: sucursales.id })
          .from(sucursales)
          .where(
            and(
              eq(sucursales.organizacionId, input.organizacionId),
              eq(sql`lower(${sucursales.clave})`, claveManual),
            ),
          )
          .limit(1);
        if (duplicada) throw new Error("Ya existe una sucursal con esa clave.");
        clave = claveManual;
      } else {
        clave = await claveDisponible(tx, sucursales, input.organizacionId, input.nombre, 40);
      }

      const [creada] = await tx
        .insert(sucursales)
        .values({ organizacionId: input.organizacionId, ...limpiar(input), clave, createdBy: user.id })
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

      // Una sucursal sin horarios no admite citas y el error solo aparecía al
      // agendar. Se copian los turnos activos de la sucursal más antigua; si
      // no hay referencia, un horario base L–S 9:00–19:00.
      const [referencia] = await tx
        .select({ id: sucursales.id })
        .from(sucursales)
        .where(
          and(
            eq(sucursales.organizacionId, input.organizacionId),
            eq(sucursales.activo, true),
            ne(sucursales.id, creada.id),
          ),
        )
        .orderBy(asc(sucursales.createdAt))
        .limit(1);
      const turnos = referencia
        ? await tx
            .select({
              diaSemana: horariosSucursales.diaSemana,
              iniciaMinutos: horariosSucursales.iniciaMinutos,
              terminaMinutos: horariosSucursales.terminaMinutos,
            })
            .from(horariosSucursales)
            .where(and(eq(horariosSucursales.sucursalId, referencia.id), eq(horariosSucursales.activo, true)))
        : [];
      const semilla =
        turnos.length > 0
          ? turnos
          : [1, 2, 3, 4, 5, 6].map((diaSemana) => ({ diaSemana, iniciaMinutos: 540, terminaMinutos: 1140 }));
      await tx.insert(horariosSucursales).values(
        semilla.map((turno) => ({
          organizacionId: input.organizacionId,
          sucursalId: creada.id,
          ...turno,
          createdBy: user.id,
        })),
      );

      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        sucursalId: creada.id,
        usuarioId: user.id,
        accion: "sucursal.creada",
        entidad: "sucursal",
        entidadId: creada.id,
        detalle: { nombre: input.nombre, clave },
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
  // Clave opcional en edición: vacía conserva la actual; explícita se
  // verifica contra el único (org, clave), que no filtra por activo.
  const claveManual = input.clave ? input.clave.toLowerCase() : undefined;
  if (claveManual) {
    const [duplicada] = await db
      .select({ id: sucursales.id })
      .from(sucursales)
      .where(
        and(
          eq(sucursales.organizacionId, input.organizacionId),
          eq(sql`lower(${sucursales.clave})`, claveManual),
          ne(sucursales.id, input.sucursalId),
        ),
      )
      .limit(1);
    if (duplicada) return actionError("Ya existe una sucursal con esa clave.");
  }

  const [actualizada] = await db
    .update(sucursales)
    .set({
      ...limpiar(input),
      ...(claveManual ? { clave: claveManual } : {}),
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
  if (!actualizada) return actionError("La sucursal no pertenece al negocio.");

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

const estadoSucursalSchema = z.object({
  organizacionId: z.string().uuid(),
  id: z.string().uuid(),
  activar: z.enum(["true", "false"]),
  confirmado: z.string().optional(),
});

/**
 * Activa/desactiva una sucursal — firma directa para `ToggleActivo`
 * (`organizacionId` + `id` + `activar`), que ya ofrece "Deshacer" en el
 * toast de baja. Desactivar jamás borra historia — solo sale de los
 * selectores operativos. Activar valida el plan (capacidad `multisucursal`,
 * `max_sucursales`) y la cobertura facturada.
 */
export async function setSucursalActivaAction(formData: FormData): Promise<ToggleActivoResult> {
  const parsed = estadoSucursalSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Solicitud inválida." };
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return { error: "No tienes permiso para gestionar sucursales." };
  const { user } = access;
  const activar = input.activar === "true";

  const db = getDatabase();
  const [sucursal] = await db
    .select({ id: sucursales.id, activo: sucursales.activo, nombre: sucursales.nombre })
    .from(sucursales)
    .where(and(eq(sucursales.id, input.id), eq(sucursales.organizacionId, input.organizacionId)))
    .limit(1);
  if (!sucursal) return { error: "La sucursal no pertenece al negocio." };
  if (sucursal.activo === activar) return { success: true };

  if (activar) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select id from organizaciones where id = ${input.organizacionId} for update`);
        const limite = await validarLimiteSucursales(input.organizacionId, tx);
        if (!limite.ok) throw new Error(limite.error);
        const cobertura = await validarCoberturaFacturada(input.organizacionId, tx);
        if (!cobertura.ok) throw new Error(cobertura.error);
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "No se pudo activar la sucursal." };
    }
  } else {
    // No permitir desactivar la última sucursal activa: dejaría la operación
    // sin contexto (la agenda y el POS exigen una sucursal).
    const [{ activas }] = await db
      .select({ activas: count() })
      .from(sucursales)
      .where(and(eq(sucursales.organizacionId, input.organizacionId), eq(sucursales.activo, true)));
    if (activas <= 1) {
      return { error: "No puedes desactivar la única sucursal activa del negocio." };
    }
  }

  await db
    .update(sucursales)
    .set({ activo: activar, updatedBy: user.id })
    .where(eq(sucursales.id, input.id));
  await auditEvent(db, {
    organizacionId: input.organizacionId,
    sucursalId: input.id,
    usuarioId: user.id,
    accion: activar ? "sucursal.activada" : "sucursal.desactivada",
    entidad: "sucursal",
    entidadId: input.id,
    detalle: { nombre: sucursal.nombre },
  });
  revalidatePath("/admin/sucursales");
  revalidateCatalogos(input.organizacionId);
  return { success: true };
}

const renombrarSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  nombre: z.string().trim().min(2, "Escribe el nombre de la sucursal.").max(160),
});

/**
 * Renombra solo el nombre visible de la sucursal (`sucursales.editar`). Lo
 * usa la tarjeta "¿Cómo se llama tu salón?" del inicio para que el nombre
 * genérico "Sucursal principal" se cambie en un paso.
 */
export async function renombrarSucursalAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(renombrarSchema, {
    organizacionId: formData.get("organizacionId"),
    sucursalId: formData.get("sucursalId"),
    nombre: formData.get("nombre"),
  });
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return actionError("No tienes permiso para gestionar sucursales.");

  const db = getDatabase();
  const [actualizada] = await db
    .update(sucursales)
    .set({ nombre: input.nombre, updatedBy: access.user.id })
    .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId)))
    .returning({ id: sucursales.id });
  if (!actualizada) return actionError("La sucursal no pertenece al negocio.");

  await auditEvent(db, {
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    usuarioId: access.user.id,
    accion: "sucursal.renombrada",
    entidad: "sucursal",
    entidadId: input.sucursalId,
    detalle: { nombre: input.nombre },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/sucursales");
  revalidateCatalogos(input.organizacionId);
  return actionSuccess("Nombre guardado.");
}

const omitirNombreSchema = z.object({
  organizacionId: z.string().uuid(),
  sucursalId: z.string().uuid(),
});

/**
 * Descarta la tarjeta "¿Cómo se llama tu salón?" sin renombrar: escribe la
 * cookie de descarte para que el inicio no la vuelva a mostrar. Basta ser
 * miembro activo de la organización; no toca datos.
 */
export async function omitirNombreSucursalAction(formData: FormData): Promise<void> {
  const parsed = omitirNombreSchema.safeParse({
    organizacionId: formData.get("organizacionId"),
    sucursalId: formData.get("sucursalId"),
  });
  if (!parsed.success) return;
  const input = parsed.data;

  const { user } = await requireAuthenticatedUser();
  const access = await resolveAccessSafe(input.organizacionId, user);
  if (!access) return;
  // La sucursal debe existir en la organización para que el descarte
  // corresponda a una tarjeta real.
  const db = getDatabase();
  const [existe] = await db
    .select({ id: sucursales.id })
    .from(sucursales)
    .where(and(eq(sucursales.id, input.sucursalId), eq(sucursales.organizacionId, input.organizacionId)))
    .limit(1);
  if (!existe) return;

  await escribirNombreSucursalOmitida(input.sucursalId);
  revalidatePath("/admin");
}

const usuarioSucursalesSchema = z.object({
  organizacionId: z.string().uuid(),
  usuarioId: z.string().uuid(),
  sucursalIds: z.array(z.string().uuid()).max(50),
});

/**
 * Reemplaza las sucursales asignadas a UN miembro (`sucursales.editar` +
 * alcance propio). Es la acción compartida del control "Todas las
 * sucursales": se usa igual en la ficha de la persona (Equipo) y en la
 * tarjeta de la sucursal.
 *
 * OJO con la semántica del acceso: un miembro SIN asignaciones ve TODAS las
 * sucursales — una lista vacía amplía su alcance, no lo reduce. Solo se
 * borran las asignaciones dentro del alcance del editor; las sucursales
 * fuera de su alcance se conservan (no puede revocarlas ni verlas).
 */
export async function setUsuarioSucursalesAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sucursalIds = [...new Set(formData.getAll("sucursalIds").map(String).filter(Boolean))];
  const parsed = parseWithSchema(usuarioSucursalesSchema, {
    organizacionId: formData.get("organizacionId"),
    usuarioId: formData.get("usuarioId"),
    sucursalIds,
  });
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "sucursales.editar");
  if (!access) return actionError("No tienes permiso para gestionar sucursales.");
  if (input.usuarioId === access.user.id) {
    return actionError("No puedes modificar tus propias sucursales.");
  }

  const db = getDatabase();
  try {
    await db.transaction(async (tx) => {
      // Solo miembros activos del negocio pueden recibir asignaciones.
      const [miembro] = await tx
        .select({ usuarioId: miembrosOrganizaciones.usuarioId })
        .from(miembrosOrganizaciones)
        .innerJoin(usuarios, eq(miembrosOrganizaciones.usuarioId, usuarios.id))
        .where(
          and(
            eq(miembrosOrganizaciones.organizacionId, input.organizacionId),
            eq(miembrosOrganizaciones.usuarioId, input.usuarioId),
            eq(miembrosOrganizaciones.estado, "activo"),
          ),
        )
        .limit(1);
      if (!miembro) throw new Error("El miembro no pertenece al negocio o está suspendido.");

      // Las sucursales elegidas deben estar activas y dentro del alcance
      // del editor (equivale a `assertBranchScope` por cada una).
      if (input.sucursalIds.length > 0) {
        const validas = await tx
          .select({ id: sucursales.id })
          .from(sucursales)
          .where(
            and(
              inArray(sucursales.id, input.sucursalIds),
              eq(sucursales.organizacionId, input.organizacionId),
              eq(sucursales.activo, true),
            ),
          );
        if (validas.length !== input.sucursalIds.length) {
          throw new Error("Una o más sucursales no son válidas.");
        }
        for (const sucursalId of input.sucursalIds) {
          if (!canAccessBranch(access, sucursalId)) {
            throw new Error("No puedes asignar sucursales fuera de tu alcance.");
          }
        }
      }

      // Alcance del editor: null = todas las sucursales; Set = solo esas. Se
      // borran únicamente las asignaciones que entran en su alcance.
      const borrables = access.branchIds === null ? null : [...access.branchIds];
      if (borrables === null || borrables.length > 0) {
        await tx
          .delete(relUsuariosSucursales)
          .where(
            and(
              eq(relUsuariosSucursales.organizacionId, input.organizacionId),
              eq(relUsuariosSucursales.usuarioId, input.usuarioId),
              ...(borrables ? [inArray(relUsuariosSucursales.sucursalId, borrables)] : []),
            ),
          );
      }
      if (input.sucursalIds.length > 0) {
        await tx.insert(relUsuariosSucursales).values(
          input.sucursalIds.map((sucursalId) => ({
            organizacionId: input.organizacionId,
            usuarioId: input.usuarioId,
            sucursalId,
            createdBy: access.user.id,
          })),
        );
      }
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        usuarioId: access.user.id,
        accion: "miembro.sucursales",
        entidad: "miembro",
        entidadId: input.usuarioId,
        detalle: { sucursalIds: input.sucursalIds },
      });
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "No se pudieron actualizar las sucursales.");
  }

  revalidatePath("/admin/sucursales");
  revalidatePath("/admin/usuarios");
  revalidateCatalogos(input.organizacionId);
  return actionSuccess("Sucursales actualizadas.");
}
