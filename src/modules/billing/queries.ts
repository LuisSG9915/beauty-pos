import { and, count, desc, eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres";

import { getDatabase } from "@/db/client";
import { invitacionesUsuarios } from "@/db/schema/access";
import { planes, suscripciones } from "@/db/schema/billing";
import { miembrosOrganizaciones, sucursales } from "@/db/schema/core";
import { CAPACIDADES, type CapacidadClave } from "./capacidades";
import { estadoEfectivoSuscripcion, type EstadoEfectivo } from "./rules";

type Schema = typeof import("@/db/schema");

/** Conexión usable dentro o fuera de una transacción. */
export type BillingDb =
  | NodePgDatabase<Schema>
  | NodePgTransaction<Schema, ExtractTablesWithRelations<Schema>>;

export type SuscripcionActual = {
  id: string;
  planId: string;
  planClave: string | null;
  planNombre: string | null;
  estado: string;
  trialTerminaAt: Date | null;
  periodoTerminaAt: Date | null;
  periodicidad: string;
  sucursalesFacturadas: number;
  canceladaAt: Date | null;
  motivoCancelacion: string | null;
  /** null cuando el plan referenciado ya no existe (leftJoin). */
  capacidades: string[] | null;
  maxSucursales: number | null;
  maxUsuarios: number | null;
};

/** Suscripción más reciente de la organización (la vigente por índice parcial). */
export async function getSuscripcionActual(
  organizacionId: string,
  db: BillingDb = getDatabase(),
): Promise<SuscripcionActual | null> {
  const [row] = await db
    .select({
      id: suscripciones.id,
      planId: suscripciones.planId,
      planClave: planes.clave,
      planNombre: planes.nombre,
      estado: suscripciones.estado,
      trialTerminaAt: suscripciones.trialTerminaAt,
      periodoTerminaAt: suscripciones.periodoTerminaAt,
      periodicidad: suscripciones.periodicidad,
      sucursalesFacturadas: suscripciones.sucursalesFacturadas,
      canceladaAt: suscripciones.canceladaAt,
      motivoCancelacion: suscripciones.motivoCancelacion,
      capacidades: planes.capacidades,
      maxSucursales: planes.maxSucursales,
      maxUsuarios: planes.maxUsuarios,
    })
    .from(suscripciones)
    .leftJoin(planes, eq(suscripciones.planId, planes.id))
    .where(eq(suscripciones.organizacionId, organizacionId))
    .orderBy(desc(suscripciones.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * `true` cuando la organización puede operar: sin suscripción se considera
 * vigente (organizaciones históricas/manuales no se bloquean retroactivamente)
 * y con suscripción se evalúa su estado efectivo en `ahora`.
 */
export async function suscripcionVigente(
  organizacionId: string,
  db: BillingDb = getDatabase(),
  ahora: Date = new Date(),
): Promise<boolean> {
  const suscripcion = await getSuscripcionActual(organizacionId, db);
  return estadoEfectivoSuscripcion(suscripcion, ahora) === "vigente";
}

export async function getPlanPorClave(clave: string) {
  const db = getDatabase();
  const [row] = await db.select().from(planes).where(eq(planes.clave, clave)).limit(1);
  return row ?? null;
}

/** Planes activos del catálogo para el portal de precios y la suscripción. */
export async function getPlanesActivos() {
  const db = getDatabase();
  return db
    .select()
    .from(planes)
    .where(eq(planes.activo, true))
    .orderBy(planes.orden, planes.precioMensual);
}

/**
 * Contexto de suscripción de la organización: estado efectivo, plan y
 * capacidades resueltas. Sin suscripción (organizaciones históricas) se
 * considera vigente con todas las capacidades — no se bloquea nada
 * retroactivamente.
 */
export type ContextoSuscripcion = {
  efectivo: EstadoEfectivo;
  plan: {
    clave: string | null;
    nombre: string | null;
    maxSucursales: number | null;
    maxUsuarios: number | null;
  } | null;
  capacidades: ReadonlySet<string>;
};

export async function contextoSuscripcion(
  organizacionId: string,
  db: BillingDb = getDatabase(),
  ahora: Date = new Date(),
): Promise<ContextoSuscripcion> {
  const suscripcion = await getSuscripcionActual(organizacionId, db);
  if (!suscripcion) {
    return {
      efectivo: "vigente",
      plan: null,
      capacidades: new Set<string>(Object.keys(CAPACIDADES)),
    };
  }
  return {
    efectivo: estadoEfectivoSuscripcion(suscripcion, ahora),
    plan: {
      clave: suscripcion.planClave,
      nombre: suscripcion.planNombre,
      maxSucursales: suscripcion.maxSucursales,
      maxUsuarios: suscripcion.maxUsuarios,
    },
    capacidades: new Set(suscripcion.capacidades ?? []),
  };
}

/**
 * `true` cuando el plan vigente incluye la capacidad. Una suscripción vencida
 * no tiene capacidades; sin suscripción todo está permitido.
 */
export function tieneCapacidad(ctx: ContextoSuscripcion, capacidad: CapacidadClave): boolean {
  return ctx.efectivo === "vigente" && ctx.capacidades.has(capacidad);
}

/** Conveniencia: resuelve el contexto y evalúa una capacidad en una sola llamada. */
export async function tieneCapacidadOrganizacion(
  organizacionId: string,
  capacidad: CapacidadClave,
  db: BillingDb = getDatabase(),
): Promise<boolean> {
  const ctx = await contextoSuscripcion(organizacionId, db);
  return tieneCapacidad(ctx, capacidad);
}

/**
 * Mensaje de error cuando la organización no puede usar la capacidad
 * (suscripción vencida o plan sin ella); `null` cuando sí puede. Las server
 * actions lo mapean a `actionError`.
 */
export async function requiereCapacidad(
  organizacionId: string,
  capacidad: CapacidadClave,
  db: BillingDb = getDatabase(),
): Promise<string | null> {
  const ctx = await contextoSuscripcion(organizacionId, db);
  if (ctx.efectivo !== "vigente") {
    return "Tu suscripción no está vigente. Reactiva tu plan para continuar.";
  }
  if (!ctx.capacidades.has(capacidad)) {
    const nombre = CAPACIDADES[capacidad].nombre;
    const plan = ctx.plan?.nombre ?? "tu plan actual";
    return `${nombre} no está incluida en ${plan}. Cambia de plan para usarla.`;
  }
  return null;
}

/**
 * Valida el límite de usuarios del plan: miembros activos + invitaciones
 * pendientes + `adicionales` no pueden exceder `max_usuarios`.
 * Debe llamarse con la fila de la organización bloqueada (`FOR UPDATE`)
 * dentro de la transacción para serializar invitaciones concurrentes.
 * Sin suscripción el plan es null → sin límite.
 */
export async function validarLimiteUsuarios(
  organizacionId: string,
  db: BillingDb,
  adicionales = 1,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await contextoSuscripcion(organizacionId, db);
  if (ctx.efectivo !== "vigente") {
    return { ok: false, error: "Tu suscripción no está vigente. Reactiva tu plan para invitar miembros." };
  }
  const limite = ctx.plan?.maxUsuarios;
  if (limite == null) return { ok: true };

  const [[{ miembros }], [{ pendientes }]] = await Promise.all([
    db
      .select({ miembros: count() })
      .from(miembrosOrganizaciones)
      .where(
        and(
          eq(miembrosOrganizaciones.organizacionId, organizacionId),
          eq(miembrosOrganizaciones.estado, "activo"),
        ),
      ),
    db
      .select({ pendientes: count() })
      .from(invitacionesUsuarios)
      .where(
        and(
          eq(invitacionesUsuarios.organizacionId, organizacionId),
          eq(invitacionesUsuarios.estado, "pendiente"),
        ),
      ),
  ]);
  const ocupados = miembros + pendientes;
  if (ocupados + adicionales > limite) {
    return {
      ok: false,
      error: `Tu plan permite hasta ${limite} usuario(s). Ahora tienes ${ocupados} entre miembros activos e invitaciones pendientes.`,
    };
  }
  return { ok: true };
}

/**
 * Valida el límite de sucursales del plan: requiere la capacidad
 * `multisucursal` y que las sucursales activas + `adicionales` no excedan
 * `max_sucursales`. Debe llamarse con la fila de la organización bloqueada
 * (`FOR UPDATE`) dentro de la transacción para serializar altas
 * concurrentes. Sin suscripción el plan es null → sin límite.
 */
export async function validarLimiteSucursales(
  organizacionId: string,
  db: BillingDb,
  adicionales = 1,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await contextoSuscripcion(organizacionId, db);
  if (ctx.efectivo !== "vigente") {
    return { ok: false, error: "Tu suscripción no está vigente. Reactiva tu plan para agregar sucursales." };
  }

  const [{ activas }] = await db
    .select({ activas: count() })
    .from(sucursales)
    .where(and(eq(sucursales.organizacionId, organizacionId), eq(sucursales.activo, true)));

  // La primera sucursal nunca exige multisucursal: sin sucursal activa no hay
  // operación. La capacidad aplica de la 2ª en adelante.
  if (activas >= 1 && !ctx.capacidades.has("multisucursal")) {
    return { ok: false, error: "Tu plan actual permite una sola sucursal. Cambia a un plan con multisucursal para agregar otra." };
  }
  const limite = ctx.plan?.maxSucursales;
  if (limite == null) return { ok: true };

  if (activas + adicionales > limite) {
    return {
      ok: false,
      error: `Tu plan permite hasta ${limite} sucursal(es) activa(s) y ya tienes ${activas}.`,
    };
  }
  return { ok: true };
}
