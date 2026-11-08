"use client";

import { Suspense, useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { guardarSucursalPreferida } from "@/app/admin/actions";
import { AdminSidebarNav, AdminTabBar, SignOutButton } from "@/components/admin-nav";
import {
  SubscriptionBanner,
  type BillingBadge,
} from "@/components/admin/subscription-banner";
import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { ToastProvider } from "@/components/ui/toast";
import { PoseTimerBar } from "@/components/pose-timer-bar";
import { getClientSucursalCookie, setClientSucursalCookie } from "@/lib/sucursal-cookie-client";
import { reportarNavegacionPendiente } from "@/lib/nav-pending";
import { buildAdminHref, buildHref, firstParam } from "@/lib/url-context";

/** Sucursal visible para el selector global del shell. */
export type AdminShellBranch = {
  id: string;
  nombre: string;
};

/** Organización accesible por el usuario, para el selector del shell. */
export type AdminShellOrganization = {
  id: string;
  nombre: string;
  slug: string;
  activo?: boolean;
  /**
   * Sucursales activas visibles para el usuario en esta organización (ya
   * acotadas a su alcance por la consulta de contexto).
   */
  sucursales?: AdminShellBranch[];
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
  /** Capacidades ausentes del plan vigente por organización (ocultan accesos). */
  capacidadesFaltantesByOrg?: Record<string, string[]> | null;
  /**
   * Preferencia de sucursal por organización (cookies httpOnly
   * `melena_sucursal_*`). El shell la usa solo para mostrar la misma sucursal
   * que el servidor resuelve; la validación de alcance es siempre del servidor.
   */
  sucursalPreferidaPorOrg?: Record<string, string>;
  children: ReactNode;
};

/**
 * Organización efectiva del shell: la de `?organizationId` cuando es accesible
 * o la primera disponible. Replica la resolución que hace el servidor para
 * que los selectores coincidan con el contexto de la página.
 */
function useEffectiveOrganization(organizations: AdminShellOrganization[]) {
  const searchParams = useSearchParams();
  const urlOrganizationId = firstParam(searchParams.get("organizationId"));
  return (
    (urlOrganizationId
      ? organizations.find((organization) => organization.id === urlOrganizationId)
      : undefined) ?? organizations[0]
  );
}

/**
 * Selector de negocio del shell. Lee `organizationId` de la URL (o la primera
 * organización disponible) y navega conservando los demás parámetros;
 * `sucursalId` se descarta porque depende de la organización.
 * `variant="sidebar"` lo rinde como bloque de ancho completo con la etiqueta
 * "Tu negocio" — en la UI cotidiana se dice "negocio", no "organización".
 */
function OrganizationSelector({
  organizations,
  variant = "compact",
}: {
  organizations: AdminShellOrganization[];
  variant?: "compact" | "sidebar";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectId = useId();
  const organization = useEffectiveOrganization(organizations);
  const currentId = organization?.id ?? "";
  const sidebarLabel =
    variant === "sidebar" ? (
      <span className="mb-1 block text-op-xs font-medium text-muted-foreground">
        Tu negocio
      </span>
    ) : null;

  if (organizations.length === 0) {
    return (
      <span className="rounded-full border border-dashed border-border px-3 py-1.5 text-op-xs text-muted-foreground">
        Sin negocio asignado
      </span>
    );
  }

  if (organizations.length === 1) {
    const [organization] = organizations;
    const nombre = (
      <span
        className={
          variant === "sidebar"
            ? "block truncate rounded-xl border border-border bg-muted px-3 py-2 text-op-xs font-medium text-accent-foreground"
            : "inline-flex max-w-48 items-center truncate rounded-full border border-border bg-muted px-3 py-1.5 text-op-xs font-medium text-accent-foreground"
        }
      >
        {organization.nombre}
      </span>
    );
    return variant === "sidebar" ? (
      <span className="block min-w-0">
        {sidebarLabel}
        {nombre}
      </span>
    ) : (
      nombre
    );
  }

  return (
    <label
      className={
        variant === "sidebar"
          ? "block min-w-0"
          : "flex min-w-0 items-center gap-2"
      }
      htmlFor={selectId}
    >
      {sidebarLabel ?? (
        <span className="hidden text-op-xs font-medium text-muted-foreground sm:inline">
          Tu negocio
        </span>
      )}
      <select
        aria-label="Negocio activo"
        className={
          variant === "sidebar"
            ? "h-11 min-h-11 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-op-xs font-medium text-foreground"
            : "h-11 min-h-11 min-w-0 max-w-44 rounded-xl border border-input bg-card px-2.5 text-op-xs font-medium text-foreground sm:max-w-56"
        }
        id={selectId}
        onChange={(event) => {
          const href = buildHref(pathname, {
            params: searchParams,
            organizationId: event.target.value,
            sucursalId: null,
          });
          reportarNavegacionPendiente(href);
          router.push(href);
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
 * Selector global de sucursal, debajo del de organización. Replica en cliente
 * el orden de resolución del contexto de servidor: `?sucursalId` válida →
 * cookie preferida válida → primera del alcance (las `sucursales` ya vienen
 * acotadas por la consulta de contexto). Al cambiar envía
 * `guardarSucursalPreferida`, que escribe la cookie httpOnly y redirige a la
 * misma ruta con el parámetro actualizado; `defaultValue` + `key` re-monta el
 * control cuando el servidor confirma el cambio.
 * Con una sola sucursal solo muestra su nombre; sin sucursales no se pinta.
 */
function BranchSelector({
  organizations,
  sucursalPreferidaPorOrg,
  onSucursalChange,
  variant = "compact",
}: {
  organizations: AdminShellOrganization[];
  sucursalPreferidaPorOrg: Record<string, string>;
  onSucursalChange?: (orgId: string, sucursalId: string) => void;
  variant?: "compact" | "sidebar";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectId = useId();
  const organization = useEffectiveOrganization(organizations);
  const branches = organization?.sucursales ?? [];

  if (!organization || branches.length === 0) return null;

  if (branches.length === 1) {
    const [branch] = branches;
    return (
      <span className="block truncate text-op-xs text-muted-foreground">
        {branch.nombre}
      </span>
    );
  }

  const urlSucursalId = firstParam(searchParams.get("sucursalId"));
  const clientCookieSucursalId = organization.id ? getClientSucursalCookie(organization.id) : undefined;
  const preferidaId = sucursalPreferidaPorOrg[organization.id] ?? clientCookieSucursalId;
  const currentId =
    (urlSucursalId && branches.some((branch) => branch.id === urlSucursalId)
      ? urlSucursalId
      : undefined) ??
    (preferidaId && branches.some((branch) => branch.id === preferidaId)
      ? preferidaId
      : undefined) ??
    branches[0]?.id ??
    "";

  return (
    <form
      action={guardarSucursalPreferida}
      className={variant === "sidebar" ? "block min-w-0" : "flex min-w-0 items-center"}
    >
      <input name="organizacionId" type="hidden" value={organization.id} />
      <input
        name="returnTo"
        type="hidden"
        value={`${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`}
      />
      <label
        className={
          variant === "sidebar" ? "block min-w-0" : "flex min-w-0 items-center gap-2"
        }
        htmlFor={selectId}
      >
        <span
          className={
            variant === "sidebar"
              ? "mb-1 block text-op-xs font-medium text-muted-foreground"
              : "sr-only"
          }
        >
          Sucursal
        </span>
        <select
          aria-label="Sucursal activa"
          className={
            variant === "sidebar"
              ? "h-11 min-h-11 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-op-xs font-medium text-foreground"
              : "h-11 min-h-11 min-w-0 max-w-40 rounded-xl border border-input bg-card px-2.5 text-op-xs font-medium text-foreground"
          }
          data-action-id="shell.sucursal.cambiar"
          defaultValue={currentId}
          id={selectId}
          key={`${organization.id}:${currentId}`}
          name="sucursalId"
          onChange={(event) => {
            const nuevaSucursalId = event.target.value;
            // El server action redirige a returnTo conservando todos los
            // parámetros y actualizando organizationId/sucursalId: se reporta
            // ese mismo destino para que la red de navegación lo vigile.
            if (organization.id) {
              onSucursalChange?.(organization.id, nuevaSucursalId);
              setClientSucursalCookie(organization.id, nuevaSucursalId);
              const search = new URLSearchParams(searchParams.toString());
              search.set("organizationId", organization.id);
              search.set("sucursalId", nuevaSucursalId);
              reportarNavegacionPendiente(`${pathname}?${search.toString()}`);
            }
            event.currentTarget.form?.requestSubmit();
          }}
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.nombre}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

/**
 * Segunda fila del header móvil con la sucursal activa; no se pinta cuando la
 * organización no tiene sucursales visibles.
 */
function MobileBranchRow({
  organizations,
  sucursalPreferidaPorOrg,
  onSucursalChange,
}: {
  organizations: AdminShellOrganization[];
  sucursalPreferidaPorOrg: Record<string, string>;
  onSucursalChange?: (orgId: string, sucursalId: string) => void;
}) {
  const organization = useEffectiveOrganization(organizations);
  if (!organization || (organization.sucursales ?? []).length === 0) return null;
  return (
    <div className="border-t border-sidebar-border px-4 py-2">
      <BranchSelector
        onSucursalChange={onSucursalChange}
        organizations={organizations}
        sucursalPreferidaPorOrg={sucursalPreferidaPorOrg}
      />
    </div>
  );
}

type NavWiring = {
  organizations: AdminShellOrganization[];
  platformAdmin: boolean;
  permissionsByOrg?: Record<string, string[]> | null;
  capacidadesFaltantesByOrg?: Record<string, string[]> | null;
  sucursalPreferidaPorOrg?: Record<string, string>;
};

/**
 * Resuelve la organización activa (URL o primera accesible), la sucursal activa
 * y los filtros de permisos/capacidades que alimentan sidebar y tab bar.
 */
function useNavWiring({
  organizations,
  platformAdmin,
  permissionsByOrg,
  capacidadesFaltantesByOrg,
  sucursalPreferidaPorOrg = {},
}: NavWiring) {
  const searchParams = useSearchParams();
  const organization = useEffectiveOrganization(organizations);
  const organizationId = organization?.id;
  const branches = organization?.sucursales ?? [];
  const urlSucursalId = firstParam(searchParams.get("sucursalId"));
  const clientCookieSucursalId = organizationId ? getClientSucursalCookie(organizationId) : undefined;
  const preferidaId = organizationId
    ? (sucursalPreferidaPorOrg[organizationId] ?? clientCookieSucursalId)
    : undefined;
  const sucursalId =
    (urlSucursalId && branches.some((branch) => branch.id === urlSucursalId)
      ? urlSucursalId
      : undefined) ??
    (preferidaId && branches.some((branch) => branch.id === preferidaId)
      ? preferidaId
      : undefined) ??
    branches[0]?.id;

  const permissions =
    platformAdmin || permissionsByOrg == null
      ? null
      : (organizationId ? (permissionsByOrg[organizationId] ?? []) : []);
  const capacidadesFaltantes =
    platformAdmin || capacidadesFaltantesByOrg == null
      ? null
      : (organizationId ? (capacidadesFaltantesByOrg[organizationId] ?? []) : []);
  return { organizationId, sucursalId, permissions, capacidadesFaltantes };
}

function SidebarNav({ wiring }: { wiring: NavWiring }) {
  const { organizationId, sucursalId, permissions, capacidadesFaltantes } = useNavWiring(wiring);
  return (
    <AdminSidebarNav
      capacidadesFaltantes={capacidadesFaltantes}
      organizationId={organizationId}
      permissions={permissions}
      platformAdmin={wiring.platformAdmin}
      sucursalId={sucursalId}
    />
  );
}

/** Tab bar móvil con los accesos filtrados por los permisos de la org activa. */
function ShellTabBar({ wiring }: { wiring: NavWiring }) {
  const { organizationId, sucursalId, permissions, capacidadesFaltantes } = useNavWiring(wiring);
  return (
    <AdminTabBar
      capacidadesFaltantes={capacidadesFaltantes}
      organizationId={organizationId}
      permissions={permissions}
      platformAdmin={wiring.platformAdmin}
      sucursalId={sucursalId}
    />
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("") || "·";
}

function HomeLink({ organizationId, sucursalId }: { organizationId?: string; sucursalId?: string }) {
  return (
    <a
      aria-label="Ir al inicio del panel"
      className="inline-flex min-h-11 items-center rounded-lg outline-offset-4"
      href={buildAdminHref("", { organizationId, sucursalId })}
    >
      <BrandWordmark markSize={34} />
    </a>
  );
}

/** Logo → /admin conservando la organización y sucursal activas. */
function SidebarHome({
  organizations,
  sucursalPreferidaPorOrg = {},
}: {
  organizations: AdminShellOrganization[];
  sucursalPreferidaPorOrg?: Record<string, string>;
}) {
  const searchParams = useSearchParams();
  const organization = useEffectiveOrganization(organizations);
  const organizationId = organization?.id;
  const branches = organization?.sucursales ?? [];
  const urlSucursalId = firstParam(searchParams.get("sucursalId"));
  const clientCookieSucursalId = organizationId ? getClientSucursalCookie(organizationId) : undefined;
  const preferidaId = organizationId
    ? (sucursalPreferidaPorOrg[organizationId] ?? clientCookieSucursalId)
    : undefined;
  const sucursalId =
    (urlSucursalId && branches.some((branch) => branch.id === urlSucursalId)
      ? urlSucursalId
      : undefined) ??
    (preferidaId && branches.some((branch) => branch.id === preferidaId)
      ? preferidaId
      : undefined) ??
    branches[0]?.id;

  return <HomeLink organizationId={organizationId} sucursalId={sucursalId} />;
}

/**
 * Shell visual del panel: sidebar persistente en escritorio (marca,
 * organización, navegación por secciones y cuenta) y en móvil un header
 * compacto con tab bar inferior + panel "Más".
 */
export function AdminShell({
  userName,
  userEmail,
  isPlatformAdmin,
  organizations,
  permissionsByOrg,
  billingByOrg,
  capacidadesFaltantesByOrg,
  sucursalPreferidaPorOrg = {},
  children,
}: AdminShellProps) {
  const [sucursalOverrides, setSucursalOverrides] = useState<Record<string, string>>({});
  const preferenciasSucursal = useMemo(
    () => ({ ...sucursalPreferidaPorOrg, ...sucursalOverrides }),
    [sucursalPreferidaPorOrg, sucursalOverrides],
  );

  const handleSucursalChange = useCallback((orgId: string, sucursalId: string) => {
    setSucursalOverrides((prev) => ({
      ...prev,
      [orgId]: sucursalId,
    }));
  }, []);

  const wiring: NavWiring = {
    organizations,
    platformAdmin: isPlatformAdmin,
    permissionsByOrg,
    capacidadesFaltantesByOrg,
    sucursalPreferidaPorOrg: preferenciasSucursal,
  };
  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-background text-foreground">
        {/* <Suspense fallback={null}>
          <NavigationActivity />
        </Suspense> */}
        <a
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background"
          href="#contenido-admin"
        >
          Saltar al contenido
        </a>

        {/* Sidebar de escritorio */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <div className="px-5 pb-4 pt-5">
            <Suspense fallback={<BrandWordmark markSize={34} />}>
              <SidebarHome
                organizations={organizations}
                sucursalPreferidaPorOrg={preferenciasSucursal}
              />
            </Suspense>
          </div>
          <div className="space-y-2.5 px-4 pb-4">
            <Suspense
              fallback={
                <span className="block h-11 min-h-11 animate-pulse rounded-xl bg-muted" />
              }
            >
              <OrganizationSelector organizations={organizations} variant="sidebar" />
            </Suspense>
            <Suspense fallback={null}>
              <BranchSelector
                onSucursalChange={handleSucursalChange}
                organizations={organizations}
                sucursalPreferidaPorOrg={preferenciasSucursal}
                variant="sidebar"
              />
            </Suspense>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <Suspense fallback={null}>
              <SidebarNav wiring={wiring} />
            </Suspense>
          </div>
          <div className="border-t border-sidebar-border px-3 py-3">
            <div className="flex items-center gap-2.5 px-1 pb-2">
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-op-xs font-semibold text-accent-foreground"
              >
                {initials(userName)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-medium">{userName}</p>
                <p className="truncate text-op-xs text-muted-foreground">{userEmail}</p>
              </div>
            </div>
            <ThemeModeSelector className="mb-2.5 w-full justify-center" />
            <SignOutButton />
          </div>
        </aside>

        {/* Columna de contenido */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header móvil: marca + organización */}
          <header className="sticky top-0 z-30 max-w-full overflow-x-hidden border-b border-sidebar-border bg-card/95 backdrop-blur lg:hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Suspense fallback={<BrandWordmark markSize={32} />}>
                <SidebarHome
                  organizations={organizations}
                  sucursalPreferidaPorOrg={preferenciasSucursal}
                />
              </Suspense>
              <div className="ml-auto flex min-w-0 items-center gap-3">
                <Suspense
                  fallback={
                    <span className="h-11 min-h-11 w-36 animate-pulse rounded-xl bg-muted" />
                  }
                >
                  <OrganizationSelector organizations={organizations} />
                </Suspense>
              </div>
            </div>
            <Suspense fallback={null}>
              <MobileBranchRow
                onSucursalChange={handleSucursalChange}
                organizations={organizations}
                sucursalPreferidaPorOrg={preferenciasSucursal}
              />
            </Suspense>
          </header>

          {/* Red de seguridad — ningún contenido del main puede empujar la página
              más allá del ancho del teléfono (390 px). */}
          <main
            className="mx-auto w-full max-w-[1400px] min-w-0 max-w-full flex-1 overflow-x-hidden px-2.5 pb-24 pt-2 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8"
            id="contenido-admin"
          >
            {billingByOrg ? (
              <Suspense fallback={null}>
                <SubscriptionBanner
                  billingByOrg={billingByOrg}
                  organizations={organizations}
                  permissionsByOrg={permissionsByOrg}
                />
              </Suspense>
            ) : null}
            {children}
          </main>
        </div>

        <Suspense fallback={null}>
          <ShellTabBar wiring={wiring} />
        </Suspense>
        <PoseTimerBar />
      </div>
    </ToastProvider>
  );
}
