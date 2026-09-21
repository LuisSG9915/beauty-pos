import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  /** Tamaño del isotipo en px (lado del cuadrado). */
  size?: number;
  className?: string;
};

/**
 * Isotipo "M editorial" de Melena: tile ciruela con la M en serif itálica
 * (Fraunces vía `--font-serif`). Se usa solo el isotipo cuando el espacio es
 * reducido (sidebar, favicon); el wordmark va con `BrandWordmark`.
 */
export function BrandMark({ size = 36, className }: BrandMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 place-items-center", className)}
      role="presentation"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background: "linear-gradient(135deg, #211b19 0%, #633044 58%, #b7442e 100%)",
      }}
    >
      <span
        className="font-serif font-semibold italic text-[#fff5ef]"
        style={{ fontSize: Math.round(size * 0.58), lineHeight: 1 }}
      >
        M
      </span>
    </span>
  );
}

type BrandWordmarkProps = {
  /** Incluye el descriptor bajo el nombre. */
  withDescriptor?: boolean;
  /** Texto claro (para superficies oscuras). */
  tone?: "default" | "light";
  markSize?: number;
  className?: string;
};

/** Logotipo completo: isotipo + nombre + descriptor opcional. */
export function BrandWordmark({
  withDescriptor = false,
  tone = "default",
  markSize = 36,
  className,
}: BrandWordmarkProps) {
  const light = tone === "light";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={markSize} />
      <span className="leading-tight">
        <span
          className={cn(
            "block font-serif text-xl font-semibold tracking-tight",
            light ? "text-[#fff5ef]" : "text-foreground",
          )}
        >
          {BRAND.name}
        </span>
        {withDescriptor ? (
          <span
            className={cn(
              "block text-[11px]",
              light ? "text-[#f1c6b7]" : "text-muted-foreground",
            )}
          >
            {BRAND.descriptor}
          </span>
        ) : null}
      </span>
    </span>
  );
}
