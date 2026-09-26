import { redirect } from "next/navigation";
import { cache } from "react";
import { and, eq, sql, type SQL } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { sucursales } from "@/db/schema/core";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { esPermisoSoloLectura, estadoEfectivoSuscripcion, type SuscripcionVista } from "@/modules/billing/rules";

type AuthUser = Awaited<ReturnType<typeof requireAuthenticatedUser>>["user"];

/** Sucursal activa tal como la devuelve la consulta fusionada (jsonb). */
export type SucursalAcceso = {
  id: string;
  organizacionId: string;
  nombre: string;
  clave: string;
  activo: boolean;
  zonaHoraria: string | null;
  capacidadSinAsignar: number;
  reservasOnline: boolean;
  reservasAutoConfirmar: boolean;
  reservasCancelacionHoras: number;
  reservasAnticipacionMinutos: number;
  reservasHorizonteDias: number;
};

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
  /**
   * Sucursales activas de la organización (sin filtrar por `branchIds`);
   * llegan en la misma consulta fusionada y evitan una ronda extra a la BD.
   */
  sucursalesActivas: SucursalAcceso[];
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
export type AccesoRow = {
  membership_id: string | null;
  permisos: string[] | null;
  sucursales: string[] | null;
  sucursales_activas: SucursalAcceso[] | null;
  suscripcion: {
    estado: string;
    trial_termina_at: string | null;
    periodo_termina_at: string | null;
  } | null;
};

/** Organización tal como la devuelve la consulta de contexto (jsonb). */
export type OrganizacionAcceso = {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  zonaHoraria: string;
  moneda: string;
  recordatoriosActivos: boolean;
  recordatoriosHorasAntes: number;
  /**
   * Permisos efectivos del usuario en esta organización (solo miembros; el
   * admin de plataforma recibe `null`). Viaja embebido para que el shell no
   * necesite una consulta por organización.
   */
  permisos: string[] | null;
};

/** Usuario interno embebido en la consulta de contexto. */
export type UsuarioSesion = {
  id: string;
  authUsuarioId: string;
  nombre: string;
  correo: string;
  esAdministradorPlataforma: boolean;
};

const ACCESO_FRAGMENT = (
  organizationId: string | null,
  usuarioRef: SQL | string,
) => sql`
  jsonb_build_object(
    'membership_id', (select mo.id
       from miembros_organizaciones mo
      where mo.organizacion_id = ${organizationId}
        and mo.usuario_id = ${usuarioRef}
        and mo.estado = 'activo'
      limit 1),
    'permisos', coalesce((
      select jsonb_agg(distinct p.clave)
        from rel_miembros_roles mr
        join miembros_organizaciones mo2 on mr.miembro_organizacion_id = mo2.id
        join cat_roles r on mr.rol_id = r.id and r.activo
        join rel_roles_permisos rp on r.id = rp.rol_id
        join cat_permisos p on rp.permiso_id = p.id and p.activo
       where mo2.organizacion_id = ${organizationId}
         and mo2.usuario_id = ${usuarioRef}
         and mo2.estado = 'activo'
    ), '[]'::jsonb),
    'sucursales', coalesce((
      select jsonb_agg(rus.sucursal_id)
        from rel_usuarios_sucursales rus
        join sucursales s on rus.sucursal_id = s.id
       where rus.organizacion_id = ${organizationId}
         and rus.usuario_id = ${usuarioRef}
         and s.activo
    ), '[]'::jsonb),
    'sucursales_activas', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', sa.id,
          'organizacionId', sa.organizacion_id,
          'nombre', sa.nombre,
          'clave', sa.clave,
          'activo', sa.activo,
          'zonaHoraria', sa.zona_horaria,
          'capacidadSinAsignar', sa.capacidad_sin_asignar,
          'reservasOnline', sa.reservas_online,
          'reservasAutoConfirmar', sa.reservas_auto_confirmar,
          'reservasCancelacionHoras', sa.reservas_cancelacion_horas,
          'reservasAnticipacionMinutos', sa.reservas_anticipacion_minutos,
          'reservasHorizonteDias', sa.reservas_horizonte_dias
        ) order by sa.nombre)
        from sucursales sa
       where sa.organizacion_id = ${organizationId} and sa.activo
    ), '[]'::jsonb),
    'suscripcion', (select jsonb_build_object(
        'estado', s.estado,
        'trial_termina_at', s.trial_termina_at,
        'periodo_termina_at', s.periodo_termina_at)
       from suscripciones s
      where s.organizacion_id = ${organizationId}
      order by s.created_at desc
      limit 1)
  )`;

/** Convierte la fila `acceso` de la consulta fusionada en `ResolvedAccess`. */
export function accessFromContextRow(
  user: AuthUser,
  organizationId: string,
  row: AccesoRow,
): ResolvedAccess | null {
  if (!row.membership_id) return null;

  const rawSuscripcion = row.suscripcion;
  const suscripcion: SuscripcionVista | null = rawSuscripcion
    ? {
        estado: rawSuscripcion.estado,
        trialTerminaAt: rawSuscripcion.trial_termina_at ? new Date(rawSuscripcion.trial_termina_at) : null,
        periodoTerminaAt: rawSuscripcion.periodo_termina_at ? new Date(rawSuscripcion.periodo_termina_at) : null,
      }
    : null;

  const sucursalIds = row.sucursales ?? [];
  return {
    user,
    organizationId,
    membershipId: row.membership_id,
    permissions: new Set(row.permisos ?? []),
    branchIds: sucursalIds.length ? new Set(sucursalIds) : null,
    sucursalesActivas: row.sucursales_activas ?? [],
    esPlataforma: false,
    soloLectura: estadoEfectivoSuscripcion(suscripcion) === "vencida",
  };
}

