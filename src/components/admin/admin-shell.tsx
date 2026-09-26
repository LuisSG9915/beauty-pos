"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AdminSidebarNav, AdminTabBar, SignOutButton } from "@/components/admin-nav";
import {
  SubscriptionBanner,
  type BillingBadge,
} from "@/components/admin/subscription-banner";
import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { ToastProvider } from "@/components/ui/toast";
import { trackPerformance } from "@/lib/telemetry/cliente";
import { buildAdminHref, buildHref, firstParam } from "@/lib/url-context";

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
  /** Capacidades ausentes del plan vigente por organización (ocultan accesos). */
  capacidadesFaltantesByOrg?: Record<string, string[]> | null;
  children: ReactNode;
};

/**
 * Selector de organización del shell. Lee `organizationId` de la URL (o la
 * primera organización disponible) y navega conservando los demás
 * parámetros; `sucursalId` se descarta porque depende de la organización.
 * `variant="sidebar"` lo rinde como bloque de ancho completo.
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
  const urlOrganizationId = firstParam(searchParams.get("organizationId"));
  const currentId =
    urlOrganizationId &&
    organizations.some((organization) => organization.id === urlOrganizationId)
      ? urlOrganizationId
      : (organizations[0]?.id ?? "");

  if (organizations.length === 0) {
    return (
      <span className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground">
        Sin organización asignada
      </span>
    );
  }

  if (organizations.length === 1) {
    const [organization] = organizations;
    return (
      <span
        className={
          variant === "sidebar"
            ? "block truncate rounded-xl border border-border bg-muted px-3 py-2 text-xs font-medium text-accent-foreground"
            : "inline-flex max-w-48 items-center truncate rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-medium text-accent-foreground"
        }
      >
        {organization.nombre}
      </span>
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
      <span
        className={
          variant === "sidebar"
            ? "mb-1 block text-op-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            : "hidden text-xs font-medium text-muted-foreground sm:inline"
        }
      >
        Organización
      </span>
      <select
        aria-label="Organización activa"
        className={
          variant === "sidebar"
            ? "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-2.5 text-xs font-medium text-foreground"
            : "h-10 min-w-0 max-w-44 rounded-xl border border-input bg-card px-2.5 text-xs font-medium text-foreground sm:max-w-56"
        }
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

type NavWiring = {
  organizations: AdminShellOrganization[];
  platformAdmin: boolean;
  permissionsByOrg?: Record<string, string[]> | null;
  capacidadesFaltantesByOrg?: Record<string, string[]> | null;
};

/**
 * Resuelve la organización activa (URL o primera accesible) y los filtros
 * de permisos/capacidades que alimentan sidebar y tab bar.
 */
function useNavWiring({
  organizations,
  platformAdmin,
  permissionsByOrg,
  capacidadesFaltantesByOrg,
}: NavWiring) {
  const searchParams = useSearchParams();
  const organizationId =
    firstParam(searchParams.get("organizationId")) ?? organizations[0]?.id;
  const permissions =
    platformAdmin || permissionsByOrg == null
      ? null
      : (organizationId ? (permissionsByOrg[organizationId] ?? []) : []);
  const capacidadesFaltantes =
    platformAdmin || capacidadesFaltantesByOrg == null
      ? null
      : (organizationId ? (capacidadesFaltantesByOrg[organizationId] ?? []) : []);
  return { organizationId, permissions, capacidadesFaltantes };
}

function SidebarNav({ wiring }: { wiring: NavWiring }) {
  const { organizationId, permissions, capacidadesFaltantes } = useNavWiring(wiring);
  return (
    <AdminSidebarNav
      capacidadesFaltantes={capacidadesFaltantes}
      organizationId={organizationId}
      permissions={permissions}
      platformAdmin={wiring.platformAdmin}
    />
  );
}

