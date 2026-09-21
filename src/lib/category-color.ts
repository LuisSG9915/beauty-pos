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
 * Paleta de referencia para esa definición global
 * (light conserva la paleta previa; dark deriva del mismo matiz):
 *
 *   N  nombre    light: acento / borde / bg / soft / texto
 *   1  coral     #dd9a86 #efc0b4 #ffd9cf #fbe5dc #7a2e20
 *   2  mango     #d3a040 #e7bd66 #ffe3ad #fff1d1 #654300
 *   3  menta     #78b5a9 #9fcfc4 #d4efe9 #e2f5f1 #205a50
 *   4  cielo     #82b2d0 #a9cbe0 #d7ebf7 #e3f1fa #24536b
 *   5  rosa      #cd8aa0 #e2aabb #f8d8e3 #fbe5ed #762c49
 *   6  violeta   #a191ca #beb2de #e6e0f7 #eeeaf9 #4a3d72
 *   7  lima      #a8b36b #c1ca8b #e5edcb #eef2dc #42551e
 *   8  durazno   #dc9d72 #edb894 #fbdcc6 #fce7d7 #6e3819
 *
 *   N  dark: acento / borde / bg / soft / texto
 *   1            #d99a86 #7a4b3f #452720 #39201a #f2c6b6
 *   2            #d5a44a #7a5c22 #433311 #372a0e #f0d08e
 *   3            #7ab8ab #40695f #1f3833 #1a2e2a #a9ddd0
 *   4            #85b5d3 #3f5f77 #1f3342 #1b2b39 #b3d5ec
 *   5            #cf8ea4 #74455a #412030 #371b29 #f0bacd
 *   6            #a496cd #51457a #2c2541 #262038 #ccc1ea
 *   7            #a9b56e #57622c #303718 #2a2f14 #d4dd9e
 *   8            #dd9f74 #765035 #402818 #372215 #f0c6a4
 */
export type CategoryTone = {
  /** Clases para la tarjeta del catálogo (borde + fondo + texto + hover). */
  card: string;
  /** Clases para el chip filtro de categoría (borde + fondo + texto). */
  chip: string;
};

const TONES: CategoryTone[] = [
  // 1 · Coral editorial (primario del producto)
  {
    card: "border-(--category-1-border) bg-(--category-1-bg) text-(--category-1-foreground) hover:border-(--category-1)",
    chip: "border-(--category-1-border) bg-(--category-1-soft) text-(--category-1-foreground)",
  },
  // 2 · Mango
  {
    card: "border-(--category-2-border) bg-(--category-2-bg) text-(--category-2-foreground) hover:border-(--category-2)",
    chip: "border-(--category-2-border) bg-(--category-2-soft) text-(--category-2-foreground)",
  },
  // 3 · Menta
  {
    card: "border-(--category-3-border) bg-(--category-3-bg) text-(--category-3-foreground) hover:border-(--category-3)",
    chip: "border-(--category-3-border) bg-(--category-3-soft) text-(--category-3-foreground)",
  },
  // 4 · Cielo
  {
    card: "border-(--category-4-border) bg-(--category-4-bg) text-(--category-4-foreground) hover:border-(--category-4)",
    chip: "border-(--category-4-border) bg-(--category-4-soft) text-(--category-4-foreground)",
  },
  // 5 · Rosa
  {
    card: "border-(--category-5-border) bg-(--category-5-bg) text-(--category-5-foreground) hover:border-(--category-5)",
    chip: "border-(--category-5-border) bg-(--category-5-soft) text-(--category-5-foreground)",
  },
  // 6 · Violeta controlado
  {
    card: "border-(--category-6-border) bg-(--category-6-bg) text-(--category-6-foreground) hover:border-(--category-6)",
    chip: "border-(--category-6-border) bg-(--category-6-soft) text-(--category-6-foreground)",
  },
  // 7 · Lima suave
  {
    card: "border-(--category-7-border) bg-(--category-7-bg) text-(--category-7-foreground) hover:border-(--category-7)",
    chip: "border-(--category-7-border) bg-(--category-7-soft) text-(--category-7-foreground)",
  },
  // 8 · Durazno
  {
    card: "border-(--category-8-border) bg-(--category-8-bg) text-(--category-8-foreground) hover:border-(--category-8)",
    chip: "border-(--category-8-border) bg-(--category-8-soft) text-(--category-8-foreground)",
  },
];

const NEUTRAL: CategoryTone = {
  card: "border-border bg-card text-card-foreground hover:border-muted-foreground/40",
  chip: "border-border bg-muted text-muted-foreground",
};

export function categoryTone(categoriaId: string | null): CategoryTone {
  if (!categoriaId) return NEUTRAL;
  let hash = 0;
  for (let index = 0; index < categoriaId.length; index += 1) {
    hash = (hash * 31 + categoriaId.charCodeAt(index)) >>> 0;
  }
  return TONES[hash % TONES.length];
}
