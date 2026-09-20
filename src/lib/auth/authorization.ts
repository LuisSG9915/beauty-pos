import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { catPermisos, catRoles, relMiembrosRoles, relRolesPermisos } from "@/db/schema/access";
import { suscripciones } from "@/db/schema/billing";
import { miembrosOrganizaciones, relUsuariosSucursales, sucursales } from "@/db/schema/core";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { esPermisoSoloLectura, estadoEfectivoSuscripcion } from "@/modules/billing/rules";

type AuthUser = Awaited<ReturnType<typeof requireAuthenticatedUser>>["user"];

/**
 * Acceso resuelto de un usuario dentro de una organización:
 * permisos efectivos (unión de roles) y alcance de sucursales.
 * `branchIds === null` significa acceso a todas las sucursales.
 */
export type ResolvedAccess = {
  user: AuthUser;
  organizationId: string;
  membershipId: string | null;
  permissions: ReadonlySet<string>;
  /** null = todas las sucursales; Set = solo las asignadas. */
  branchIds: ReadonlySet<string> | null;
  esPlataforma: boolean;
  /**
   * true cuando la suscripción de la organización venció: las lecturas
   * (`*.ver`, `reportes.*`) siguen permitidas y toda escritura se bloquea.
   */
  soloLectura: boolean;
};

export function hasPermission(access: ResolvedAccess, clave: string): boolean {
  if (access.esPlataforma) return true;
  if (!access.permissions.has(clave)) return false;
  if (access.soloLectura && !esPermisoSoloLectura(clave)) return false;
  return true;
}

export function canAccessBranch(access: ResolvedAccess, sucursalId: string): boolean {
  return access.branchIds === null || access.branchIds.has(sucursalId);
}

/**
 * Resuelve membresía, roles→permisos y sucursales asignadas del usuario en la
 * organización. Reglas:
 * - Administrador de plataforma: todos los permisos y todas las sucursales.
 * - Miembro activo: unión de permisos de sus roles activos. Si tiene filas en
 *   `rel_usuarios_sucursales`, su alcance queda restringido a esas sucursales;
 *   sin asignaciones, accede a todas (caso típico del propietario).
 * - Miembro sin roles: sin permisos (fail-closed).
 * Redirige si no hay sesión o la membresía no está activa.
 */
/**
 * Resolución sin redirect: devuelve el acceso o `null` cuando el usuario no es
 * miembro activo de la organización. La usa el shell para precalcular permisos
 * por organización.
 */
export async function resolveAccessSafe(
  organizationId: string,
  user: AuthUser,
): Promise<ResolvedAccess | null> {
  const db = getDatabase();

  if (user.esAdministradorPlataforma) {
    return {
      user,
      organizationId,
      membershipId: null,
      permissions: new Set(),
      branchIds: null,
      esPlataforma: true,
      soloLectura: false,
    };
  }

  const [membership] = await db
    .select({ id: miembrosOrganizaciones.id })
    .from(miembrosOrganizaciones)
    .where(
      and(
        eq(miembrosOrganizaciones.organizacionId, organizationId),
        eq(miembrosOrganizaciones.usuarioId, user.id),
        eq(miembrosOrganizaciones.estado, "activo"),
      ),
    )
    .limit(1);

  if (!membership) return null;

  const [permissionRows, branchRows, suscripcionRows] = await Promise.all([
    db
      .select({ clave: catPermisos.clave })
      .from(relMiembrosRoles)
      .innerJoin(catRoles, eq(relMiembrosRoles.rolId, catRoles.id))
      .innerJoin(relRolesPermisos, eq(catRoles.id, relRolesPermisos.rolId))
      .innerJoin(catPermisos, eq(relRolesPermisos.permisoId, catPermisos.id))
      .where(
        and(
          eq(relMiembrosRoles.miembroOrganizacionId, membership.id),
          eq(catRoles.activo, true),
          eq(catPermisos.activo, true),
        ),
      ),
    db
      .select({ sucursalId: relUsuariosSucursales.sucursalId })
      .from(relUsuariosSucursales)
      .innerJoin(sucursales, eq(relUsuariosSucursales.sucursalId, sucursales.id))
      .where(
        and(
          eq(relUsuariosSucursales.organizacionId, organizationId),
          eq(relUsuariosSucursales.usuarioId, user.id),
          eq(sucursales.activo, true),
        ),
      ),
    db
      .select({
        estado: suscripciones.estado,
        trialTerminaAt: suscripciones.trialTerminaAt,
        periodoTerminaAt: suscripciones.periodoTerminaAt,
      })
      .from(suscripciones)
      .where(eq(suscripciones.organizacionId, organizationId))
      .orderBy(desc(suscripciones.createdAt))
      .limit(1),
  ]);

  return {
    user,
    organizationId,
    membershipId: membership.id,
    permissions: new Set(permissionRows.map((row) => row.clave)),
    branchIds: branchRows.length ? new Set(branchRows.map((row) => row.sucursalId)) : null,
    esPlataforma: false,
    soloLectura: estadoEfectivoSuscripcion(suscripcionRows[0] ?? null) === "vencida",
  };
}

export async function resolveAccess(organizationId: string): Promise<ResolvedAccess> {
  const { user } = await requireAuthenticatedUser();
  const access = await resolveAccessSafe(organizationId, user);
  if (!access) {
    redirect("/admin?error=organization-access-denied");
  }
  return access;
}

/**
 * Guard para páginas que ya resolvieron `getAdminContext`: redirige al panel
 * con error cuando falta el permiso.
 */
export function requireAccessPermission(access: ResolvedAccess, clave: string): void {
  if (!hasPermission(access, clave)) {
    redirect(`/admin?error=permiso-denegado&permiso=${encodeURIComponent(clave)}`);
  }
}

/**
 * Guard para páginas: exige un permiso dentro de la organización. Redirige al
 * panel con error si el usuario no lo tiene.
 */
export async function requirePermission(
  organizationId: string,
  clave: string,
): Promise<ResolvedAccess> {
  const access = await resolveAccess(organizationId);
  if (!hasPermission(access, clave)) {
    redirect(`/admin?error=permiso-denegado&permiso=${encodeURIComponent(clave)}`);
  }
  return access;
}

/**
 * Guard para server actions: devuelve el acceso resuelto o `null` cuando falta
 * el permiso, para que la acción responda con `actionError` en lugar de
 * redirigir.
 */
export async function checkPermission(
  organizationId: string,
  clave: string,
): Promise<ResolvedAccess | null> {
  const access = await resolveAccess(organizationId);
  return hasPermission(access, clave) ? access : null;
}

/**
 * Valida que la sucursal pertenece a la organización, está activa y entra en
 * el alcance del usuario. Devuelve true/false (sin redirigir) para que las
 * server actions puedan responder con un estado de error.
 */
export async function assertBranchScope(
  access: ResolvedAccess,
  sucursalId: string,
): Promise<boolean> {
  if (!canAccessBranch(access, sucursalId)) return false;
  const db = getDatabase();
  const [branch] = await db
    .select({ id: sucursales.id })
    .from(sucursales)
    .where(
      and(
        eq(sucursales.id, sucursalId),
        eq(sucursales.organizacionId, access.organizationId),
        eq(sucursales.activo, true),
      ),
    )
    .limit(1);
  return Boolean(branch);
}
