"use client";

import { Package, Scissors, Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { agregarProductoVenta, agregarServicioVenta } from "@/app/admin/pos/actions";
import { useToast } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { categoryTone } from "@/lib/category-color";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TicketData } from "@/modules/pos/ticket";

type CatalogoTab = "servicios" | "productos";

type ServicioItem = TicketData["catalogoServicios"][number];
type ProductoItem = TicketData["catalogoProductos"][number];
type CatalogoItem = ServicioItem | ProductoItem;

const TABS: Array<{ value: CatalogoTab; label: string; icon: typeof Scissors }> = [
  { value: "servicios", label: "Servicios", icon: Scissors },
  { value: "productos", label: "Productos", icon: Package },
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
  currency,
  organizationId,
  ventaId,
  onAdded,
  className,
}: {
  servicios: TicketData["catalogoServicios"];
  productos: TicketData["catalogoProductos"];
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

  const items: CatalogoItem[] = tab === "servicios" ? servicios : productos;

  const categorias = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of items) {
      if (item.categoriaId) map.set(item.categoriaId, item.categoriaNombre ?? "Sin nombre");
    }
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [items]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (categoriaId && item.categoriaId !== categoriaId) return false;
      if (!q) return true;
      const candidatos = [
        item.nombre,
        item.categoriaNombre ?? "",
        "sku" in item ? item.sku : "",
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
          className="flex rounded-xl border border-[#ded8d2] bg-[#f1eeea] p-1"
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
                    ? "bg-white text-[#60392e] shadow-sm"
                    : "text-[#625b55] hover:text-[#8a5140]",
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
            placeholder={tab === "servicios" ? "Buscar servicio" : "Buscar por SKU o nombre"}
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

      {filtrados.length === 0 ? (
        <p className="rounded-xl bg-[#f1eeea] px-4 py-3 text-sm text-[#625b55]">
          {tab === "servicios"
            ? "No hay servicios que coincidan."
            : "No hay productos que coincidan."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((item) => (
            <button
              aria-label={`Agregar ${item.nombre} al ticket`}
              className={cn(
                "flex min-h-14 flex-col justify-between gap-1.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                categoryTone(item.categoriaId).card,
              )}
              disabled={pending}
              key={item.id}
              onClick={() => agregar(item)}
              type="button"
            >
              <span className="line-clamp-2 text-sm font-medium leading-5 text-[#2d2926]">
                {item.nombre}
              </span>
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold tabular-nums text-[#60392e]">
                  {formatCurrency(item.precio, { currency })}
                </span>
                <span className="truncate text-xs tabular-nums text-[#81746c]">
                  {"duracionMinutos" in item ? `${item.duracionMinutos} min` : item.sku}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
