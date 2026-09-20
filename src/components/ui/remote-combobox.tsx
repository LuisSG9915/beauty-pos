"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { ComboboxItem } from "@/components/ui/combobox";

export type RemoteComboboxProps = {
  /** URL base del endpoint; se le agrega `&q=` con el término buscado. */
  searchUrl: string;
  /** Item ya seleccionado (edición) para mostrarlo sin una primera búsqueda. */
  initialItem?: ComboboxItem | null;
  /** Nombre del input oculto que se envía en formularios/server actions. */
  name?: string;
  label?: string;
  placeholder?: string;
  /** Mínimo de caracteres antes de consultar (default 2). */
  minQuery?: number;
  emptyMessage?: string;
  loadingMessage?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
};

/**
 * Combobox de selección única con resultados remotos: consulta `searchUrl`
 * tras 250 ms sin teclear y mantiene el item seleccionado aunque no esté en
 * la última página de resultados. Renderiza un input oculto con `name`.
 */
export function RemoteCombobox({
  searchUrl,
  initialItem = null,
  name,
  label,
  placeholder = "Escribe para buscar",
  minQuery = 2,
  emptyMessage = "Sin resultados",
  loadingMessage = "Buscando…",
  required = false,
  disabled = false,
  className,
  "aria-describedby": ariaDescribedBy,
}: RemoteComboboxProps) {
  const inputId = useId();
  const [items, setItems] = useState<ComboboxItem[]>(initialItem ? [initialItem] : []);
  const [seleccion, setSeleccion] = useState<ComboboxItem | null>(initialItem);
  const [buscando, setBuscando] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = useCallback(
    (termino: string) => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);

      const limpio = termino.trim();
      if (limpio.length < minQuery) {
        setItems(seleccion ? [seleccion] : []);
        setBuscando(false);
        return;
      }

      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setBuscando(true);
        try {
          const res = await fetch(`${searchUrl}&q=${encodeURIComponent(limpio)}`, {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = (await res.json()) as { items?: ComboboxItem[] };
          const remotos = data.items ?? [];
          setItems(() => {
            const fusion = seleccion ? [seleccion] : [];
            for (const item of remotos) {
              if (!fusion.some((existente) => existente.value === item.value)) {
                fusion.push(item);
              }
            }
            return fusion;
          });
        } catch {
          // Abort o error de red: se mantiene la selección actual.
        } finally {
          setBuscando(false);
        }
      }, 250);
    },
    [minQuery, searchUrl, seleccion],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label className="text-sm font-medium text-foreground" htmlFor={inputId}>
          {label}
          {required ? " *" : ""}
        </label>
      ) : null}
      <ComboboxPrimitive.Root<ComboboxItem>
        autoComplete="off"
        disabled={disabled}
        filter={() => true}
        isItemEqualToValue={(a, b) => a.value === b.value}
        items={items}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        name={name}
        onInputValueChange={(valor) => buscar(valor)}
        onValueChange={(item) => setSeleccion(item ?? null)}
        required={required}
        value={seleccion}
      >
        <ComboboxPrimitive.InputGroup
          className={cn(
            "relative flex h-10 w-full items-center rounded-xl border bg-background transition-colors",
            "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
            "border-input hover:border-muted-foreground/40",
          )}
        >
          <ComboboxPrimitive.Input
            aria-describedby={ariaDescribedBy}
            className="h-full w-full rounded-xl bg-transparent px-3 pr-16 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            id={inputId}
            placeholder={placeholder}
          />
          <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
            {buscando ? (
              <Loader2 className="mr-1 size-4 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : null}
            <ComboboxPrimitive.Clear
              aria-label="Limpiar selección"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              keepMounted={false}
            >
              <X className="size-3.5" aria-hidden="true" />
            </ComboboxPrimitive.Clear>
            <ComboboxPrimitive.Trigger
              aria-label="Ver opciones"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </ComboboxPrimitive.Trigger>
          </div>
        </ComboboxPrimitive.InputGroup>

        <ComboboxPrimitive.Portal>
          <ComboboxPrimitive.Positioner className="z-50 outline-none" sideOffset={6}>
            <ComboboxPrimitive.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <ComboboxPrimitive.Empty>
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  {buscando ? loadingMessage : emptyMessage}
                </div>
              </ComboboxPrimitive.Empty>
              <ComboboxPrimitive.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain outline-none data-empty:p-0">
                {(item: ComboboxItem) => (
                  <ComboboxPrimitive.Item
                    className={cn(
                      "flex cursor-default items-start gap-2 rounded-lg px-3 py-2.5 text-sm outline-none select-none",
                      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                    )}
                    key={item.value}
                    value={item}
                  >
                    <ComboboxPrimitive.ItemIndicator className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                      <Check className="size-3.5" aria-hidden="true" />
                    </ComboboxPrimitive.ItemIndicator>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{item.label}</span>
                      {item.description ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                  </ComboboxPrimitive.Item>
                )}
              </ComboboxPrimitive.List>
            </ComboboxPrimitive.Popup>
          </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
      </ComboboxPrimitive.Root>
    </div>
  );
}
