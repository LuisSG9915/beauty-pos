"use client";

import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  Boxes,
  Calendar,
  CalendarCheck,
  ChevronDown,
  Clipboard,
  CreditCard,
  Crown,
  FileText,
  Gem,
  HandCoins,
  Building2,
  Landmark,
  LifeBuoy,
  LogOut,
  Map,
  Menu,
  Package,
  PackageCheck,
  Percent,
  ReceiptText,
  Ruler,
  Scissors,
  ScrollText,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Tags,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type MouseEvent } from "react";

import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth/client";
import { buildAdminHref, firstParam } from "@/lib/url-context";
import { cn } from "@/lib/utils";

export type AdminNavItem = {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Permiso(s) requerido(s) para ver el acceso; array = cualquiera. */
  permiso?: string | readonly string[];
  /** Capacidad de plan requerida; se oculta cuando el plan vigente no la incluye. */
  capacidad?: string;
  /** Precarga la ruta al entrar el enlace en pantalla (solo flujos diarios). */
  prefetch?: boolean;
  /** Rutas que también deben activar este ítem o grupo. */
  matchPaths?: string[];
  /** Sub-ítems anidados dentro de este centro de mando. */
  children?: AdminNavItem[];
};

export type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
  /** Sección plegable: se muestra contraída salvo que contenga la ruta activa. */
  collapsible?: boolean;
};

const OPERACION: AdminNavItem[] = [
  {
    path: "/admin/agenda",
    label: "Agenda",
    description: "Citas, estados y venta en proceso",
    icon: Calendar,
    permiso: "agenda.ver",
    prefetch: true,
  },
  {
    path: "/admin/mi-dia",
    label: "Mi día",
    description: "Tus citas, propinas y comisiones de hoy",
    icon: CalendarCheck,
    permiso: "agenda.ver",
    prefetch: true,
  },
  {
    path: "/admin/pos",
    label: "Caja & Ventas",
    description: "Terminal POS, historial y caja",
    icon: ShoppingCart,
    permiso: ["ventas.ver", "caja.ver"],
    prefetch: true,
    matchPaths: ["/admin/pos", "/admin/ventas", "/admin/caja"],
    children: [
      {
        path: "/admin/pos",
        label: "Terminal POS",
        description: "Cobro rápido y tickets en proceso",
        icon: ShoppingCart,
        permiso: "ventas.ver",
      },
      {
        path: "/admin/ventas",
        label: "Historial de ventas",
        description: "Búsqueda de tickets y cancelaciones",
        icon: ReceiptText,
        permiso: "ventas.ver",
      },
      {
        path: "/admin/caja",
        label: "Caja y turnos",
        description: "Apertura, cierre ciego y discrepancias",
        icon: Wallet,
        permiso: "caja.ver",
      },
    ],
  },
];

