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
    "inline-flex min-h-11 items-center rounded-full border px-3 text-op-xs font-medium transition-all shrink-0",
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

  const [agregadoId, setAgregadoId] = useState<string | null>(null);

  const reportResult = (result: ActionState) => {
    if (result.success) {
      toast.success(result.message ?? "Agregado al ticket.");
      onAdded?.();
    } else {
      toast.error(result.error ?? "No se pudo agregar al ticket.");
    }
  };

  const agregar = (item: CatalogoItem) => {
    setAgregadoId(item.id);
    setTimeout(() => setAgregadoId((curr) => (curr === item.id ? null : curr)), 700);

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
    <div className={cn("space-y-3 min-w-0 max-w-full", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div
          aria-label="Tipo de catálogo"
          className="flex flex-wrap sm:flex-nowrap rounded-xl border border-border bg-muted/60 p-1 w-full sm:w-auto"
          role="group"
        >
          {TABS.map((opcion) => {
            const Icon = opcion.icon;
            const activo = tab === opcion.value;
            return (
              <button
                aria-pressed={activo}
                className={cn(
                  "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-op-xs font-medium whitespace-nowrap transition-all duration-150 sm:px-4 active:scale-[0.98] cursor-pointer",
                  activo
                    ? "bg-card text-primary shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={opcion.value}
                onClick={() => {
                  setTab(opcion.value);
                  setCategoriaId(null);
                }}
                type="button"
              >
                <Icon aria-hidden="true" className={cn("size-3.5 transition-transform duration-150", activo && "scale-110")} />
                {opcion.label}
              </button>
            );
          })}
        </div>
        <div className="relative min-w-0 w-full sm:w-auto sm:max-w-64 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <label className="sr-only" htmlFor="pos-catalogo-buscar">
            Buscar en el catálogo
          </label>
          <input
            className="h-11 min-h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none transition-all duration-150 focus:border-primary focus:ring-3 focus:ring-primary/20 hover:border-border"
            id="pos-catalogo-buscar"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tab === "servicios" ? "Buscar servicio" : tab === "paquetes" ? "Buscar paquete" : tab === "membresias" ? "Buscar membresía" : "Buscar por clave o nombre"}
            type="search"
            value={query}
          />
        </div>
      </div>

      {categorias.length > 0 ? (
        <div aria-label="Filtrar por categoría" className="flex flex-wrap gap-2 max-w-full" role="group">
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
        <p className="rounded-xl bg-accent/70 px-4 py-3 text-op-xs text-primary">
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
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 min-w-0 max-w-full">
          {filtrados.map((item, index) => {
            const tone = categoryTone("categoriaId" in item ? item.categoriaId : null);
            const imagenClave = "imagenClaveR2" in item ? item.imagenClaveR2 : null;
            const esAgregado = agregadoId === item.id;
            return (
              <button
                aria-label={`Agregar ${item.nombre} al ticket`}
                className={cn(
                  "group relative flex min-h-16 min-w-0 flex-col gap-2 rounded-2xl border p-2.5 text-left transition-all duration-200 anim-entrada",
                  "hover:-translate-y-1 hover:shadow-md hover:border-primary/40",
                  "active:scale-[0.98] active:shadow-xs",
                  "focus-visible:outline-2 focus-visible:outline-ring cursor-pointer select-none",
                  esAgregado && "anim-pulso ring-2 ring-primary ring-offset-2 ring-offset-background scale-[0.98]",
                  tone.card,
                )}
                data-action-id="pos.catalogo.agregar"
                disabled={pending}
                key={item.id}
                onClick={() => agregar(item)}
                style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                type="button"
              >
                <span
                  className={cn(
                    "relative flex h-16 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl text-lg font-semibold transition-transform duration-300 group-hover:scale-[1.02]",
                    tone.chip,
                  )}
                >
                  {imagenClave ? (
                    // eslint-disable-next-line @next/next/no-img-element -- la ruta exige sesión; next/image no reenvía cookies
                    <img
                      alt=""
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      src={`/api/medios/${encodeURI(imagenClave)}`}
                    />
                  ) : (
                    item.nombre.trim().charAt(0).toUpperCase()
                  )}
                  {esAgregado ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-primary/85 text-op-xs font-bold text-primary-foreground backdrop-blur-xs anim-entrada">
                      ✓ Agregado
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 px-1 text-sm font-medium leading-snug text-foreground group-hover:text-primary transition-colors">
                  {item.nombre}
                </span>
                <span className="mt-auto flex items-baseline justify-between gap-2 px-1">
                  <span className="text-sm font-bold tabular-nums text-primary">
                    {formatCurrency(item.precio, { currency })}
                  </span>
                  <span className="truncate text-op-xs tabular-nums text-muted-foreground">
                    {"duracionMinutos" in item
                      ? `${item.duracionMinutos} min`
                      : "sesiones" in item
                        ? `${item.sesiones} ses.`
                        : "duracionDias" in item
                          ? `${Number(item.descuentoPorcentaje)}% · ${item.duracionDias}d`
                          : item.sku}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
