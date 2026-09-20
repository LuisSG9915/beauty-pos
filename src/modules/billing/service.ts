import { inArray, notInArray } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { catPermisos, catRoles, relMiembrosRoles, relRolesPermisos } from "@/db/schema/access";
import { billingEventos, planes, suscripciones } from "@/db/schema/billing";
import { catMediosPago } from "@/db/schema/catalogs";
import {
  miembrosOrganizaciones,
  organizaciones,
  relUsuariosSucursales,
  sucursales,
  usuarios,
} from "@/db/schema/core";
import { auditEvent } from "@/lib/audit";
import { defaultPermissions, defaultRoles } from "@/lib/auth/defaults";
import { PLANES_CATALOGO } from "./capacidades";

/** Medios de pago mínimos para que el POS funcione desde el primer día. */
const mediosPagoBase = [
  { clave: "EFECTIVO", nombre: "Efectivo", categoria: "efectivo" },
  { clave: "TARJETA", nombre: "Tarjeta", categoria: "tarjeta" },
  { clave: "TRANSFERENCIA", nombre: "Transferencia", categoria: "transferencia" },
] as const;

/** Plan con el que se experimenta el trial: el set de Crecimiento. */
export const PLAN_REGISTRO_CLAVE = "crecimiento";
export const TRIAL_DIAS = 14;

type Tx = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

/**
 * Sincroniza el catálogo de planes de lanzamiento en la tabla `planes`
 * (upsert por clave). Es idempotente: el mismo código alimenta el seed
 * (`pnpm plans:seed`) y este fallback del registro.
 */
export async function sincronizarCatalogoPlanes(tx: Tx) {
  for (const plan of PLANES_CATALOGO) {
    await tx
      .insert(planes)
      .values({
        clave: plan.clave,
        nombre: plan.nombre,
        descripcion: plan.descripcion,
        precioMensual: plan.precioMensual,
        precioAnual: plan.precioAnual,
        moneda: "MXN",
        trialDias: plan.trialDias,
        maxSucursales: plan.maxSucursales,
        maxUsuarios: plan.maxUsuarios,
        capacidades: [...plan.capacidades],
        recomendado: plan.recomendado,
        orden: plan.orden,
        activo: true,
      })
      .onConflictDoUpdate({
        target: planes.clave,
        set: {
          nombre: plan.nombre,
          descripcion: plan.descripcion,
          precioMensual: plan.precioMensual,
          precioAnual: plan.precioAnual,
          moneda: "MXN",
          trialDias: plan.trialDias,
          maxSucursales: plan.maxSucursales,
          maxUsuarios: plan.maxUsuarios,
          capacidades: [...plan.capacidades],
          recomendado: plan.recomendado,
          orden: plan.orden,
          activo: true,
        },
      });
  }

  // Planes históricos fuera del catálogo (p. ej. `pro` de $0) se despublican:
  // siguen existiendo para suscripciones vigentes, pero no se ofertan. Sus
  // suscriptores tenían acceso total antes de los entitlements, así que se
  // les conserva el set completo de capacidades para no romperlos.
  const capacidadesLegado = [...new Set(PLANES_CATALOGO.flatMap((p) => p.capacidades))];
  await tx
    .update(planes)
    .set({ activo: false, capacidades: capacidadesLegado })
    .where(notInArray(planes.clave, PLANES_CATALOGO.map((p) => p.clave)));
}

/** Plan del registro (Crecimiento); garantiza que el catálogo exista. */
async function ensurePlanRegistro(tx: Tx) {
  await sincronizarCatalogoPlanes(tx);
  const [plan] = await tx
    .select({ id: planes.id, trialDias: planes.trialDias })
    .from(planes)
    .where(inArray(planes.clave, [PLAN_REGISTRO_CLAVE]))
    .limit(1);
  if (!plan) throw new Error("No se pudo preparar el plan de registro.");
  return plan;
}

export type ProvisionResult =
  | { ok: true; organizacionId: string; sucursalId: string; usuarioId: string }
  | { ok: false; error: string };

/**
 * Provisión transaccional de una organización auto-registrada: sucursal
 * principal, catálogo de permisos, roles por defecto, propietario vinculado,
 * medios de pago base y suscripción en trial. Cualquier fallo revierte todo.
 */
