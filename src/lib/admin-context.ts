import { and, asc, eq, inArray } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { miembrosOrganizaciones, organizaciones, sucursales } from "@/db/schema/core";
import { requireAuthenticatedUser } from "@/lib/auth/access";
import { resolveAccess, type ResolvedAccess } from "@/lib/auth/authorization";
import { firstParam } from "@/lib/url-context";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@/modules/agenda/timezone";

export type AdminSearchParams = Record<string, string | string[] | undefined>;

export type AdminOrganization = {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  zonaHoraria: string;
  moneda: string;
};

export type AdminBranch = {
  id: string;
  organizacionId: string;
  nombre: string;
  clave: string;
  activo: boolean;
  zonaHoraria: string | null;
};

type AuthenticatedUser = Awaited<ReturnType<typeof requireAuthenticatedUser>>["user"];

export type AdminContext = {
  user: AuthenticatedUser;
  organizations: AdminOrganization[];
  organization: AdminOrganization | null;
  organizationId?: string;
  branches: AdminBranch[];
  branch: AdminBranch | null;
  sucursalId?: string;
  /** Acceso resuelto: permisos efectivos y alcance de sucursales. */
  access: ResolvedAccess;
  timeZone: string;
  currency: string;
};

/**
 * Organizaciones visibles para el usuario. Los administradores de plataforma
 * ven todas; los miembros solo organizaciones con membresía activa.
 */
export async function getAccessibleOrganizations(
  db: ReturnType<typeof getDatabase>,
  user: AuthenticatedUser,
): Promise<AdminOrganization[]> {
  const selection = {
    id: organizaciones.id,
    nombre: organizaciones.nombre,
    slug: organizaciones.slug,
    activo: organizaciones.activo,
    zonaHoraria: organizaciones.zonaHoraria,
    moneda: organizaciones.moneda,
  };

  if (user.esAdministradorPlataforma) {
    return db.select(selection).from(organizaciones).orderBy(asc(organizaciones.nombre));
  }

  return db
    .select(selection)
    .from(miembrosOrganizaciones)
    .innerJoin(organizaciones, eq(miembrosOrganizaciones.organizacionId, organizaciones.id))
    .where(
      and(
        eq(miembrosOrganizaciones.usuarioId, user.id),
        eq(miembrosOrganizaciones.estado, "activo"),
      ),
    )
    .orderBy(asc(organizaciones.nombre));
}

/**
 * Resuelve el contexto operativo común de una página admin: organización
 * efectiva, sucursal efectiva, zona horaria y moneda. Si el parámetro recibido
 * no pertenece al usuario, cae a la primera opción válida en lugar de aceptarlo
 * ciegamente.
 */
export async function getAdminContext(
  params: AdminSearchParams,
  options: { loadBranches?: boolean; includeInactiveBranches?: boolean } = {},
): Promise<AdminContext> {
  const { user } = await requireAuthenticatedUser();
  const db = getDatabase();
  const organizations = await getAccessibleOrganizations(db, user);
  const requestedOrganizationId = firstParam(params.organizationId);
  const organization =
    (requestedOrganizationId
      ? organizations.find((item) => item.id === requestedOrganizationId)
      : undefined) ?? organizations[0] ?? null;

  if (!organization) {
    return {
      user,
      organizations,
      organization: null,
      branches: [],
      branch: null,
      access: {
        user,
        organizationId: "",
        membershipId: null,
        permissions: new Set(),
        branchIds: null,
        esPlataforma: user.esAdministradorPlataforma,
        soloLectura: false,
      },
      timeZone: DEFAULT_TIME_ZONE,
      currency: "MXN",
    };
  }

  // Resuelve membresía, permisos y alcance de sucursales (redirige si no hay acceso).
  const access = await resolveAccess(organization.id);

  let branches: AdminBranch[] = [];
  if (options.loadBranches ?? true) {
    const conditions = [eq(sucursales.organizacionId, organization.id)];
    if (!(options.includeInactiveBranches ?? false)) {
      conditions.push(eq(sucursales.activo, true));
    }
    // Usuarios con asignaciones explícitas solo ven sus sucursales.
    if (access.branchIds !== null) {
      conditions.push(inArray(sucursales.id, [...access.branchIds]));
    }
    branches = await db
      .select({
        id: sucursales.id,
        organizacionId: sucursales.organizacionId,
        nombre: sucursales.nombre,
        clave: sucursales.clave,
        activo: sucursales.activo,
        zonaHoraria: sucursales.zonaHoraria,
      })
      .from(sucursales)
      .where(and(...conditions))
      .orderBy(asc(sucursales.nombre));
  }

  const requestedSucursalId = firstParam(params.sucursalId);
  const branch =
    (requestedSucursalId
      ? branches.find((item) => item.id === requestedSucursalId)
      : undefined) ?? branches[0] ?? null;

  return {
    user,
    organizations,
    organization,
    organizationId: organization.id,
    branches,
    branch,
    sucursalId: branch?.id,
    access,
    timeZone: resolveTimeZone(branch?.zonaHoraria, organization.zonaHoraria),
    currency: organization.moneda || "MXN",
  };
}
