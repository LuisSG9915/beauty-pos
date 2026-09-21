"use client";

import { Crown, Package, PackageCheck, Scissors, Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { agregarMembresiaVenta, agregarPaqueteVenta, agregarProductoVenta, agregarServicioVenta } from "@/app/admin/pos/actions";
import { useToast } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { categoryTone } from "@/lib/category-color";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TicketData } from "@/modules/pos/ticket";

type CatalogoTab = "servicios" | "productos" | "paquetes" | "membresias";

type ServicioItem = TicketData["catalogoServicios"][number];
type ProductoItem = TicketData["catalogoProductos"][number];
type PaqueteItem = TicketData["catalogoPaquetes"][number];
type MembresiaItem = TicketData["catalogoMembresias"][number];
type CatalogoItem = ServicioItem | ProductoItem | PaqueteItem | MembresiaItem;

const TABS: Array<{ value: CatalogoTab; label: string; icon: typeof Scissors }> = [
  { value: "servicios", label: "Servicios", icon: Scissors },
  { value: "productos", label: "Productos", icon: Package },
  { value: "paquetes", label: "Paquetes", icon: PackageCheck },
  { value: "membresias", label: "Membresías", icon: Crown },
];

function chipClass(tone: string, selected: boolean) {
  return cn(
    "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-medium transition-all",
    tone,
    selected ? "font-semibold shadow-sm" : "opacity-70 hover:opacity-100",
  );
}

/**
 * Selector visual del catálogo POS (estilo Fresha): pestañas
 * servicios/productos, filtro por categoría con color determinista,
 * búsqueda y tarjetas táctiles que agregan la línea al tocarlas.
 */