export async function provisionarOrganizacionTrial(input: {
  nombreNegocio: string;
  slug: string;
  sucursalNombre: string;
  authUsuarioId: string;
  usuarioNombre: string;
  correo: string;
}): Promise<ProvisionResult> {
  const db = getDatabase();
  const trialTerminaAt = new Date(Date.now() + TRIAL_DIAS * 24 * 60 * 60 * 1000);

  try {
    return await db.transaction(async (tx) => {
      const plan = await ensurePlanRegistro(tx);

      const [organization] = await tx
        .insert(organizaciones)
        .values({ nombre: input.nombreNegocio, slug: input.slug })
        .returning({ id: organizaciones.id });
      if (!organization) throw new Error("No se pudo crear la organización.");

      const [branch] = await tx
        .insert(sucursales)
        .values({
          organizacionId: organization.id,
          nombre: input.sucursalNombre,
          clave: "PRINCIPAL",
        })
        .returning({ id: sucursales.id });
      if (!branch) throw new Error("No se pudo crear la sucursal.");

      await tx
        .insert(catPermisos)
        .values([...defaultPermissions])
        .onConflictDoNothing({ target: catPermisos.clave });

      const permissions = await tx
        .select({ id: catPermisos.id, clave: catPermisos.clave })
        .from(catPermisos)
        .where(inArray(catPermisos.clave, defaultPermissions.map((p) => p.clave)));
      const permissionIds = new Map(permissions.map((p) => [p.clave, p.id]));

      const roles = await tx
        .insert(catRoles)
        .values(
          defaultRoles.map((role) => ({
            organizacionId: organization.id,
            clave: role.clave,
            nombre: role.nombre,
            alcance: "organizacion",
            esSistema: true,
          })),
        )
        .returning({ id: catRoles.id, clave: catRoles.clave });

      const rolePermissionRows = roles.flatMap(
        (role) =>
          defaultRoles
            .find((r) => r.clave === role.clave)
            ?.permissions.flatMap((clave) => {
              const permisoId = permissionIds.get(clave);
              return permisoId ? [{ rolId: role.id, permisoId }] : [];
            }) ?? [],
      );
      if (rolePermissionRows.length > 0) {
        await tx.insert(relRolesPermisos).values(rolePermissionRows);
      }

      const [posUser] = await tx
        .insert(usuarios)
        .values({ authUsuarioId: input.authUsuarioId, nombre: input.usuarioNombre, correo: input.correo })
        .returning({ id: usuarios.id });
      if (!posUser) throw new Error("No se pudo crear el usuario.");

      const [member] = await tx
        .insert(miembrosOrganizaciones)
        .values({ organizacionId: organization.id, usuarioId: posUser.id })
        .returning({ id: miembrosOrganizaciones.id });
      if (!member) throw new Error("No se pudo asociar la organización.");

      const rolPropietario = roles.find((r) => r.clave === "propietario");
      if (!rolPropietario) throw new Error("No se pudo asignar el rol de propietario.");
      await tx.insert(relMiembrosRoles).values({ miembroOrganizacionId: member.id, rolId: rolPropietario.id });
      await tx.insert(relUsuariosSucursales).values({
        organizacionId: organization.id,
        usuarioId: posUser.id,
        sucursalId: branch.id,
      });

      await tx.insert(catMediosPago).values(
        mediosPagoBase.map((m) => ({ organizacionId: organization.id, ...m })),
      );

      const [suscripcion] = await tx
        .insert(suscripciones)
        .values({
          organizacionId: organization.id,
          planId: plan.id,
          estado: "trialing",
          trialTerminaAt: new Date(Date.now() + plan.trialDias * 24 * 60 * 60 * 1000),
        })
        .returning({ id: suscripciones.id });
      if (!suscripcion) throw new Error("No se pudo iniciar la prueba gratuita.");

      await tx.insert(billingEventos).values({
        organizacionId: organization.id,
        suscripcionId: suscripcion.id,
        tipo: "trial.iniciado",
        payload: { plan: PLAN_REGISTRO_CLAVE, trialTerminaAt },
      });

      await auditEvent(tx, {
        organizacionId: organization.id,
        sucursalId: branch.id,
        usuarioId: posUser.id,
        accion: "organizacion.registrada",
        entidad: "organizacion",
        entidadId: organization.id,
        detalle: { slug: input.slug, plan: PLAN_REGISTRO_CLAVE, trialTerminaAt },
      });

      return { ok: true as const, organizacionId: organization.id, sucursalId: branch.id, usuarioId: posUser.id };
    });
  } catch (error) {
    // Slug duplicado u otra violación de unicidad.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("organizaciones_slug") || message.toLowerCase().includes("unique")) {
      return { ok: false as const, error: "Ya existe un negocio registrado con ese identificador." };
    }
    return { ok: false as const, error: "No se pudo completar el registro. Inténtalo de nuevo." };
  }
}
