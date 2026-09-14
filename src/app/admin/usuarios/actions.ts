"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDatabase } from "@/db/client";
import { catRoles, invitacionesUsuarios, relMiembrosRoles } from "@/db/schema/access";
import { miembrosOrganizaciones, relUsuariosSucursales, sucursales } from "@/db/schema/core";
import { actionError, actionSuccess, parseWithSchema, type ActionState } from "@/lib/action-state";
import { auditEvent } from "@/lib/audit";
import { assertBranchScope, canAccessBranch, checkPermission } from "@/lib/auth/authorization";
import { issueInvitation } from "@/lib/invitations";

const inviteSchema = z.object({
  organizacionId: z.string().uuid(),
  rolId: z.string().uuid(),
  sucursalId: z.string().uuid(),
  nombre: z.string().trim().min(2).max(160),
  correo: z.string().trim().toLowerCase().email().max(254),
});

export type InviteMemberState = ActionState<{ invitationUrl?: string }>;

/** Invita un miembro a la organización del usuario actual (`usuarios.invitar`). */
export async function inviteMember(
  _previousState: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const parsed = parseWithSchema(inviteSchema, Object.fromEntries(formData.entries()), "Revisa los datos de la invitación.");
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "usuarios.invitar");
  if (!access) return actionError("No tienes permiso para invitar miembros.");
  const { user } = access;

  // La sucursal asignada debe estar dentro del alcance del que invita.
  const sucursalValida = await assertBranchScope(access, input.sucursalId);
  if (!sucursalValida) return actionError("No puedes asignar una sucursal fuera de tu alcance.");

  let issued: Awaited<ReturnType<typeof issueInvitation>>;
  try {
    issued = await issueInvitation({ ...input, createdBy: user.id });
  } catch {
    return actionError("No se pudo enviar la invitación. Verifica la configuración de correo.");
  }
  if (issued.error) return actionError(issued.error);

  await auditEvent(getDatabase(), {
    organizacionId: input.organizacionId,
    sucursalId: input.sucursalId,
    usuarioId: user.id,
    accion: "invitacion.creada",
    entidad: "invitacion",
    entidadId: issued.invitationId,
    detalle: { correo: input.correo, rolId: input.rolId },
  });

  revalidatePath("/admin/usuarios");
  return actionSuccess("Invitación enviada.", { invitationUrl: issued.invitationUrl });
}

const memberSchema = z.object({
  organizacionId: z.string().uuid(),
  miembroId: z.string().uuid(),
});

/** Resuelve el miembro dentro de la org del caller; devuelve null si no existe. */
async function findMember(organizacionId: string, miembroId: string) {
  const db = getDatabase();
  const [member] = await db
    .select({
      id: miembrosOrganizaciones.id,
      usuarioId: miembrosOrganizaciones.usuarioId,
      estado: miembrosOrganizaciones.estado,
    })
    .from(miembrosOrganizaciones)
    .where(
      and(
        eq(miembrosOrganizaciones.id, miembroId),
        eq(miembrosOrganizaciones.organizacionId, organizacionId),
      ),
    )
    .limit(1);
  return member ?? null;
}

const rolesSchema = memberSchema.extend({
  rolIds: z.array(z.string().uuid()).max(10),
});

/**
 * Reemplaza los roles de un miembro (`usuarios.editar`). Reglas:
 * - No se puede editar la propia membresía (evita auto-bloqueo).
 * - Los roles deben pertenecer a la organización y estar activos.
 */
export async function setMemberRoles(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rolIds = formData.getAll("rolIds").map(String).filter(Boolean);
  const parsed = parseWithSchema(rolesSchema, {
    organizacionId: formData.get("organizacionId"),
    miembroId: formData.get("miembroId"),
    rolIds,
  });
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "usuarios.editar");
  if (!access) return actionError("No tienes permiso para editar miembros.");
  const { user } = access;

  const member = await findMember(input.organizacionId, input.miembroId);
  if (!member) return actionError("El miembro no pertenece a la organización.");
  if (member.usuarioId === user.id) {
    return actionError("No puedes modificar tus propios roles.");
  }

  const db = getDatabase();
  try {
    await db.transaction(async (tx) => {
      const validRoles = input.rolIds.length
        ? await tx
            .select({ id: catRoles.id })
            .from(catRoles)
            .where(
              and(
                inArray(catRoles.id, input.rolIds),
                eq(catRoles.organizacionId, input.organizacionId),
                eq(catRoles.activo, true),
              ),
            )
        : [];
      if (validRoles.length !== input.rolIds.length) {
        throw new Error("Uno o más roles no son válidos.");
      }

      await tx
        .delete(relMiembrosRoles)
        .where(eq(relMiembrosRoles.miembroOrganizacionId, member.id));
      if (input.rolIds.length > 0) {
        await tx.insert(relMiembrosRoles).values(
          input.rolIds.map((rolId) => ({
            miembroOrganizacionId: member.id,
            rolId,
            createdBy: user.id,
          })),
        );
      }
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        usuarioId: user.id,
        accion: "miembro.roles",
        entidad: "miembro",
        entidadId: member.usuarioId,
        detalle: { rolIds: input.rolIds },
      });
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "No se pudieron actualizar los roles.");
  }

  revalidatePath("/admin/usuarios");
  return actionSuccess("Roles actualizados.");
}

