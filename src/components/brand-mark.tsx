import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  /** Tamaño del isotipo en px (lado del cuadrado). */
  size?: number;
  className?: string;
};

/**
 * Isotipo "M fluida" de Melena: tile degradado bugambilia con la M dibujada
 * por dos trazos curvos (la forma principal deja el negative space entre
 * arcos; un trazo fino superpuesto marca el pliegue). Los colores salen de
 * los tokens `--brand-icon-*`, así el tile se invierte solo en modo oscuro.
 * El glifo ocupa ~68% del tile y se sostiene de 16 a 512 px.
 */
export function BrandMark({ size = 36, className }: BrandMarkProps) {
  const glyphSize = Math.round(size * 0.68);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-grid shrink-0 place-items-center", className)}
      role="presentation"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        background:
          "linear-gradient(135deg, var(--brand-icon-bg), var(--brand-icon-bg-end))",
        color: "var(--brand-icon-fg)",
      }}
    >
      <svg fill="none" height={glyphSize} viewBox="0 0 64 64" width={glyphSize}>
        <path
          d="M15 48.4C16.7 36.6 18.8 25.9 23 16.2c3.2.8 5.5 8.4 8.9 18.1 3.4-9.7 5.7-17.3 8.9-18.1 4.2 9.7 6.3 20.4 8 32.2h-8.2c-.8-8.6-1.5-15-3.8-21.2-1.6 4.1-3 9.4-4.8 15.1-1.8-5.7-3.2-11-4.8-15.1-2.3 6.2-3 12.6-3.8 21.2H15Z"
          fill="currentColor"
        />
        <path
          d="M24.1 20.8c2.4 1.8 4.1 6.7 5.8 13.1"
          opacity="0.22"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
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
            light ? "text-brand-fg-on-dark" : "text-foreground",
          )}
        >
          {BRAND.name}
        </span>
        {withDescriptor ? (
          <span
            className={cn(
              "block text-op-xs",
              light ? "text-brand-fg-on-dark/75" : "text-muted-foreground",
            )}
          >
            {BRAND.descriptor}
          </span>
        ) : null}
      </span>
    </span>
  );
}
