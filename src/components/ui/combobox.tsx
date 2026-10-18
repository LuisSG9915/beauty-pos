"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check, ChevronDown, X } from "lucide-react";
import { useId } from "react";

import { cn } from "@/lib/utils";

/** Item genérico del combobox. */
export type ComboboxItem = {
  value: string;
  label: string;
  description?: string;
  /** Términos extra que también filtran el item. */
  keywords?: string[];
  /** Miniatura opcional (p. ej. foto del servicio desde /api/medios). */
  imageUrl?: string;
  disabled?: boolean;
};

export type ComboboxProps = {
  items: ComboboxItem[];
  /** Nombre del input oculto que se envía en formularios/server actions. */
  name?: string;
  /** Etiqueta visible asociada al input. */
  label?: string;
  placeholder?: string;
  /** Valor controlado (`item.value`). `null` limpia la selección. */
  value?: string | null;
  /** Valor inicial no controlado (`item.value`). */
  defaultValue?: string | null;
  onValueChange?: (value: string | null, item: ComboboxItem | null) => void;
  required?: boolean;
  disabled?: boolean;
  /** Muestra el botón para limpiar la selección. Por defecto `true`. */
  clearable?: boolean;
  emptyMessage?: string;
  /** Mensaje de error; marca el input con aria-invalid. */
  error?: string;
  id?: string;
  className?: string;
  inputClassName?: string;
  "aria-describedby"?: string;
};

function matchesQuery(item: ComboboxItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [item.label, item.value, ...(item.keywords ?? [])].some((candidate) =>
    candidate.toLowerCase().includes(normalized),
  );
}

/**
 * Combobox searchable de selección única. Renderiza un input oculto con
 * `name` (el `value` del item) para usarlo directo en server actions.
 */
export function Combobox({
  items,
  name,
  label,
  placeholder = "Selecciona una opción",
  value,
  defaultValue,
  onValueChange,
  required = false,
  disabled = false,
  clearable = true,
  emptyMessage = "Sin resultados",
  error,
  id,
  className,
  inputClassName,
  "aria-describedby": ariaDescribedBy,
}: ComboboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const describedBy =
    [ariaDescribedBy, error ? errorId : undefined].filter(Boolean).join(" ") ||
    undefined;
  const isControlled = value !== undefined;
  const selectedItem = isControlled
    ? (items.find((item) => item.value === value) ?? null)
    : undefined;
  const defaultItem =
    defaultValue != null
      ? (items.find((item) => item.value === defaultValue) ?? null)
      : undefined;

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
        defaultValue={defaultItem}
        disabled={disabled}
        filter={matchesQuery}
        isItemEqualToValue={(a, b) => a.value === b.value}
        items={items}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        name={name}
        onValueChange={(item) => onValueChange?.(item?.value ?? null, item)}
        required={required}
        value={selectedItem}
      >
        <ComboboxPrimitive.InputGroup
          className={cn(
            "relative flex h-10 w-full items-center rounded-xl border bg-background transition-colors",
            "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
            error
              ? "border-destructive/60"
              : "border-input hover:border-muted-foreground/40",
          )}
        >
          <ComboboxPrimitive.Input
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cn(
              "h-full w-full rounded-xl bg-transparent px-3 pr-16 text-sm text-foreground outline-none placeholder:text-muted-foreground",
              inputClassName,
            )}
            id={inputId}
            placeholder={placeholder}
          />
          <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
            {clearable ? (
              <ComboboxPrimitive.Clear
                aria-label="Limpiar selección"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                keepMounted={false}
              >
                <X className="size-3.5" aria-hidden="true" />
              </ComboboxPrimitive.Clear>
            ) : null}
            <ComboboxPrimitive.Trigger
              aria-label="Ver opciones"
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </ComboboxPrimitive.Trigger>
          </div>
        </ComboboxPrimitive.InputGroup>

        <ComboboxPrimitive.Portal>
          <ComboboxPrimitive.Positioner
            className="z-50 outline-none"
            sideOffset={6}
          >
            <ComboboxPrimitive.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] origin-[var(--transform-origin)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <ComboboxPrimitive.Empty>
                <div className="px-3 py-4 text-sm text-muted-foreground">
                  {emptyMessage}
                </div>
              </ComboboxPrimitive.Empty>
              <ComboboxPrimitive.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain outline-none data-empty:p-0">
                {(item: ComboboxItem) => (
                  <ComboboxPrimitive.Item
                    className={cn(
                      "flex cursor-default items-start gap-2 rounded-lg px-3 py-2.5 text-sm outline-none select-none",
                      "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
                    )}
                    disabled={item.disabled}
                    key={item.value}
                    value={item}
                  >
                    <ComboboxPrimitive.ItemIndicator className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                      <Check className="size-3.5" aria-hidden="true" />
                    </ComboboxPrimitive.ItemIndicator>
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- la ruta exige sesión; next/image no reenvía cookies
                      <img
                        alt=""
                        className="mt-0.5 size-8 shrink-0 rounded-lg border border-border object-cover"
                        loading="lazy"
                        src={item.imageUrl}
                      />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {item.label}
                      </span>
                      {item.description ? (
                        <span className="mt-0.5 block text-op-xs text-muted-foreground">
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
      {error ? (
        <p
          className="text-op-xs font-medium text-destructive"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
