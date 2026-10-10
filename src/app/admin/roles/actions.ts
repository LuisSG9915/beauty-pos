"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catPermisos, catRoles, relMiembrosRoles, relRolesPermisos } from "@/db/schema/access";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { checkPermission, hasPermission } from "@/lib/auth/authorization";
import { claveDisponible } from "@/lib/clave";

/** Rol intocable: quitarle permisos dejaría a la org sin administrador. */
const PROTECTED_ROLE = "propietario";

const createRoleSchema = z.object({
  organizacionId: z.string().uuid(),
  clave: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(/^[a-z0-9_-]*$/, "Usa solo letras minúsculas, números, guion o guion bajo.")
    .optional()
    .or(z.literal("")),
  nombre: z.string().trim().min(2).max(120),
});

export async function createRole(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(createRoleSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "roles.editar");
  if (!access) return actionError("No tienes permiso para editar roles.");
  const { user } = access;
  const db = getDatabase();

  const clave =
    input.clave && input.clave.length >= 2
      ? input.clave
      : await claveDisponible(db, catRoles, input.organizacionId, input.nombre, 80);

  try {
    await db.insert(catRoles).values({
      organizacionId: input.organizacionId,
      clave,
      nombre: input.nombre,
      alcance: "organizacion",
      esSistema: false,
    });
  } catch {
    return actionError("No se pudo crear el rol. La clave puede estar repetida.");
  }

  await auditEvent(db, {
    organizacionId: input.organizacionId,
    usuarioId: user.id,
    accion: "rol.creado",
    entidad: "rol",
    detalle: { clave: input.clave, nombre: input.nombre },
  });
  revalidatePath("/admin/roles");
  return actionSuccess("Rol creado. Asígnale permisos en la lista.");
}

const setPermissionsSchema = z.object({
  organizacionId: z.string().uuid(),
  rolId: z.string().uuid(),
  permisoIds: z.array(z.string().uuid()).max(200),
});

/**
 * Reemplaza los permisos de un rol (`roles.editar`). Reglas anti-escalamiento:
 * - El rol `propietario` no se puede modificar (protege el acceso del dueño).
 * - Solo se pueden otorgar permisos que el editor mismo posee.
 */
export async function setRolePermissions(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const permisoIds = [...new Set(formData.getAll("permisoIds").map(String).filter(Boolean))];
  const parsed = parseWithSchema(setPermissionsSchema, {
    organizacionId: formData.get("organizacionId"),
    rolId: formData.get("rolId"),
    permisoIds,
  });
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "roles.editar");
  if (!access) return actionError("No tienes permiso para editar roles.");
  const { user } = access;
  const db = getDatabase();

  try {
    await db.transaction(async (tx) => {
      const [role] = await tx
        .select({ id: catRoles.id, clave: catRoles.clave })
        .from(catRoles)
        .where(and(eq(catRoles.id, input.rolId), eq(catRoles.organizacionId, input.organizacionId)))
        .limit(1);
      if (!role) throw new Error("El rol no existe.");
      if (role.clave === PROTECTED_ROLE) {
        throw new Error("El rol Propietario no se puede modificar.");
      }

      const catalogo = input.permisoIds.length
        ? await tx
            .select({ id: catPermisos.id, clave: catPermisos.clave })
            .from(catPermisos)
            .where(and(inArray(catPermisos.id, input.permisoIds), eq(catPermisos.activo, true)))
        : [];
      if (catalogo.length !== input.permisoIds.length) {
        throw new Error("Uno o más permisos no son válidos.");
      }
      // Anti-escalamiento: no se otorgan permisos que el editor no tenga.
      const ajeno = catalogo.find((permiso) => !hasPermission(access, permiso.clave));
      if (ajeno) {
        throw new Error(`No puedes otorgar el permiso "${ajeno.clave}" porque no lo tienes.`);
      }

      await tx.delete(relRolesPermisos).where(eq(relRolesPermisos.rolId, role.id));
      if (catalogo.length > 0) {
        await tx.insert(relRolesPermisos).values(
          catalogo.map((permiso) => ({ rolId: role.id, permisoId: permiso.id })),
        );
      }
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        usuarioId: user.id,
        accion: "rol.permisos",
        entidad: "rol",
        entidadId: role.id,
        detalle: { clave: role.clave, permisos: catalogo.map((permiso) => permiso.clave) },
      });
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "No se pudieron guardar los permisos.");
  }

  revalidatePath("/admin/roles");
  revalidatePath("/admin/usuarios");
  return actionSuccess("Permisos del rol actualizados.");
}

const toggleRoleSchema = z.object({
  organizacionId: z.string().uuid(),
  rolId: z.string().uuid(),
  activo: z.enum(["true", "false"]),
});

/** Activa/desactiva un rol. No aplica a `propietario` ni a roles con miembros. */
export async function toggleRole(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(toggleRoleSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "roles.editar");
  if (!access) return actionError("No tienes permiso para editar roles.");
  const { user } = access;
  const db = getDatabase();
  const activo = input.activo === "true";

  const [role] = await db
    .select({ id: catRoles.id, clave: catRoles.clave, activo: catRoles.activo })
    .from(catRoles)
    .where(and(eq(catRoles.id, input.rolId), eq(catRoles.organizacionId, input.organizacionId)))
    .limit(1);
  if (!role) return actionError("El rol no existe.");
  if (role.clave === PROTECTED_ROLE) {
    return actionError("El rol Propietario no se puede desactivar.");
  }

  if (!activo) {
    const [asignado] = await db
      .select({ id: relMiembrosRoles.id })
      .from(relMiembrosRoles)
      .where(eq(relMiembrosRoles.rolId, role.id))
      .limit(1);
    if (asignado) {
      return actionError("Hay miembros con este rol. Quítalo de cada miembro primero.");
    }
  }

  await db
    .update(catRoles)
    .set({ activo })
    .where(eq(catRoles.id, role.id));
  await auditEvent(db, {
    organizacionId: input.organizacionId,
    usuarioId: user.id,
    accion: activo ? "rol.activado" : "rol.desactivado",
    entidad: "rol",
    entidadId: role.id,
    detalle: { clave: role.clave },
  });

  revalidatePath("/admin/roles");
  return actionSuccess(activo ? "Rol activado." : "Rol desactivado.");
}