const CATALOGO_STOCK: AdminNavItem[] = [
  {
    path: "/admin/clientes",
    label: "Clientes",
    description: "Expedientes, contacto y seguimiento",
    icon: Users,
    permiso: "clientes.ver",
  },
  {
    path: "/admin/servicios",
    label: "Catálogo",
    description: "Servicios, productos, paquetes y promociones",
    icon: Scissors,
    permiso: "catalogos.ver",
    matchPaths: [
      "/admin/servicios",
      "/admin/productos",
      "/admin/paquetes",
      "/admin/membresias",
      "/admin/promociones",
    ],
    children: [
      {
        path: "/admin/servicios",
        label: "Servicios",
        description: "Catálogo de servicios del salón",
        icon: Scissors,
        permiso: "catalogos.ver",
      },
      {
        path: "/admin/productos",
        label: "Productos",
        description: "Venta, consumo e inventario",
        icon: ShoppingBag,
        permiso: "catalogos.ver",
      },
      {
        path: "/admin/paquetes",
        label: "Paquetes",
        description: "Sesiones prepagadas por servicio",
        icon: PackageCheck,
        permiso: "catalogos.ver",
        capacidad: "paquetes",
      },
      {
        path: "/admin/membresias",
        label: "Membresías",
        description: "Descuento por vigencia para clientes",
        icon: Crown,
        permiso: "catalogos.ver",
        capacidad: "membresias",
      },
      {
        path: "/admin/promociones",
        label: "Promociones",
        description: "Descuentos, 2x1 y paquetes",
        icon: Clipboard,
        permiso: "catalogos.ver",
        capacidad: "promociones",
      },
    ],
  },
  {
    path: "/admin/inventario",
    label: "Inventario",
    description: "Stock, compras a proveedores y mapa del salón",
    icon: Package,
    permiso: ["inventario.ver", "compras.ver"],
    matchPaths: ["/admin/inventario", "/admin/compras", "/admin/plano"],
    children: [
      {
        path: "/admin/inventario",
        label: "Stock y movimientos",
        description: "Entradas, salidas y existencias",
        icon: Package,
        permiso: "inventario.ver",
      },
      {
        path: "/admin/compras",
        label: "Compras",
        description: "Tickets de proveedores y recepción",
        icon: Truck,
        permiso: "compras.ver",
      },
      {
        path: "/admin/plano",
        label: "Plano del salón",
        description: "Ubicaciones de mercancía y muebles",
        icon: Map,
        permiso: "inventario.ver",
      },
    ],
  },
];

const EQUIPO_SECCION: AdminNavItem[] = [
  {
    path: "/admin/usuarios",
    label: "Equipo",
    description: "Colaboradores, comisiones, roles y sucursales",
    icon: Users,
    permiso: ["usuarios.ver", "comisiones.ver", "roles.ver", "sucursales.ver"],
    matchPaths: ["/admin/usuarios", "/admin/comisiones", "/admin/roles", "/admin/sucursales"],
    children: [
      {
        path: "/admin/usuarios",
        label: "Colaboradores",
        description: "Miembros, roles y asignaciones",
        icon: Users,
        permiso: "usuarios.ver",
      },
      {
        path: "/admin/comisiones",
        label: "Comisiones",
        description: "Pago de comisiones al equipo",
        icon: HandCoins,
        permiso: "comisiones.ver",
        capacidad: "comisiones",
      },
      {
        path: "/admin/roles",
        label: "Roles y permisos",
        description: "Permisos por rol",
        icon: ShieldCheck,
        permiso: "roles.ver",
      },
      {
        path: "/admin/sucursales",
        label: "Sucursales",
        description: "Alta y políticas de sucursal",
        icon: Building2,
        permiso: "sucursales.ver",
      },
    ],
  },
];

const FINANZAS_ADMIN: AdminNavItem[] = [
  {
    path: "/admin/gastos",
    label: "Gastos",
    description: "Salidas del negocio por categoría y medio",
    icon: Banknote,
    permiso: "gastos.ver",
    capacidad: "gastos",
  },
  {
    path: "/admin/reportes",
    label: "Reportes",
    description: "Operativos y financieros por rango",
    icon: BarChart3,
    permiso: ["reportes.operativos", "reportes.financieros"],
    capacidad: "reportes_avanzados",
  },
  {
    path: "/admin/facturacion",
    label: "Comprobantes",
    description: "Comprobantes internos de ventas",
    icon: FileText,
    permiso: "facturacion.ver",
  },
  {
    path: "/admin/categorias-servicios",
    label: "Ajustes de catálogo",
    description: "Categorías, unidades, medios de pago e impuestos",
    icon: Tags,
    permiso: "catalogos.ver",
    matchPaths: [
      "/admin/categorias-servicios",
      "/admin/categorias-productos",
      "/admin/unidades-medida",
      "/admin/medios-pago",
      "/admin/impuestos",
    ],
    children: [
      {
        path: "/admin/categorias-servicios",
        label: "Tipos de servicio",
        description: "Agrupa los servicios",
        icon: Tags,
        permiso: "catalogos.ver",
      },
      {
        path: "/admin/categorias-productos",
        label: "Tipos de producto",
        description: "Agrupa productos e insumos",
        icon: Boxes,
        permiso: "catalogos.ver",
      },
      {
        path: "/admin/unidades-medida",
        label: "Unidades de medida",
        description: "Pieza, litro, gramo, etc.",
        icon: Ruler,
        permiso: "catalogos.ver",
      },
      {
        path: "/admin/medios-pago",
        label: "Medios de pago",
        description: "Efectivo, tarjeta, transferencia",
        icon: CreditCard,
        permiso: "catalogos.ver",
      },
      {
        path: "/admin/impuestos",
        label: "Impuestos",
        description: "IVA, IEPS y configuración",
        icon: Percent,
        permiso: "catalogos.ver",
      },
    ],
  },
  {
    path: "/admin/auditoria",
    label: "Bitácora",
    description: "Historial de cambios del negocio",
    icon: ScrollText,
    permiso: "auditoria.ver",
    capacidad: "auditoria",
  },
  {
    path: "/admin/suscripcion",
    label: "Suscripción",
    description: "Plan, uso y pagos del negocio",
    icon: Gem,
    permiso: "organizaciones.ver",
  },
];

