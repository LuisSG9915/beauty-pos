import { and, asc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";

import { getDatabase } from "@/db/client";
import { sucursales } from "@/db/schema/core";
import { getSessionOrRedirect } from "@/lib/auth/access";
import {
  accessFromContextRow,
  resolveAccess,
  resolveSessionContext,
  sucursalesActivasDelAcceso,
  type OrganizacionAcceso,
  type ResolvedAccess,
  type UsuarioSesion,
} from "@/lib/auth/authorization";
import { leerSucursalCookie } from "@/lib/sucursal-cookie";
import { firstParam } from "@/lib/url-context";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@/modules/agenda/timezone";

export type AdminSearchParams = Record<string, string | string[] | undefined>;

export type AdminOrganization = OrganizacionAcceso;

export type AdminBranch = {
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

type AuthenticatedUser = UsuarioSesion;

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
 * Resuelve el contexto operativo común de una página admin: organización
 * efectiva, sucursal efectiva, zona horaria y moneda. Si el parámetro recibido
 * no pertenece al usuario, cae a la primera opción válida en lugar de aceptarlo
 * ciegamente.
 *
 * La consulta de contexto (`resolveSessionContext`) devuelve usuario +
 * organizaciones + acceso a la org pedida en UNA ronda; cuando la URL no
 * trae `organizationId` o cae a otra org se recurre a `resolveAccess`.
 */
export async function getAdminContext(
  params: AdminSearchParams,
  options: { loadBranches?: boolean; includeInactiveBranches?: boolean } = {},
): Promise<AdminContext> {
  const session = await getSessionOrRedirect();
  const db = getDatabase();
  const requestedOrganizationId = firstParam(params.organizationId);
  const contextRow = await resolveSessionContext(session.user.id, requestedOrganizationId ?? null);
  const user = contextRow.usuario;
  if (!user) {
    redirect("/login?error=account-not-configured");
  }
  const organizations = contextRow.organizaciones;
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
        sucursalesActivas: [],
        esPlataforma: user.esAdministradorPlataforma,
        soloLectura: false,
      },
      timeZone: DEFAULT_TIME_ZONE,
      currency: "MXN",
    };
  }

  // El acceso ya viaja en la consulta de contexto cuando la org pedida (o la
  // primera por defecto) coincide con el acceso devuelto; solo se consulta aparte
  // si el usuario pidió explícitamente otra organización distinta.
  const orgAccesoId = contextRow.acceso?.organization_id ?? (requestedOrganizationId ?? organizations[0]?.id);
  const access =
    organization.id === orgAccesoId && contextRow.acceso
      ? (accessFromContextRow(user, organization.id, contextRow.acceso) ??
        (await resolveAccess(organization.id)))
      : await resolveAccess(organization.id);

  let branches: AdminBranch[] = [];
  if (options.loadBranches ?? true) {
    if (!(options.includeInactiveBranches ?? false)) {
      branches = await sucursalesActivasDelAcceso(access);
    } else {
      const conditions = [eq(sucursales.organizacionId, organization.id)];
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
          capacidadSinAsignar: sucursales.capacidadSinAsignar,
          reservasOnline: sucursales.reservasOnline,
          reservasAutoConfirmar: sucursales.reservasAutoConfirmar,
          reservasCancelacionHoras: sucursales.reservasCancelacionHoras,
          reservasAnticipacionMinutos: sucursales.reservasAnticipacionMinutos,
          reservasHorizonteDias: sucursales.reservasHorizonteDias,
        })
        .from(sucursales)
        .where(and(...conditions))
        .orderBy(asc(sucursales.nombre));
    }
  }

  // Sucursal efectiva: `?sucursalId` válida → cookie preferida válida →
  // primera del alcance. "Válida" = presente en `branches`, que ya están
  // acotadas al alcance del usuario (la cookie nunca se confía sola).
  const requestedSucursalId = firstParam(params.sucursalId);
  let branch: AdminBranch | null =
    (requestedSucursalId
      ? branches.find((item) => item.id === requestedSucursalId)
      : undefined) ?? null;
  if (!branch && branches.length > 0) {
    const preferidaId = await leerSucursalCookie(organization.id);
    branch =
      (preferidaId
        ? branches.find((item) => item.id === preferidaId)
        : undefined) ??
      branches[0] ??
      null;
  }

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
