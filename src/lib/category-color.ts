/**
 * Tono visual determinista por categoría del catálogo POS.
 * El mismo `categoriaId` siempre cae en el mismo color (hash simple),
 * así las tarjetas y chips se ven estables entre renderizados.
 *
 * Las clases no llevan hexes: referencian variables CSS por categoría
 * definidas globalmente en `:root` (claro) y `.dark` (oscuro) dentro de
 * globals.css. Contrato por tono N ∈ 1..8:
 *
 *   --category-N             acento fuerte (borde en hover, marcadores)
 *   --category-N-border      borde en reposo
 *   --category-N-bg          superficie tinteada de tarjeta
 *   --category-N-soft        superficie aún más suave (chips/filtros)
 *   --category-N-foreground  texto legible sobre el tinte
 *
 * Paleta de referencia para esa definición global (viva, saturada):
 *
 *   N  nombre    light: acento / borde / bg / soft / texto
 *   1  coral     #f0603f #f6a08e #ffd9cd #ffe9e2 #8a2c15
 *   2  mango     #e8960f #f0bd5c #ffe3ae #fff0d0 #7a4d00
 *   3  menta     #0ba88f #5ed4bd #cff3eb #e0f8f3 #075e50
 *   4  cielo     #2090dd #79bdec #d6eafb #e3f2fd #154f7c
 *   5  rosa      #e2457f #f09cba #fbd9e5 #fde8ef #8a1d47
 *   6  violeta   #7e5bef #b3a0f5 #e7dffe #f0ebfe #452a9b
 *   7  lima      #7fa812 #b8d45c #e6f0c2 #eff6d6 #465f0b
 *   8  durazno   #e06a1f #f2a56e #fbe0cc #fdecdd #7a3a0c
 *
 *   N  dark: acento / borde / bg / soft / texto
 *   1            #f2826b #7c3a2c #4a2019 #3d1a15 #f9c0b0
 *   2            #f5b13d #7c5a17 #45320d #38280b #f6d28a
 *   3            #3fd0b2 #1c6153 #11342e #0e2b26 #a3ecda
 *   4            #5cb2ef #2a5a80 #132c40 #102536 #b5dcf9
 *   5            #f07fae #7c3451 #401a2b #351623 #f7b9d0
 *   6            #a78bfa #4c3a8c #2a2147 #231c3b #d5c8fc
 *   7            #a9cc44 #4c5f1c #2b3510 #242c0d #d8ec9a
 *   8            #f08a3d #7c4417 #40230c #351d0a #f6c99a
 */
export type CategoryTone = {
  /** Clases para la tarjeta del catálogo (borde + fondo + texto + hover). */
  card: string;
  /** Clases para el chip filtro de categoría (borde + fondo + texto). */
  chip: string;
  /** Variable CSS del acento sólido (franjas, marcadores, avatar). */
  accentVar: string;
};

const TONES: CategoryTone[] = [
  // 1 · Coral editorial (primario del producto)
  {
    card: "border-(--category-1-border) bg-(--category-1-bg) text-(--category-1-foreground) hover:border-(--category-1)",
    chip: "border-(--category-1-border) bg-(--category-1-soft) text-(--category-1-foreground)",
    accentVar: "var(--category-1)",
  },
  // 2 · Mango
  {
    card: "border-(--category-2-border) bg-(--category-2-bg) text-(--category-2-foreground) hover:border-(--category-2)",
    chip: "border-(--category-2-border) bg-(--category-2-soft) text-(--category-2-foreground)",
    accentVar: "var(--category-2)",
  },
  // 3 · Menta
  {
    card: "border-(--category-3-border) bg-(--category-3-bg) text-(--category-3-foreground) hover:border-(--category-3)",
    chip: "border-(--category-3-border) bg-(--category-3-soft) text-(--category-3-foreground)",
    accentVar: "var(--category-3)",
  },
  // 4 · Cielo
  {
    card: "border-(--category-4-border) bg-(--category-4-bg) text-(--category-4-foreground) hover:border-(--category-4)",
    chip: "border-(--category-4-border) bg-(--category-4-soft) text-(--category-4-foreground)",
    accentVar: "var(--category-4)",
  },
  // 5 · Rosa
  {
    card: "border-(--category-5-border) bg-(--category-5-bg) text-(--category-5-foreground) hover:border-(--category-5)",
    chip: "border-(--category-5-border) bg-(--category-5-soft) text-(--category-5-foreground)",
    accentVar: "var(--category-5)",
  },
  // 6 · Violeta controlado
  {
    card: "border-(--category-6-border) bg-(--category-6-bg) text-(--category-6-foreground) hover:border-(--category-6)",
    chip: "border-(--category-6-border) bg-(--category-6-soft) text-(--category-6-foreground)",
    accentVar: "var(--category-6)",
  },
  // 7 · Lima suave
  {
    card: "border-(--category-7-border) bg-(--category-7-bg) text-(--category-7-foreground) hover:border-(--category-7)",
    chip: "border-(--category-7-border) bg-(--category-7-soft) text-(--category-7-foreground)",
    accentVar: "var(--category-7)",
  },
  // 8 · Durazno
  {
    card: "border-(--category-8-border) bg-(--category-8-bg) text-(--category-8-foreground) hover:border-(--category-8)",
    chip: "border-(--category-8-border) bg-(--category-8-soft) text-(--category-8-foreground)",
    accentVar: "var(--category-8)",
  },
];

const NEUTRAL: CategoryTone = {
  card: "border-border bg-card text-card-foreground hover:border-muted-foreground/40",
  chip: "border-border bg-muted text-muted-foreground",
  accentVar: "var(--muted-foreground)",
};

export function categoryTone(categoriaId: string | null): CategoryTone {
  if (!categoriaId) return NEUTRAL;
  let hash = 0;
  for (let index = 0; index < categoriaId.length; index += 1) {
    hash = (hash * 31 + categoriaId.charCodeAt(index)) >>> 0;
  }
  return TONES[hash % TONES.length];
}