export function CatalogoSelector({
  servicios,
  productos,
  paquetes = [],
  membresias = [],
  hasCliente = false,
  currency,
  organizationId,
  ventaId,
  onAdded,
  className,
}: {
  servicios: TicketData["catalogoServicios"];
  productos: TicketData["catalogoProductos"];
  paquetes?: TicketData["catalogoPaquetes"];
  membresias?: TicketData["catalogoMembresias"];
  /** La venta ya tiene cliente asignado (requisito para paquetes/membresías). */
  hasCliente?: boolean;
  currency: string;
  organizationId: string;
  ventaId: string;
  onAdded?: () => void;
  className?: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<CatalogoTab>("servicios");
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const items: CatalogoItem[] =
    tab === "servicios" ? servicios : tab === "productos" ? productos : tab === "membresias" ? membresias : paquetes;

  const categorias = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if ("categoriaId" in item && item.categoriaId) map.set(item.categoriaId, item.categoriaNombre ?? "Sin nombre");
    }
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [items]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (categoriaId && "categoriaId" in item && item.categoriaId !== categoriaId) return false;
      if (categoriaId && !("categoriaId" in item)) return false;
      if (!q) return true;
      const candidatos = [
        item.nombre,
        "categoriaNombre" in item ? (item.categoriaNombre ?? "") : "",
        "sku" in item ? item.sku : "",
        "servicioNombre" in item ? (item.servicioNombre ?? "") : "",
      ];
      return candidatos.some((candidato) => candidato.toLowerCase().includes(q));
    });
  }, [categoriaId, items, query]);

  const reportResult = (result: ActionState) => {
    if (result.success) {
      toast.success(result.message ?? "Agregado al ticket.");
      onAdded?.();
    } else {
      toast.error(result.error ?? "No se pudo agregar al ticket.");
    }
  };

  const agregar = (item: CatalogoItem) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("ventaId", ventaId);
    if ("sesiones" in item) {
      if (!hasCliente) {
        toast.error("Asigna un cliente a la venta para vender un paquete.");
        return;
      }
      data.set("paqueteId", item.id);
      startTransition(async () => reportResult(await agregarPaqueteVenta(initialActionState, data)));
      return;
    }
    if ("duracionDias" in item) {
      if (!hasCliente) {
        toast.error("Asigna un cliente a la venta para vender una membresía.");
        return;
      }
      data.set("membresiaId", item.id);
      startTransition(async () => reportResult(await agregarMembresiaVenta(initialActionState, data)));
      return;
    }
    let action = agregarServicioVenta;
    if ("duracionMinutos" in item) {
      data.set("servicioId", item.id);
    } else {
      data.set("productoId", item.id);
      data.set("cantidad", "1");
      action = agregarProductoVenta;
    }
    startTransition(async () => reportResult(await action(initialActionState, data)));
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          aria-label="Tipo de catálogo"
          className="flex rounded-xl border border-border bg-muted/60 p-1"
          role="group"
        >
          {TABS.map((opcion) => {
            const Icon = opcion.icon;
            const activo = tab === opcion.value;
            return (
              <button
                aria-pressed={activo}
                className={cn(
                  "inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors sm:px-4",
                  activo
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-primary",
                )}
                key={opcion.value}
                onClick={() => {
                  setTab(opcion.value);
                  setCategoriaId(null);
                }}
                type="button"
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {opcion.label}
              </button>
            );
          })}
        </div>
        <div className="relative min-w-0 flex-1 sm:max-w-64">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <label className="sr-only" htmlFor="pos-catalogo-buscar">
            Buscar en el catálogo
          </label>
          <input
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            id="pos-catalogo-buscar"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "servicios" ? "Buscar servicio" : tab === "paquetes" ? "Buscar paquete" : tab === "membresias" ? "Buscar membresía" : "Buscar por SKU o nombre"}
            type="search"
            value={query}
          />
        </div>
      </div>

      {categorias.length > 0 ? (
        <div aria-label="Filtrar por categoría" className="flex flex-wrap gap-1.5" role="group">
          <button
            aria-pressed={categoriaId === null}
            className={chipClass(categoryTone(null).chip, categoriaId === null)}
            onClick={() => setCategoriaId(null)}
            type="button"
          >
            Todas
          </button>
          {categorias.map((categoria) => (
            <button
              aria-pressed={categoriaId === categoria.id}
              className={chipClass(categoryTone(categoria.id).chip, categoriaId === categoria.id)}
              key={categoria.id}
              onClick={() => setCategoriaId(categoria.id)}
              type="button"
            >
              {categoria.nombre}
            </button>
          ))}
        </div>
      ) : null}

      {(tab === "paquetes" || tab === "membresias") && !hasCliente ? (
        <p className="rounded-xl bg-accent/70 px-4 py-3 text-xs text-primary">
          Asigna un cliente a la venta para vender {tab === "paquetes" ? "paquetes: el saldo" : "membresías: la vigencia"} se crea a su nombre al cobrar.
        </p>
      ) : null}

      {filtrados.length === 0 ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          {tab === "servicios"
            ? "No hay servicios que coincidan."
            : tab === "paquetes"
              ? "No hay paquetes que coincidan."
              : tab === "membresias"
                ? "No hay membresías que coincidan."
                : "No hay productos que coincidan."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((item) => (
            <button
              aria-label={`Agregar ${item.nombre} al ticket`}
              className={cn(
                "flex min-h-14 flex-col justify-between gap-1.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                categoryTone("categoriaId" in item ? item.categoriaId : null).card,
              )}
              disabled={pending}
              key={item.id}
              onClick={() => agregar(item)}
              type="button"
            >
              <span className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
                {item.nombre}
              </span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {formatCurrency(item.precio, { currency })}
                </span>
                <span className="truncate text-xs tabular-nums text-muted-foreground">
                  {"duracionMinutos" in item
                    ? `${item.duracionMinutos} min`
                    : "sesiones" in item
                      ? `${item.sesiones} sesiones · ${item.servicioNombre ?? ""}`
                      : "duracionDias" in item
                        ? `${Number(item.descuentoPorcentaje)}% · ${item.duracionDias} días`
                        : item.sku}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
