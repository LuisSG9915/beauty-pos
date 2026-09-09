import Link from "next/link";
import {
  Boxes,
  Calendar,
  Clipboard,
  CreditCard,
  Landmark,
  Percent,
  Ruler,
  Scissors,
  ShoppingBag,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export function AdminNav({
  organizationId,
  platformAdmin = false,
  activePath,
}: {
  organizationId?: string;
  platformAdmin?: boolean;
  activePath?: string;
}) {
  const param = organizationId ? `?organizationId=${organizationId}` : "";
  const sections: NavSection[] = [
    {
      title: "Operación",
      items: [
        { href: `/admin/agenda${param}`, label: "Agenda de citas", description: "Citas, estados y venta en proceso", icon: Calendar },
        { href: `/admin/clientes${param}`, label: "Clientes", description: "Expedientes, contacto y seguimiento", icon: Users },
        { href: `/admin/servicios${param}`, label: "Servicios", description: "Catálogo de servicios del salón", icon: Scissors },
        { href: `/admin/productos${param}`, label: "Productos e insumos", description: "Venta, consumo y inventario", icon: ShoppingBag },
      ],
    },
    {
      title: "Catálogos",
      items: [
        { href: `/admin/categorias-servicios${param}`, label: "Categorías de servicios", description: "Agrupa los servicios", icon: Tags },
        { href: `/admin/categorias-productos${param}`, label: "Categorías de productos", description: "Agrupa productos e insumos", icon: Boxes },
        { href: `/admin/unidades-medida${param}`, label: "Unidades de medida", description: "Pieza, litro, gramo, etc.", icon: Ruler },
        { href: `/admin/medios-pago${param}`, label: "Medios de pago", description: "Efectivo, tarjeta, transferencia", icon: CreditCard },
        { href: `/admin/impuestos${param}`, label: "Impuestos", description: "IVA, IEPS y configuración", icon: Percent },
        { href: `/admin/promociones${param}`, label: "Promociones", description: "Descuentos, 2x1 y paquetes", icon: Clipboard },
      ],
    },
  ];

  if (platformAdmin) {
    sections.push({
      title: "Plataforma",
      items: [
        { href: "/admin", label: "Organizaciones", description: "Gestión de organizaciones y sucursales", icon: Landmark },
      ],
    });
  }

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b8795d]">{section.title}</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.items.map((item) => {
              const isActive = activePath === item.href.split("?")[0];
              return (
                <Link
                  className={`group flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
                    isActive
                      ? "border-[#8a5140] bg-[#f2e3dc]"
                      : "border-[#eadfd8] bg-white hover:border-[#c9a899] hover:bg-[#faf6f3]"
                  }`}
                  href={item.href}
                  key={item.href}
                >
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${isActive ? "bg-[#8a5140] text-white" : "bg-[#f1eeea] text-[#8a5140] group-hover:bg-[#f2e3dc]"}`}>
                    <item.icon className="size-5" strokeWidth={1.8} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-[#2d2926]">{item.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#81746c]">{item.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminNavCompact({ organizationId, platformAdmin = false }: { organizationId?: string; platformAdmin?: boolean }) {
  const param = organizationId ? `?organizationId=${organizationId}` : "";
  const links: Array<{ href: string; label: string; icon: LucideIcon }> = [
    { href: `/admin/agenda${param}`, label: "Agenda", icon: Calendar },
    { href: `/admin/clientes${param}`, label: "Clientes", icon: Users },
    { href: `/admin/servicios${param}`, label: "Servicios", icon: Scissors },
    { href: `/admin/productos${param}`, label: "Productos", icon: ShoppingBag },
    { href: `/admin/categorias-servicios${param}`, label: "Cat. servicios", icon: Tags },
    { href: `/admin/categorias-productos${param}`, label: "Cat. productos", icon: Boxes },
    { href: `/admin/unidades-medida${param}`, label: "Unidades", icon: Ruler },
    { href: `/admin/medios-pago${param}`, label: "Medios de pago", icon: CreditCard },
    { href: `/admin/impuestos${param}`, label: "Impuestos", icon: Percent },
    { href: `/admin/promociones${param}`, label: "Promociones", icon: Clipboard },
  ];
  if (platformAdmin) links.push({ href: "/admin", label: "Plataforma", icon: Landmark });

  return (
    <nav className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          className="inline-flex items-center gap-1.5 rounded-full border border-[#ded8d2] bg-white px-3 py-1.5 text-xs font-medium text-[#625b55] transition-colors hover:border-[#c9a899] hover:bg-[#faf6f3] hover:text-[#8a5140]"
          href={link.href}
          key={link.href}
        >
          <link.icon className="size-3.5" strokeWidth={2} />
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
