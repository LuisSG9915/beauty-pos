"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, type ReactNode } from "react";

import { AdminNavCompact, AdminTabBar } from "@/components/admin-nav";
import {
  SubscriptionBanner,
  type BillingBadge,
} from "@/components/admin/subscription-banner";
import { ToastProvider } from "@/components/ui/toast";
import { buildHref, firstParam } from "@/lib/url-context";

/** Organización accesible por el usuario, para el selector del shell. */
export type AdminShellOrganization = {
  id: string;
  nombre: string;
  slug: string;
  activo?: boolean;
};

export type AdminShellProps = {
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
  organizations: AdminShellOrganization[];
  /** Permisos por organización (id → claves). null = sin filtro (plataforma). */
  permissionsByOrg?: Record<string, string[]> | null;
  /** Estado de suscripción por organización para el banner (trial / vencida). */
  billingByOrg?: Record<string, BillingBadge>;
  children: ReactNode;
};

/**
 * Selector de organización del shell. Lee `organizationId` de la URL (o la
 * primera organización disponible) y navega conservando los demás
 * parámetros; `sucursalId` se descarta porque depende de la organización.
 */
function OrganizationSelector({
  organizations,
}: {
  organizations: AdminShellOrganization[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectId = useId();
  const urlOrganizationId = firstParam(searchParams.get("organizationId"));
  const currentId =
    urlOrganizationId &&
    organizations.some((organization) => organization.id === urlOrganizationId)
      ? urlOrganizationId
      : (organizations[0]?.id ?? "");

  if (organizations.length === 0) {
    return (
      <span className="rounded-full border border-dashed border-[#ded8d2] px-3 py-1.5 text-xs text-[#8a7b72]">
        Sin organización asignada
      </span>
    );
  }

  if (organizations.length === 1) {
    const [organization] = organizations;
    return (
      <span className="inline-flex max-w-48 items-center truncate rounded-full border border-[#eadfd8] bg-[#faf6f3] px-3 py-1.5 text-xs font-medium text-[#60392e]">
        {organization.nombre}
      </span>
    );
  }

  return (
    <label className="flex min-w-0 items-center gap-2" htmlFor={selectId}>
      <span className="hidden text-xs font-medium text-[#8a7b72] sm:inline">
        Organización
      </span>
      <select
        aria-label="Organización activa"
        className="h-10 min-w-0 max-w-44 rounded-xl border border-[#ded8d2] bg-white px-2.5 text-xs font-medium text-[#403a35] sm:max-w-56"
        id={selectId}
        onChange={(event) => {
          router.push(
            buildHref(pathname, {
              params: searchParams,
              organizationId: event.target.value,
              sucursalId: null,
            }),
          );
        }}
        value={currentId}
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.nombre}
            {organization.activo === false ? " (inactiva)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Navegación del shell: usa el `organizationId` de la URL y, si falta,
 * la primera organización accesible, de modo que los enlaces siempre
 * conserven el contexto de organización.
 */
function ShellNav({
  organizations,
  platformAdmin,
  permissionsByOrg,
}: {
  organizations: AdminShellOrganization[];
  platformAdmin: boolean;
  permissionsByOrg?: Record<string, string[]> | null;
}) {
  const searchParams = useSearchParams();
  const organizationId =
    firstParam(searchParams.get("organizationId")) ?? organizations[0]?.id;
  const permissions =
    platformAdmin || permissionsByOrg == null
      ? null
      : (organizationId ? (permissionsByOrg[organizationId] ?? []) : []);
  return (
    <AdminNavCompact
      organizationId={organizationId}
      permissions={permissions}
      platformAdmin={platformAdmin}
    />
  );
}

/** Tab bar móvil con los accesos filtrados por los permisos de la org activa. */
function ShellTabBar({
  organizations,
  platformAdmin,
  permissionsByOrg,
}: {
  organizations: AdminShellOrganization[];
  platformAdmin: boolean;
  permissionsByOrg?: Record<string, string[]> | null;
}) {
  const searchParams = useSearchParams();
  const organizationId =
    firstParam(searchParams.get("organizationId")) ?? organizations[0]?.id;
  const permissions =
    platformAdmin || permissionsByOrg == null
      ? null
      : (organizationId ? (permissionsByOrg[organizationId] ?? []) : []);
  return <AdminTabBar permissions={permissions} />;
}

/**
 * Shell visual del panel de administración (client component). Conserva
 * estado entre navegaciones y deriva la organización activa de la URL.
 *
 * Nota de migración: las páginas actuales renderizan su propio <main> y
 * encabezado; al migrar deben usar <AdminPageHeader> y retirar el landmark
 * duplicado para que solo quede el <main> del shell.
 */
export function AdminShell({
  userName,
  userEmail,
  isPlatformAdmin,
  organizations,
  permissionsByOrg,
  billingByOrg,
  children,
}: AdminShellProps) {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-[#faf9f7] text-[#292522]">
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-[#2c2522] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#fffaf5]"
          href="#contenido-admin"
        >
          Saltar al contenido
        </a>
        <header className="sticky top-0 z-40 border-b border-[#eee6e0] bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-10">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="flex size-9 items-center justify-center rounded-xl bg-[#2c2522] text-xs font-semibold text-[#f6eadf]"
              >
                BP
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold tracking-tight">Beauty POS</p>
                <p className="text-[11px] text-[#8a7b72]">
                  {isPlatformAdmin ? "Plataforma" : "Panel de operación"}
                </p>
              </div>
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-3">
              <Suspense
                fallback={
                  <span className="h-10 w-36 animate-pulse rounded-xl bg-[#f1eeea]" />
                }
              >
                <OrganizationSelector organizations={organizations} />
              </Suspense>
              <div className="hidden text-right leading-tight sm:block">
                <p className="max-w-40 truncate text-sm font-medium">{userName}</p>
                <p className="max-w-40 truncate text-[11px] text-[#8a7b72]">
                  {userEmail}
                </p>
              </div>
            </div>
          </div>
          <div className="border-t border-[#f4eeea]">
            <div className="mx-auto w-full max-w-[1400px] px-4 py-2 sm:px-6 lg:px-10">
              <Suspense fallback={null}>
                <ShellNav
                  organizations={organizations}
                  permissionsByOrg={permissionsByOrg}
                  platformAdmin={isPlatformAdmin}
                />
              </Suspense>
            </div>
          </div>
        </header>

        <main
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-24 sm:px-6 md:pb-6 lg:px-10"
          id="contenido-admin"
        >
          {billingByOrg ? (
            <Suspense fallback={null}>
              <SubscriptionBanner
                billingByOrg={billingByOrg}
                organizations={organizations}
              />
            </Suspense>
          ) : null}
          {children}
        </main>

        <Suspense fallback={null}>
          <ShellTabBar
            organizations={organizations}
            permissionsByOrg={permissionsByOrg}
            platformAdmin={isPlatformAdmin}
          />
        </Suspense>
      </div>
    </ToastProvider>
  );
}