const branchesSchema = memberSchema.extend({
  sucursalIds: z.array(z.string().uuid()).max(50),
});

/**
 * Reemplaza las sucursales asignadas de un miembro (`usuarios.editar`).
 * Solo puede otorgarse acceso a sucursales dentro del alcance propio.
 */
export async function setMemberBranches(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const sucursalIds = [...new Set(formData.getAll("sucursalIds").map(String).filter(Boolean))];
  const parsed = parseWithSchema(branchesSchema, {
    organizacionId: formData.get("organizacionId"),
    miembroId: formData.get("miembroId"),
    sucursalIds,
  });
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "usuarios.editar");
  if (!access) return actionError("No tienes permiso para editar miembros.");
  const { user } = access;

  const member = await findMember(input.organizacionId, input.miembroId);
  if (!member) return actionError("El miembro no pertenece a la organización.");
  if (member.usuarioId === user.id) {
    return actionError("No puedes modificar tus propias sucursales.");
  }

  const db = getDatabase();
  try {
    await db.transaction(async (tx) => {
      if (input.sucursalIds.length > 0) {
        const valid = await tx
          .select({ id: sucursales.id })
          .from(sucursales)
          .where(
            and(
              inArray(sucursales.id, input.sucursalIds),
              eq(sucursales.organizacionId, input.organizacionId),
              eq(sucursales.activo, true),
            ),
          );
        if (valid.length !== input.sucursalIds.length) {
          throw new Error("Una o más sucursales no son válidas.");
        }
        for (const sucursalId of input.sucursalIds) {
          if (!canAccessBranch(access, sucursalId)) {
            throw new Error("No puedes asignar sucursales fuera de tu alcance.");
          }
        }
      }

      await tx
        .delete(relUsuariosSucursales)
        .where(
          and(
            eq(relUsuariosSucursales.organizacionId, input.organizacionId),
            eq(relUsuariosSucursales.usuarioId, member.usuarioId),
          ),
        );
      if (input.sucursalIds.length > 0) {
        await tx.insert(relUsuariosSucursales).values(
          input.sucursalIds.map((sucursalId) => ({
            organizacionId: input.organizacionId,
            usuarioId: member.usuarioId,
            sucursalId,
            createdBy: user.id,
          })),
        );
      }
      await auditEvent(tx, {
        organizacionId: input.organizacionId,
        usuarioId: user.id,
        accion: "miembro.sucursales",
        entidad: "miembro",
        entidadId: member.usuarioId,
        detalle: { sucursalIds: input.sucursalIds },
      });
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "No se pudieron actualizar las sucursales.");
  }

  revalidatePath("/admin/usuarios");
  return actionSuccess("Sucursales actualizadas.");
}

const toggleSchema = memberSchema.extend({
  estado: z.enum(["activo", "suspendido"]),
});

/** Suspende o reactiva la membresía de un usuario (`usuarios.editar`). */
export async function toggleMember(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(toggleSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "usuarios.editar");
  if (!access) return actionError("No tienes permiso para editar miembros.");
  const { user } = access;

  const member = await findMember(input.organizacionId, input.miembroId);
  if (!member) return actionError("El miembro no pertenece a la organización.");
  if (member.usuarioId === user.id) {
    return actionError("No puedes cambiar tu propio estado.");
  }

  const db = getDatabase();
  await db
    .update(miembrosOrganizaciones)
    .set({ estado: input.estado, updatedBy: user.id })
    .where(eq(miembrosOrganizaciones.id, member.id));
  await auditEvent(db, {
    organizacionId: input.organizacionId,
    usuarioId: user.id,
    accion: input.estado === "activo" ? "miembro.reactivado" : "miembro.suspendido",
    entidad: "miembro",
    entidadId: member.usuarioId,
  });

  revalidatePath("/admin/usuarios");
  return actionSuccess(input.estado === "activo" ? "Miembro reactivado." : "Miembro suspendido.");
}

const cancelInvitationSchema = z.object({
  organizacionId: z.string().uuid(),
  invitacionId: z.string().uuid(),
});

/** Cancela una invitación pendiente (`usuarios.invitar`). */
export async function cancelInvitation(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parseWithSchema(cancelInvitationSchema, Object.fromEntries(formData.entries()));
  if (!parsed.success) return parsed.state;
  const input = parsed.data;

  const access = await checkPermission(input.organizacionId, "usuarios.invitar");
  if (!access) return actionError("No tienes permiso para gestionar invitaciones.");
  const { user } = access;
  const db = getDatabase();

  const [updated] = await db
    .update(invitacionesUsuarios)
    .set({ estado: "cancelada" })
    .where(
      and(
        eq(invitacionesUsuarios.id, input.invitacionId),
        eq(invitacionesUsuarios.organizacionId, input.organizacionId),
        eq(invitacionesUsuarios.estado, "pendiente"),
      ),
    )
    .returning({ id: invitacionesUsuarios.id });
  if (!updated) return actionError("La invitación no existe o ya no está pendiente.");

  await auditEvent(db, {
    organizacionId: input.organizacionId,
    usuarioId: user.id,
    accion: "invitacion.cancelada",
    entidad: "invitacion",
    entidadId: input.invitacionId,
  });
  revalidatePath("/admin/usuarios");
  return actionSuccess("Invitación cancelada.");
}
