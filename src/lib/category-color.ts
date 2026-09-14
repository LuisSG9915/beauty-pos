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
  // Terracota (primario del proyecto)
  {
    card: "border-[#e0c0b2] bg-[#f9ece6] hover:border-[#c9a08d]",
    chip: "border-[#e0c0b2] bg-[#f2e3dc] text-[#8a5140]",
  },
  // Verde
  {
    card: "border-[#c4dcc9] bg-[#eef6ef] hover:border-[#a3c4ab]",
    chip: "border-[#c4dcc9] bg-[#e2efe5] text-[#347052]",
  },
  // Ámbar
  {
    card: "border-[#e6d3a6] bg-[#fbf3df] hover:border-[#d3b87e]",
    chip: "border-[#e6d3a6] bg-[#f4ead0] text-[#986b16]",
  },
  // Azul
  {
    card: "border-[#c3d3e4] bg-[#edf2f9] hover:border-[#9fb8d2]",
    chip: "border-[#c3d3e4] bg-[#dfe9f4] text-[#3e6390]",
  },
  // Rosa
  {
    card: "border-[#e4c3cb] bg-[#f9edf0] hover:border-[#cf9fab]",
    chip: "border-[#e4c3cb] bg-[#f2dfe3] text-[#8f4a56]",
  },
  // Violeta
  {
    card: "border-[#d2c9e6] bg-[#f2effa] hover:border-[#b3a4d4]",
    chip: "border-[#d2c9e6] bg-[#e6dff4] text-[#6a5490]",
  },
  // Teal
  {
    card: "border-[#badad5] bg-[#eaf5f3] hover:border-[#93c2bb]",
    chip: "border-[#badad5] bg-[#d9ece9] text-[#2f6d66]",
  },
  // Oliva
  {
    card: "border-[#d8d5b8] bg-[#f5f4e4] hover:border-[#beb984]",
    chip: "border-[#d8d5b8] bg-[#eae8d2] text-[#6d6a2e]",
  },
];

const NEUTRAL: CategoryTone = {
  card: "border-[#eee8e3] bg-white hover:border-[#d8cfc7]",
  chip: "border-[#ded8d2] bg-[#f1eeea] text-[#625b55]",
};

export function categoryTone(categoriaId: string | null): CategoryTone {
  if (!categoriaId) return NEUTRAL;
  let hash = 0;
  for (let index = 0; index < categoriaId.length; index += 1) {
    hash = (hash * 31 + categoriaId.charCodeAt(index)) >>> 0;
  }
  return TONES[hash % TONES.length];
}