const PLATAFORMA: AdminNavItem[] = [
  { path: "/admin", label: "Plataforma", description: "Organizaciones y sucursales", icon: Landmark },
  { path: "/admin/incidentes", label: "Incidentes", description: "Errores reportados y su resolución", icon: AlertTriangle },
  { path: "/admin/telemetria", label: "Telemetría", description: "Uso del producto y rendimiento", icon: Activity },
];

const AYUDA: AdminNavItem[] = [
  { path: "/admin/ayuda", label: "Ayuda", description: "Guía, práctica y soporte", icon: LifeBuoy },
];

/** `/admin/…` → `/…` para usarlo con `buildAdminHref`. */
function toAdminPath(path: string): `/${string}` | "" {
  return path.replace("/admin", "") as `/${string}` | "";
}

/** `permiso` simple o lista (cualquiera) contra el set efectivo del usuario. */
function tienePermiso(permiso: AdminNavItem["permiso"], permissions: ReadonlySet<string>): boolean {
  if (!permiso) return true;
  return Array.isArray(permiso)
    ? (permiso as readonly string[]).some((clave) => permissions.has(clave))
    : permissions.has(permiso as string);
}

function filterItem(
  item: AdminNavItem,
  permissions: ReadonlySet<string> | null,
  capacidadesFaltantes: ReadonlySet<string> | null,
): AdminNavItem | null {
  const visibleChildren = item.children
    ? item.children
        .map((child) => filterItem(child, permissions, capacidadesFaltantes))
        .filter((child): child is AdminNavItem => child !== null)
    : undefined;

  const itemAllowed =
    (permissions === null || tienePermiso(item.permiso, permissions)) &&
    !(item.capacidad && capacidadesFaltantes?.has(item.capacidad));

  if (itemAllowed || (visibleChildren && visibleChildren.length > 0)) {
    return {
      ...item,
      path: itemAllowed ? item.path : (visibleChildren?.[0]?.path ?? item.path),
      children: visibleChildren && visibleChildren.length > 0 ? visibleChildren : undefined,
    };
  }

  return null;
}

/**
 * Secciones visibles según los permisos del usuario en la organización
 * activa. `permissions === null` desactiva el filtro (admin de plataforma).
 * Los flujos de operación, catálogo y equipo quedan agrupados en centros de
 * mando claros; administración y ajustes se pliegan abajo.
 */
