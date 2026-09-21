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
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { BrandWordmark } from "@/components/brand-mark";
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
};

export type AdminNavSection = {
  title: string;
  items: AdminNavItem[];
  /** Sección plegable: se muestra contraída salvo que contenga la ruta activa. */
  collapsible?: boolean;
};

const OPERACION: AdminNavItem[] = [
  { path: "/admin/agenda", label: "Agenda", description: "Citas, estados y venta en proceso", icon: Calendar, permiso: "agenda.ver" },
  { path: "/admin/mi-dia", label: "Mi día", description: "Tus citas, propinas y comisiones de hoy", icon: CalendarCheck, permiso: "agenda.ver" },
  { path: "/admin/pos", label: "Cobrar", description: "Ventas directas y cobro de citas", icon: ShoppingCart, permiso: "ventas.ver" },
  { path: "/admin/ventas", label: "Historial", description: "Busca tickets, devoluciones y cancelaciones", icon: ReceiptText, permiso: "ventas.ver" },
  { path: "/admin/caja", label: "Caja", description: "Apertura, cierre ciego y discrepancias", icon: Wallet, permiso: "caja.ver" },
];

const CLIENTES_CATALOGO: AdminNavItem[] = [
  { path: "/admin/clientes", label: "Clientes", description: "Expedientes, contacto y seguimiento", icon: Users, permiso: "clientes.ver" },
  { path: "/admin/servicios", label: "Servicios", description: "Catálogo de servicios del salón", icon: Scissors, permiso: "catalogos.ver" },
  { path: "/admin/productos", label: "Productos", description: "Venta, consumo e inventario", icon: ShoppingBag, permiso: "catalogos.ver" },
  { path: "/admin/inventario", label: "Inventario", description: "Stock, entradas, salidas y consumos", icon: Package, permiso: "inventario.ver" },
  { path: "/admin/facturacion", label: "Comprobantes", description: "Comprobantes internos de ventas", icon: FileText, permiso: "facturacion.ver" },
];

const CATALOGOS: AdminNavItem[] = [
  { path: "/admin/categorias-servicios", label: "Tipos de servicio", description: "Agrupa los servicios", icon: Tags, permiso: "catalogos.ver" },
  { path: "/admin/categorias-productos", label: "Tipos de producto", description: "Agrupa productos e insumos", icon: Boxes, permiso: "catalogos.ver" },
  { path: "/admin/unidades-medida", label: "Unidades de medida", description: "Pieza, litro, gramo, etc.", icon: Ruler, permiso: "catalogos.ver" },
  { path: "/admin/medios-pago", label: "Medios de pago", description: "Efectivo, tarjeta, transferencia", icon: CreditCard, permiso: "catalogos.ver" },
  { path: "/admin/impuestos", label: "Impuestos", description: "IVA, IEPS y configuración", icon: Percent, permiso: "catalogos.ver" },
  { path: "/admin/promociones", label: "Promociones", description: "Descuentos, 2x1 y paquetes", icon: Clipboard, permiso: "catalogos.ver", capacidad: "promociones" },
  { path: "/admin/paquetes", label: "Paquetes", description: "Sesiones prepagadas por servicio", icon: PackageCheck, permiso: "catalogos.ver", capacidad: "paquetes" },
  { path: "/admin/membresias", label: "Membresías", description: "Descuento por vigencia para clientes", icon: Crown, permiso: "catalogos.ver", capacidad: "membresias" },
];

const DINERO: AdminNavItem[] = [
  { path: "/admin/gastos", label: "Gastos", description: "Salidas del negocio por categoría y medio", icon: Banknote, permiso: "gastos.ver", capacidad: "gastos" },
  { path: "/admin/comisiones", label: "Comisiones", description: "Pago de comisiones al equipo", icon: HandCoins, permiso: "comisiones.ver", capacidad: "comisiones" },
  { path: "/admin/reportes", label: "Reportes", description: "Operativos y financieros por rango", icon: BarChart3, permiso: ["reportes.operativos", "reportes.financieros"], capacidad: "reportes_avanzados" },
];

