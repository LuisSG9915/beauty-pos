"use client";

import {
  Building2,
  Clipboard,
  Crown,
  HandCoins,
  Package,
  PackageCheck,
  ReceiptText,
  Scissors,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { buildAdminHref, firstParam } from "@/lib/url-context";
import { cn } from "@/lib/utils";

export type AdminNavTabItem = {
  path: `/${string}` | "";
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
  badgeTone?: "default" | "success" | "warning";
};

export function AdminNavTabs({
  tabs,
  organizationId,
  sucursalId,
  className,
}: {
  tabs: AdminNavTabItem[];
  organizationId?: string;
  sucursalId?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const effectiveOrganizationId = organizationId ?? firstParam(searchParams.get("organizationId"));
  const effectiveSucursalId = sucursalId ?? firstParam(searchParams.get("sucursalId"));

  return (
    <nav
      aria-label="Sub-navegación de módulo"
      className={cn(
        "inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border/80 bg-muted/40 p-1 shadow-2xs backdrop-blur-xs",
        className,
      )}
    >
      {tabs.map((tab) => {
        const fullAdminPath = `/admin${tab.path}`;
        const isActive =
          pathname === fullAdminPath || pathname.startsWith(`${fullAdminPath}/`);
        const Icon = tab.icon;

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all duration-200 select-none active:scale-[0.97]",
              isActive
                ? "bg-card font-semibold text-foreground shadow-xs border border-border/80"
                : "text-muted-foreground hover:bg-card/40 hover:text-foreground",
            )}
            href={buildAdminHref(tab.path, {
              organizationId: effectiveOrganizationId,
              sucursalId: effectiveSucursalId,
            })}
            key={tab.path}
          >
            {Icon ? (
              <Icon
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              />
            ) : null}
            <span>{tab.label}</span>
            {tab.badge !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  tab.badgeTone === "success"
                    ? "bg-success/15 text-success"
                    : tab.badgeTone === "warning"
                      ? "bg-warning/15 text-warning"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {tab.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Pestañas para el centro de control de Caja & Ventas. */
export const CAJA_VENTAS_TABS: AdminNavTabItem[] = [
  { path: "/pos", label: "Terminal POS", icon: ShoppingCart },
  { path: "/ventas", label: "Historial de ventas", icon: ReceiptText },
  { path: "/caja", label: "Caja y turnos", icon: Wallet },
];

/** Pestañas para el centro de control de Catálogo e Inventario. */
export const CATALOGO_TABS: AdminNavTabItem[] = [
  { path: "/servicios", label: "Servicios", icon: Scissors },
  { path: "/productos", label: "Productos", icon: ShoppingBag },
  { path: "/inventario", label: "Inventario", icon: Package },
  { path: "/paquetes", label: "Paquetes", icon: PackageCheck },
  { path: "/membresias", label: "Membresías", icon: Crown },
  { path: "/promociones", label: "Promociones", icon: Clipboard },
];

/** Pestañas para el centro de control de Equipo y Sucursales. */
export const EQUIPO_TABS: AdminNavTabItem[] = [
  { path: "/usuarios", label: "Colaboradores", icon: Users },
  { path: "/comisiones", label: "Comisiones", icon: HandCoins },
  { path: "/roles", label: "Roles", icon: ShieldCheck },
  { path: "/sucursales", label: "Sucursales", icon: Building2 },
];