export function getAdminNavSections(
  platformAdmin = false,
  permissions: ReadonlySet<string> | null = null,
  capacidadesFaltantes: ReadonlySet<string> | null = null,
): AdminNavSection[] {
  const visible = (items: AdminNavItem[]): AdminNavItem[] =>
    items
      .map((item) => filterItem(item, permissions, capacidadesFaltantes))
      .filter((item): item is AdminNavItem => item !== null);

  const sections: AdminNavSection[] = [
    { title: "Operación", items: visible(OPERACION) },
    { title: "Catálogo y existencias", items: visible(CATALOGO_STOCK) },
    { title: "Equipo", items: visible(EQUIPO_SECCION) },
    {
      title: "Finanzas y ajustes",
      items: visible(FINANZAS_ADMIN),
      collapsible: true,
    },
    { title: "Ayuda", items: visible(AYUDA) },
  ].filter((section) => section.items.length > 0);
  if (platformAdmin) sections.push({ title: "Plataforma", items: PLATAFORMA });
  return sections;
}

function isItemActive(pathname: string, itemPath: string, matchPaths?: string[]): boolean {
  if (matchPaths?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  if (itemPath === "/admin") return pathname === "/admin";
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

function isItemOrChildActive(pathname: string, item: AdminNavItem): boolean {
  if (isItemActive(pathname, item.path, item.matchPaths)) return true;
  return item.children?.some((c) => isItemActive(pathname, c.path, c.matchPaths)) ?? false;
}

type NavContext = {
  organizationId?: string;
  sucursalId?: string;
  platformAdmin?: boolean;
  activePath?: string;
  /** Permisos de la org activa; null = sin filtro (plataforma). */
  permissions?: readonly string[] | null;
  /** Capacidades que el plan vigente NO incluye; esos accesos se ocultan. */
  capacidadesFaltantes?: readonly string[] | null;
};

function useNavContext({ organizationId, sucursalId, activePath }: NavContext) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return {
    pathname: activePath ?? pathname,
    organizationId:
      organizationId ?? firstParam(searchParams.get("organizationId")),
    sucursalId: sucursalId ?? firstParam(searchParams.get("sucursalId")),
  };
}

function toPermissionSet(permissions: readonly string[] | null | undefined) {
  return permissions === null || permissions === undefined ? null : new Set(permissions);
}

function navItemClasses(isActive: boolean) {
  return cn(
    "relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
    isActive
      ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary"
      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
  );
}

function navIconClasses(isActive: boolean) {
  return cn("size-4.5 shrink-0", isActive ? "text-sidebar-primary" : "text-muted-foreground");
}

const NAV_TAP_GUARD_MS = 500;

/**
 * Guarda contra dobles toques táctiles: el primero inicia la navegación y los
 * siguientes dentro del umbral se ignoran sin cancelar el recorrido en curso.
 */
function guardNavTap(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const now = Date.now();
  const lastTap = Number(event.currentTarget.dataset.navTapAt ?? "0");
  if (now - lastTap < NAV_TAP_GUARD_MS) {
    event.preventDefault();
    return;
  }
  event.currentTarget.dataset.navTapAt = String(now);
}

/** Punto fijo + anuncio accesible mientras el `Link` está pendiente. */
function LinkPendingIndicator({
  compact = false,
  label,
}: {
  compact?: boolean;
  label: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute rounded-full bg-primary opacity-0 transition-opacity data-[pending=true]:opacity-100",
          compact ? "right-1.5 top-1.5 size-1.5" : "right-2 top-2 size-2",
        )}
        data-pending={pending}
      />
      <span className="sr-only" role="status">
        {pending ? `Abriendo ${label}…` : ""}
      </span>
    </>
  );
}