function platformAccess(user: AuthUser, organizationId: string): ResolvedAccess {
  return {
    user,
    organizationId,
    membershipId: null,
    permissions: new Set(),
    branchIds: null,
    // El admin de plataforma conserva su propia consulta de sucursales
    // (puede incluir inactivas según la página).
    sucursalesActivas: [],
    esPlataforma: true,
    soloLectura: false,
  };
}

/**
 * Membresía + permisos + alcance de sucursales + estado de suscripción en una
 * sola consulta (subselects `jsonb`). Antes eran 2 rondas secuenciales a la BD
 * (membresía → permisos‖sucursales‖suscripción); con CockroachDB remoto cada
 * ronda cuesta ~100 ms y este guard corre en todas las páginas admin.
 */
// Cache por request: el layout precalcula el acceso por organización y la
// página lo reutiliza; `user` llega del `requireAuthenticatedUser` cacheado,
// así que la identidad del objeto es estable dentro del mismo render.
export const resolveAccessSafe = cache(async function resolveAccessSafe(
  organizationId: string,
  user: AuthUser,
): Promise<ResolvedAccess | null> {
  if (user.esAdministradorPlataforma) {
    return platformAccess(user, organizationId);
  }

  const { rows } = await getDatabase().execute<{ acceso: AccesoRow | null }>(
    sql`select ${ACCESO_FRAGMENT(organizationId, user.id)} as acceso`,
  );

  const row = rows[0]?.acceso;
  if (!row) return null;
  return accessFromContextRow(user, organizationId, row);
});

type SessionContextRow = {
  usuario: UsuarioSesion | null;
  organizaciones: OrganizacionAcceso[] | null;
  acceso: AccesoRow | null;
};

/**
 * Contexto de sesión en UNA consulta: usuario interno + organizaciones
 * visibles + (opcional) el acceso a la organización pedida por la URL. Con la
 * sesión en cookie y este query fusionado, una página admin solo paga 2
 * rondas a la BD: contexto + datos de la página.
 * `acceso` es `null` cuando no se pidió organización, el usuario es admin de
 * plataforma (acceso sintético) o no es miembro activo.
 */
export const resolveSessionContext = cache(async function resolveSessionContext(
  authUsuarioId: string,
  requestedOrganizationId: string | null,
): Promise<{
  usuario: UsuarioSesion | null;
  organizaciones: OrganizacionAcceso[];
  acceso: AccesoRow | null;
}> {
  const { rows } = await getDatabase().execute<SessionContextRow>(sql`
    with u as (
      select id, nombre, correo, es_administrador_plataforma
        from usuarios
       where auth_usuario_id = ${authUsuarioId}
       limit 1
    )
    select
      (select jsonb_build_object(
          'id', id,
          'authUsuarioId', ${authUsuarioId}::text,
          'nombre', nombre,
          'correo', correo,
          'esAdministradorPlataforma', es_administrador_plataforma)
         from u) as usuario,
      case
        when (select es_administrador_plataforma from u)
          then coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', o.id, 'nombre', o.nombre, 'slug', o.slug,
                'activo', o.activo, 'zonaHoraria', o.zona_horaria,
                'moneda', o.moneda,
                'recordatoriosActivos', o.recordatorios_activos,
                'recordatoriosHorasAntes', o.recordatorios_horas_antes,
                'permisos', null
              ) order by o.nombre)
              from organizaciones o
          ), '[]'::jsonb)
          else coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', o.id, 'nombre', o.nombre, 'slug', o.slug,
                'activo', o.activo, 'zonaHoraria', o.zona_horaria,
                'moneda', o.moneda,
                'recordatoriosActivos', o.recordatorios_activos,
                'recordatoriosHorasAntes', o.recordatorios_horas_antes,
                'permisos', coalesce((
                  select jsonb_agg(distinct p.clave)
                    from rel_miembros_roles mr
                    join miembros_organizaciones mo2 on mr.miembro_organizacion_id = mo2.id
                    join cat_roles r on mr.rol_id = r.id and r.activo
                    join rel_roles_permisos rp on r.id = rp.rol_id
                    join cat_permisos p on rp.permiso_id = p.id and p.activo
                   where mo2.organizacion_id = o.id
                     and mo2.usuario_id = (select id from u)
                     and mo2.estado = 'activo'
                ), '[]'::jsonb)
              ) order by o.nombre)
              from miembros_organizaciones mo
              join organizaciones o on mo.organizacion_id = o.id
             where mo.usuario_id = (select id from u)
               and mo.estado = 'activo'
          ), '[]'::jsonb)
      end as organizaciones,
      case
        when ${requestedOrganizationId}::text is null
          or coalesce((select es_administrador_plataforma from u), false)
          then null
        else (
          select ${ACCESO_FRAGMENT(requestedOrganizationId, sql`(select id from u)`)}
        )
      end as acceso
  `);

  const row = rows[0];
  return {
    usuario: row?.usuario ?? null,
    organizaciones: row?.organizaciones ?? [],
    acceso: row?.acceso ?? null,
  };
});

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
