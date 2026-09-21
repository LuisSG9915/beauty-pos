"use client";

import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  Boxes,
  Calendar,
  CalendarCheck,
  Clipboard,
  CreditCard,
  Crown,
  FileText,
  Gem,
  HandCoins,
  Building2,
  Landmark,
  LifeBuoy,
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
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
};

const OPERACION: AdminNavItem[] = [
  { path: "/admin/agenda", label: "Agenda", description: "Citas, estados y venta en proceso", icon: Calendar, permiso: "agenda.ver" },
  { path: "/admin/mi-dia", label: "Mi día", description: "Tus citas, propinas y comisiones de hoy", icon: CalendarCheck, permiso: "agenda.ver" },
  { path: "/admin/pos", label: "Cobrar", description: "Ventas directas y cobro de citas", icon: ShoppingCart, permiso: "ventas.ver" },
  { path: "/admin/ventas", label: "Historial", description: "Busca tickets, devoluciones y cancelaciones", icon: ReceiptText, permiso: "ventas.ver" },
  { path: "/admin/caja", label: "Caja", description: "Apertura, cierre ciego y discrepancias", icon: Wallet, permiso: "caja.ver" },
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

const EQUIPO: AdminNavItem[] = [
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

/**
 * Secciones visibles según los permisos del usuario en la organización
 * activa. `permissions === null` desactiva el filtro (admin de plataforma).
 */
/** `permiso` simple o lista (cualquiera) contra el set efectivo del usuario. */
function tienePermiso(permiso: AdminNavItem["permiso"], permissions: ReadonlySet<string>): boolean {
  if (!permiso) return true;
  return Array.isArray(permiso)
    ? (permiso as readonly string[]).some((clave) => permissions.has(clave))
    : permissions.has(permiso as string);
}

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
    { title: "Catálogos", items: visible(CATALOGOS) },
    { title: "Dinero", items: visible(DINERO) },
    { title: "Equipo", items: visible(EQUIPO) },
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

/**
 * Navegación principal del panel en tarjetas, agrupada por sección.
 * Conserva `organizationId`/`sucursalId` de la URL (o de las props) en
 * cada enlace.
 */
export function AdminNav({
  organizationId,
  sucursalId,
  platformAdmin = false,
  activePath,
  permissions,
  capacidadesFaltantes,
}: NavContext) {
  const context = useNavContext({ organizationId, sucursalId, activePath });
  const sections = getAdminNavSections(
    platformAdmin,
    toPermissionSet(permissions),
    capacidadesFaltantes ? new Set(capacidadesFaltantes) : null,
  );

  return (
    <nav aria-label="Secciones del panel" className="space-y-8">
      {sections.map((section) => (
        <section aria-label={section.title} key={section.title}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a5140]">
            {section.title}
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => {
              const isActive = isItemActive(context.pathname, item.path);
              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex min-h-10 items-start gap-3 rounded-2xl border p-4 transition-colors",
                    isActive
                      ? "border-[#8a5140] bg-[#f2e3dc]"
                      : "border-[#eadfd8] bg-white hover:border-[#c9a899] hover:bg-[#faf6f3]",
                  )}
                  href={buildAdminHref(toAdminPath(item.path), {
                    organizationId: context.organizationId,
                    sucursalId: context.sucursalId,
                  })}
                  key={item.path}
                  prefetch={false}
                >
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl",
                      isActive
                        ? "bg-[#8a5140] text-white"
                        : "bg-[#f1eeea] text-[#8a5140] group-hover:bg-[#f2e3dc]",
                    )}
                  >
                    <item.icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#2d2926]">{item.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#6e6159]">
                      {item.description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

/** Accesos operativos del tab bar móvil (solo los flujos del día a día). */
const TAB_BAR: AdminNavItem[] = [OPERACION[0], OPERACION[1], OPERACION[2]];

/**
 * Tab bar inferior para teléfono/tablet (<md): Agenda · Mi día · Cobrar + "Más"
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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eee6e0] bg-white/95 backdrop-blur md:hidden"
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
                  isActive ? "text-[#8a5140]" : "text-[#6e6159] hover:text-[#8a5140]",
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
            className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[#6e6159] transition-colors hover:text-[#8a5140]"
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
            <SheetTitle>Todas las secciones</SheetTitle>
          </SheetHeader>
          <nav aria-label="Navegación completa" className="space-y-6">
            <AdminNavList
              activePath={context.pathname}
              capacidadesFaltantes={capacidadesFaltantes}
              onNavigate={() => setMasAbierto(false)}
              organizationId={context.organizationId}
              permissions={permissions}
              platformAdmin={platformAdmin}
              sucursalId={context.sucursalId}
            />
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Lista vertical de todas las secciones para el panel "Más" del tab bar móvil.
 * Mismo filtrado de permisos/capacidades que la navegación principal.
 */
function AdminNavList({
  organizationId,
  sucursalId,
  activePath,
  platformAdmin,
  permissions,
  capacidadesFaltantes,
  onNavigate,
}: NavContext & { onNavigate: () => void }) {
  const sections = getAdminNavSections(
    platformAdmin,
    toPermissionSet(permissions),
    capacidadesFaltantes ? new Set(capacidadesFaltantes) : null,
  );
  return (
    <>
      {sections.map((section) => (
        <section aria-label={section.title} key={section.title}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8a5140]">
            {section.title}
          </h3>
          <ul className="mt-2 space-y-1">
            {section.items.map((item) => {
              const isActive = isItemActive(activePath ?? "", item.path);
              return (
                <li key={item.path}>
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-[#f2e3dc] text-[#60392e]"
                        : "text-[#403a35] hover:bg-[#faf6f3]",
                    )}
                    href={buildAdminHref(toAdminPath(item.path), {
                      organizationId,
                      sucursalId,
                    })}
                    onClick={onNavigate}
                    prefetch={false}
                  >
                    <item.icon aria-hidden="true" className="size-4 text-[#8a5140]" strokeWidth={1.9} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * Rutas del trabajo diario — siempre visibles como píldoras principales en la
 * navegación compacta. El resto de secciones queda tras "Más opciones" para
 * reducir la carga cognitiva del equipo operativo.
 */
const RUTAS_DIARIAS = new Set([
  "/admin/agenda",
  "/admin/mi-dia",
  "/admin/pos",
  "/admin/caja",
  "/admin/clientes",
]);

function navPill(
  item: AdminNavItem,
  isActive: boolean,
  context: { organizationId?: string; sucursalId?: string },
  prefetch?: boolean,
) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap transition-colors",
        isActive
          ? "border-[#8a5140] bg-[#f2e3dc] text-[#60392e]"
          : "border-[#ded8d2] bg-white text-[#625b55] hover:border-[#c9a899] hover:bg-[#faf6f3] hover:text-[#8a5140]",
      )}
      href={buildAdminHref(toAdminPath(item.path), {
        organizationId: context.organizationId,
        sucursalId: context.sucursalId,
      })}
      key={item.path}
      prefetch={prefetch}
      title={item.description}
    >
      <item.icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
      {item.label}
    </Link>
  );
}

/**
 * Variante compacta: primero "Trabajo de hoy" (Agenda · Mi día · Cobrar ·
 * Caja · Clientes) y detrás un botón "Más opciones" que despliega el resto de
 * secciones agrupadas. Si la página activa vive en "Más", el bloque abre solo.
 */
export function AdminNavCompact({
  organizationId,
  sucursalId,
  platformAdmin = false,
  activePath,
  permissions,
  capacidadesFaltantes,
}: NavContext) {
  const context = useNavContext({ organizationId, sucursalId, activePath });
  const sections = useMemo(
    () =>
      getAdminNavSections(
        platformAdmin,
        toPermissionSet(permissions),
        capacidadesFaltantes ? new Set(capacidadesFaltantes) : null,
      ),
    [platformAdmin, permissions, capacidadesFaltantes],
  );

  const { diario, resto } = useMemo(() => {
    const vistos = new Set<string>();
    const diario: AdminNavItem[] = [];
    const resto: AdminNavSection[] = [];
    for (const section of sections) {
      const items: AdminNavItem[] = [];
      for (const item of section.items) {
        if (RUTAS_DIARIAS.has(item.path) && !vistos.has(item.path)) {
          diario.push(item);
          vistos.add(item.path);
        } else {
          items.push(item);
        }
      }
      if (items.length > 0) resto.push({ title: section.title, items });
    }
    return { diario, resto };
  }, [sections]);

  const activoEnMas = resto.some((section) =>
    section.items.some((item) => isItemActive(context.pathname, item.path)),
  );
  // Abierto si el usuario lo pidió o si la página activa vive dentro de "Más".
  const [abiertoManual, setAbiertoManual] = useState<boolean | null>(null);
  const masAbierto = abiertoManual ?? activoEnMas;

  return (
    <nav aria-label="Navegación del panel">
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        <div aria-label="Trabajo de hoy" className="flex items-center gap-2" role="group">
          {diario.map((item) =>
            navPill(item, isItemActive(context.pathname, item.path), context),
          )}
        </div>
        {resto.length > 0 ? (
          <button
            aria-expanded={masAbierto}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium whitespace-nowrap transition-colors",
              masAbierto || activoEnMas
                ? "border-[#8a5140] bg-[#f2e3dc] text-[#60392e]"
                : "border-dashed border-[#c9b8ae] bg-transparent text-[#6e6159] hover:border-[#c9a899] hover:text-[#8a5140]",
            )}
            data-action-id="nav.mas_opciones"
            onClick={() => setAbiertoManual(masAbierto ? false : true)}
            type="button"
          >
            <Menu aria-hidden="true" className="size-3.5" strokeWidth={2} />
            Más opciones
          </button>
        ) : null}
      </div>

      {masAbierto && resto.length > 0 ? (
        <div className="mt-2 space-y-2 rounded-2xl border border-[#eee6e0] bg-[#fcfaf8] p-3">
          {resto.map((section) => (
            <div className="flex flex-wrap items-center gap-2" key={section.title}>
              <span className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b08d7c]">
                {section.title}
              </span>
              {section.items.map((item) =>
                navPill(
                  item,
                  isItemActive(context.pathname, item.path),
                  context,
                  false,
                ),
              )}
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
