/**
 * Tono visual determinista por categoría del catálogo POS.
 * El mismo `categoriaId` siempre cae en el mismo color (hash simple),
 * así las tarjetas y chips se ven estables entre renderizados.
 */
export type CategoryTone = {
  /** Clases para la tarjeta del catálogo (borde + fondo + hover). */
  card: string;
  /** Clases para el chip filtro de categoría (borde + fondo + texto). */
  chip: string;
};

const TONES: CategoryTone[] = [
  // Coral editorial (primario del producto)
  {
    card: "border-[#efc0b4] bg-[#ffd9cf] hover:border-[#dd9a86]",
    chip: "border-[#efc0b4] bg-[#fbe5dc] text-[#7a2e20]",
  },
  // Mango
  {
    card: "border-[#e7bd66] bg-[#ffe3ad] hover:border-[#d3a040]",
    chip: "border-[#e7bd66] bg-[#fff1d1] text-[#654300]",
  },
  // Menta
  {
    card: "border-[#9fcfc4] bg-[#d4efe9] hover:border-[#78b5a9]",
    chip: "border-[#9fcfc4] bg-[#e2f5f1] text-[#205a50]",
  },
  // Cielo
  {
    card: "border-[#a9cbe0] bg-[#d7ebf7] hover:border-[#82b2d0]",
    chip: "border-[#a9cbe0] bg-[#e3f1fa] text-[#24536b]",
  },
  // Rosa
  {
    card: "border-[#e2aabb] bg-[#f8d8e3] hover:border-[#cd8aa0]",
    chip: "border-[#e2aabb] bg-[#fbe5ed] text-[#762c49]",
  },
  // Violeta controlado
  {
    card: "border-[#beb2de] bg-[#e6e0f7] hover:border-[#a191ca]",
    chip: "border-[#beb2de] bg-[#eeeaf9] text-[#4a3d72]",
  },
  // Lima suave
  {
    card: "border-[#c1ca8b] bg-[#e5edcb] hover:border-[#a8b36b]",
    chip: "border-[#c1ca8b] bg-[#eef2dc] text-[#42551e]",
  },
  // Durazno
  {
    card: "border-[#edb894] bg-[#fbdcc6] hover:border-[#dc9d72]",
    chip: "border-[#edb894] bg-[#fce7d7] text-[#6e3819]",
  },
];

const NEUTRAL: CategoryTone = {
  card: "border-border bg-card hover:border-muted-foreground/40",
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