const NEGOCIO: AdminNavItem[] = [
  { path: "/admin/usuarios", label: "Equipo", description: "Miembros, roles y sucursales", icon: Users, permiso: "usuarios.ver" },
  { path: "/admin/sucursales", label: "Sucursales", description: "Alta, políticas y asignación de miembros", icon: Building2, permiso: "sucursales.ver" },
  { path: "/admin/roles", label: "Roles", description: "Permisos por rol", icon: ShieldCheck, permiso: "roles.ver" },
  { path: "/admin/auditoria", label: "Bitácora", description: "Historial de cambios del negocio", icon: ScrollText, permiso: "auditoria.ver", capacidad: "auditoria" },
  { path: "/admin/suscripcion", label: "Suscripción", description: "Plan, uso y pagos del negocio", icon: Gem, permiso: "organizaciones.ver" },
];

const PLATAFORMA: AdminNavItem[] = [
  { path: "/admin", label: "Plataforma", description: "Organizaciones y sucursales", icon: Landmark },
  { path: "/admin/incidentes", label: "Incidentes", description: "Errores reportados y su resolución", icon: AlertTriangle },
  { path: "/admin/telemetria", label: "Telemetría", description: "Uso del producto y rendimiento", icon: Activity },
];

// Ayuda va al final y no requiere permiso: cualquier miembro puede abrir la
// guía, la práctica o la información de soporte.
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

/**
 * Secciones visibles según los permisos del usuario en la organización
 * activa. `permissions === null` desactiva el filtro (admin de plataforma).
 * Las secciones secundarias se marcan plegables para no saturar el sidebar.
 */
export function getAdminNavSections(
  platformAdmin = false,
  permissions: ReadonlySet<string> | null = null,
  capacidadesFaltantes: ReadonlySet<string> | null = null,
): AdminNavSection[] {
  const visible = (items: AdminNavItem[]) =>
    items.filter(
      (item) =>
        (permissions === null || tienePermiso(item.permiso, permissions)) &&
        !(item.capacidad && capacidadesFaltantes?.has(item.capacidad)),
    );
  const sections: AdminNavSection[] = [
    { title: "Operación", items: visible(OPERACION) },
    { title: "Clientes y catálogo", items: visible(CLIENTES_CATALOGO) },
    { title: "Catálogos", items: visible(CATALOGOS), collapsible: true },
    { title: "Dinero", items: visible(DINERO) },
    { title: "Negocio", items: visible(NEGOCIO), collapsible: true },
    { title: "Ayuda", items: visible(AYUDA) },
  ].filter((section) => section.items.length > 0);
  if (platformAdmin) sections.push({ title: "Plataforma", items: PLATAFORMA });
  return sections;
}

function isItemActive(pathname: string, itemPath: string): boolean {
  if (itemPath === "/admin") return pathname === "/admin";
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
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

function NavLink({
  item,
  isActive,
  organizationId,
  sucursalId,
  onNavigate,
}: {
  item: AdminNavItem;
  isActive: boolean;
  organizationId?: string;
  sucursalId?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={navItemClasses(isActive)}
      href={buildAdminHref(toAdminPath(item.path), { organizationId, sucursalId })}
      onClick={onNavigate}
      prefetch={false}
      title={item.description}
    >
      <item.icon aria-hidden="true" className={navIconClasses(isActive)} strokeWidth={isActive ? 2 : 1.8} />
      {item.label}
    </Link>
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
  const abierta = !section.collapsible || (manual ?? true);

  const items = (
    <ul className="mt-1 space-y-0.5">
      {section.items.map((item) => (
        <li key={item.path}>
          <NavLink
            isActive={isItemActive(pathname, item.path)}
            item={item}
            onNavigate={onNavigate}
            organizationId={organizationId}
            sucursalId={sucursalId}
          />
        </li>
      ))}
    </ul>
  );

  if (!section.collapsible) {
    return (
      <section aria-label={section.title}>
        <h3 className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
        className="flex min-h-8 w-full items-center justify-between rounded-lg px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary"
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
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-primary",
                )}
                data-action-id="nav.tab"
                href={buildAdminHref(toAdminPath(item.path), {
                  organizationId: context.organizationId,
                  sucursalId: context.sucursalId,
                })}
                key={item.path}
              >
                <item.icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.2 : 1.8} />
                {item.label}
              </Link>
            );
          })}
          <button
            aria-expanded={masAbierto}
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary"
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
            <SignOutButton onNavigate={() => setMasAbierto(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