/** Tab bar móvil con los accesos filtrados por los permisos de la org activa. */
function ShellTabBar({ wiring }: { wiring: NavWiring }) {
  const { organizationId, permissions, capacidadesFaltantes } = useNavWiring(wiring);
  return (
    <AdminTabBar
      capacidadesFaltantes={capacidadesFaltantes}
      organizationId={organizationId}
      permissions={permissions}
      platformAdmin={wiring.platformAdmin}
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

const NAVIGATION_TIMEOUT_MS = 10_000;

/**
 * Barra de progreso persistente para navegaciones del App Router. El shell no
 * se desmonta entre rutas, así que puede confirmar el toque aunque el destino
 * tarde en resolver sus datos.
 */
function NavigationActivity() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const targetPath = useRef<string | null>(null);
  const targetKey = useRef<string | null>(null);
  const tapTimes = useRef(new WeakMap<HTMLAnchorElement, number>());
  const timeoutRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const feedbackSent = useRef(false);

  const finish = useCallback((completed: boolean) => {
    if (startedAt.current === null) return;
    const elapsed = performance.now() - startedAt.current;
    trackPerformance(
      completed ? "nav_complete_ms" : "nav_timeout_ms",
      elapsed,
      targetPath.current ?? undefined,
    );
    startedAt.current = null;
    targetPath.current = null;
    targetKey.current = null;
    setPendingLabel(null);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    timeoutRef.current = null;
    frameRef.current = null;
  }, []);

  useEffect(() => {
    finish(true);
  }, [finish, pathname, searchKey]);

  useEffect(() => {
    const onClick = (event: globalThis.MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) {
        return;
      }
      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      const key = `${url.pathname}${url.search}`;
      const now = Date.now();
      const lastGlobalTap = tapTimes.current.get(anchor) ?? 0;
      if (
        now - lastGlobalTap < 800 ||
        (startedAt.current !== null && targetKey.current === key)
      ) {
        // En capture todavía no corre el onClick de Next Link; prevenir aquí
        // evita que un segundo toque encole la misma navegación.
        event.preventDefault();
        return;
      }
      tapTimes.current.set(anchor, now);

      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      feedbackSent.current = false;
      startedAt.current = performance.now();
      targetPath.current = url.pathname;
      targetKey.current = key;
      const label = anchor.textContent?.replace(/\s+/g, " ").trim().slice(0, 40) || "sección";
      setPendingLabel(label);

      frameRef.current = window.requestAnimationFrame(() => {
        if (startedAt.current === null || feedbackSent.current) return;
        trackPerformance(
          "nav_feedback_ms",
          performance.now() - startedAt.current,
          targetPath.current ?? undefined,
        );
        feedbackSent.current = true;
      });
      timeoutRef.current = window.setTimeout(() => finish(false), NAVIGATION_TIMEOUT_MS);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, [finish]);

  return (
    <>
      {pendingLabel ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden bg-primary/15"
        >
          <span className="admin-nav-progress block h-full w-1/3 bg-primary" />
        </div>
      ) : null}
      <span className="sr-only" data-navigation-activity="ready" role="status">
        {pendingLabel ? `Abriendo ${pendingLabel}…` : ""}
      </span>
    </>
  );
}

function HomeLink({ organizationId }: { organizationId?: string }) {
  return (
    <Link
      className="inline-flex rounded-lg outline-offset-4"
      href={buildAdminHref("", { organizationId })}
      prefetch={false}
    >
      <BrandWordmark markSize={34} />
    </Link>
  );
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
  children,
}: AdminShellProps) {
  const wiring: NavWiring = {
    organizations,
    platformAdmin: isPlatformAdmin,
    permissionsByOrg,
    capacidadesFaltantesByOrg,
  };
  return (
    <ToastProvider>
      <div className="flex min-h-dvh bg-background text-foreground">
        <Suspense fallback={null}>
          <NavigationActivity />
        </Suspense>
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
              <SidebarHome organizations={organizations} />
            </Suspense>
          </div>
          <div className="px-4 pb-4">
            <Suspense
              fallback={
                <span className="block h-10 animate-pulse rounded-xl bg-muted" />
              }
            >
              <OrganizationSelector organizations={organizations} variant="sidebar" />
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
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
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
          <header className="sticky top-0 z-40 border-b border-sidebar-border bg-card/95 backdrop-blur lg:hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Suspense fallback={<BrandWordmark markSize={32} />}>
                <SidebarHome organizations={organizations} />
              </Suspense>
              <div className="ml-auto flex min-w-0 items-center gap-3">
                <Suspense
                  fallback={
                    <span className="h-10 w-36 animate-pulse rounded-xl bg-muted" />
                  }
                >
                  <OrganizationSelector organizations={organizations} />
                </Suspense>
              </div>
            </div>
          </header>

          {/* overflow-x-clip: red de seguridad — ningún contenido del main
              puede empujar la página más allá del ancho del teléfono. `clip`
              no crea contexto de scroll, así que los sticky internos siguen
              funcionando. */}
          <main
            className="mx-auto w-full max-w-[1400px] flex-1 overflow-x-clip px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8"
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
        </div>

        <Suspense fallback={null}>
          <ShellTabBar wiring={wiring} />
        </Suspense>
      </div>
    </ToastProvider>
  );
}

/** Logo → /admin conservando la organización activa. */
function SidebarHome({ organizations }: { organizations: AdminShellOrganization[] }) {
  const searchParams = useSearchParams();
  const organizationId =
    firstParam(searchParams.get("organizationId")) ?? organizations[0]?.id;
  return <HomeLink organizationId={organizationId} />;
}