function NavItemRow({
  item,
  pathname,
  organizationId,
  sucursalId,
  onNavigate,
}: {
  item: AdminNavItem;
  pathname: string;
  organizationId?: string;
  sucursalId?: string;
  onNavigate?: () => void;
}) {
  const [desplegado, setDesplegado] = useState<boolean | null>(null);
  const estaActivoDirecto = isItemActive(pathname, item.path);
  const estaEnSeccion = isItemOrChildActive(pathname, item);
  const tieneHijos = Boolean(item.children && item.children.length > 0);
  const abierto = tieneHijos && (desplegado ?? estaEnSeccion);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-0.5">
        <Link
          aria-current={estaActivoDirecto ? "page" : undefined}
          className={cn(navItemClasses(estaActivoDirecto || (estaEnSeccion && !tieneHijos)), "flex-1")}
          href={buildAdminHref(toAdminPath(item.path), { organizationId, sucursalId })}
          onClick={(event) => {
            guardNavTap(event);
            if (!event.defaultPrevented) onNavigate?.();
          }}
          prefetch={item.prefetch ?? false}
          title={item.description}
        >
          <item.icon
            aria-hidden="true"
            className={navIconClasses(estaActivoDirecto || estaEnSeccion)}
            strokeWidth={estaActivoDirecto || estaEnSeccion ? 2 : 1.8}
          />
          <span className="flex-1 truncate">{item.label}</span>
          <LinkPendingIndicator label={item.label} />
        </Link>
        {tieneHijos ? (
          <button
            aria-expanded={abierto}
            aria-label={`Sub-opciones de ${item.label}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDesplegado(!abierto);
            }}
            type="button"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3.5 transition-transform duration-200", abierto ? "rotate-0" : "-rotate-90")}
            />
          </button>
        ) : null}
      </div>

      {tieneHijos && abierto ? (
        <ul className="ml-4 border-l-2 border-border/60 pl-2 space-y-0.5">
          {item.children!.map((child) => {
            const isChildActive = isItemActive(pathname, child.path, child.matchPaths);
            return (
              <li key={child.path}>
                <Link
                  aria-current={isChildActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-8 items-center gap-2 rounded-xl px-2.5 text-op-xs transition-colors",
                    isChildActive
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                  href={buildAdminHref(toAdminPath(child.path), { organizationId, sucursalId })}
                  onClick={(event) => {
                    guardNavTap(event);
                    if (!event.defaultPrevented) onNavigate?.();
                  }}
                  prefetch={child.prefetch ?? false}
                  title={child.description}
                >
                  <child.icon
                    aria-hidden="true"
                    className={cn("size-3.5 shrink-0", isChildActive ? "text-primary" : "text-muted-foreground")}
                    strokeWidth={isChildActive ? 2 : 1.8}
                  />
                  <span className="truncate">{child.label}</span>
                  <LinkPendingIndicator compact label={child.label} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Sección del sidebar; las plegables se abren solas si contienen la ruta activa. */
function SidebarSection({
  section,
  pathname,
  organizationId,
  sucursalId,
  onNavigate,
}: {
  section: AdminNavSection;
  pathname: string;
  organizationId?: string;
  sucursalId?: string;
  onNavigate?: () => void;
}) {
  const [manual, setManual] = useState<boolean | null>(null);
  // Plegable arranca cerrada salvo que contenga la ruta activa o un hijo activo.
  const contieneActiva = section.items.some((item) => isItemOrChildActive(pathname, item));
  const abierta = !section.collapsible || (manual ?? contieneActiva);

  const items = (
    <ul className="mt-1 space-y-0.5">
      {section.items.map((item) => (
        <li key={item.path}>
          <NavItemRow
            item={item}
            onNavigate={onNavigate}
            organizationId={organizationId}
            pathname={pathname}
            sucursalId={sucursalId}
          />
        </li>
      ))}
    </ul>
  );

  if (!section.collapsible) {
    return (
      <section aria-label={section.title}>
        <h3 className="px-3 text-op-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {section.title}
        </h3>
        {items}
      </section>
    );
  }

  return (
    <section aria-label={section.title}>
      <button
        aria-expanded={abierta}
        className="flex min-h-8 w-full items-center justify-between rounded-lg px-3 text-op-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary"
        onClick={() => setManual(!abierta)}
        type="button"
      >
        {section.title}
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3.5 transition-transform", abierta ? "rotate-0" : "-rotate-90")}
        />
      </button>
      {abierta ? items : null}
    </section>
  );
}

/**
 * Navegación lateral (sidebar de escritorio y panel "Más" del tab bar móvil).
 * Conserva `organizationId`/`sucursalId` en cada enlace.
 */
export function AdminSidebarNav({
  organizationId,
  sucursalId,
  platformAdmin = false,
  activePath,
  permissions,
  capacidadesFaltantes,
  onNavigate,
}: NavContext & { onNavigate?: () => void }) {
  const context = useNavContext({ organizationId, sucursalId, activePath });
  const sections = getAdminNavSections(
    platformAdmin,
    toPermissionSet(permissions),
    capacidadesFaltantes ? new Set(capacidadesFaltantes) : null,
  );

  return (
    <nav aria-label="Navegación del panel" className="space-y-5">
      {sections.map((section) => (
        <SidebarSection
          key={section.title}
          onNavigate={onNavigate}
          organizationId={context.organizationId}
          pathname={context.pathname}
          section={section}
          sucursalId={context.sucursalId}
        />
      ))}
    </nav>
  );
}

/** Botón de cierre de sesión compartido entre el sidebar y el panel móvil. */
export function SignOutButton({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);
  return (
    <button
      className={cn(
        "flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
        className,
      )}
      data-action-id="nav.cerrar_sesion"
      disabled={saliendo}
      onClick={async () => {
        setSaliendo(true);
        onNavigate?.();
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
      type="button"
    >
      <LogOut aria-hidden="true" className="size-4.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
      {saliendo ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}

/** Accesos operativos del tab bar móvil (solo los flujos del día a día). */
const TAB_BAR: AdminNavItem[] = [OPERACION[0], OPERACION[1], OPERACION[2]];

/**
 * Tab bar inferior para teléfono/tablet (<lg): Agenda · Mi día · Cobrar + "Más"
 * que abre la navegación completa en un panel lateral. Targets de 56 px.
 */
export function AdminTabBar({ organizationId, sucursalId, activePath, permissions, capacidadesFaltantes, platformAdmin }: NavContext) {
  const context = useNavContext({ organizationId, sucursalId, activePath });
  const permissionSet = toPermissionSet(permissions);
  const [masAbierto, setMasAbierto] = useState(false);
  const items = permissionSet === null
    ? TAB_BAR
    : TAB_BAR.filter((item) => tienePermiso(item.permiso, permissionSet));
  return (
    <>
      <nav
        aria-label="Accesos rápidos"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      >
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}
        >
          {items.map((item) => {
            const isActive = isItemActive(context.pathname, item.path);
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-op-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-primary",
                )}
                data-action-id="nav.tab"
                href={buildAdminHref(toAdminPath(item.path), {
                  organizationId: context.organizationId,
                  sucursalId: context.sucursalId,
                })}
                key={item.path}
                onClick={guardNavTap}
              >
                <item.icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.2 : 1.8} />
                {item.label}
                <LinkPendingIndicator compact label={item.label} />
              </Link>
            );
          })}
          <button
            aria-expanded={masAbierto}
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-op-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            data-action-id="nav.mas_abrir"
            onClick={() => setMasAbierto(true)}
            type="button"
          >
            <Menu aria-hidden="true" className="size-5" strokeWidth={1.8} />
            Más
          </button>
        </div>
      </nav>

      <Sheet onOpenChange={setMasAbierto} open={masAbierto}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              <BrandWordmark markSize={32} />
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <AdminSidebarNav
              activePath={context.pathname}
              capacidadesFaltantes={capacidadesFaltantes}
              onNavigate={() => setMasAbierto(false)}
              organizationId={context.organizationId}
              permissions={permissions}
              platformAdmin={platformAdmin}
              sucursalId={context.sucursalId}
            />
          </div>
          <div className="border-t border-border pt-3">
            <ThemeModeSelector className="mb-2 w-full justify-center" />
            <SignOutButton onNavigate={() => setMasAbierto(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
