/**
 * Etiquetas y tonos compartidos del plano del salón (UI y mensajes de las
 * acciones). El vocabulario visible usa términos de salón, no técnicos.
 */

import type { StatusTone } from "@/components/status-badge";
import type { MobiliarioEstado, MobiliarioTipo, UbicacionTipo } from "@/db/schema/plano";

export const UBICACION_TIPO_LABEL: Record<UbicacionTipo, string> = {
  vitrina: "Vitrina",
  estante: "Estante",
  bodega: "Bodega",
  mostrador: "Mostrador",
  otro: "Otro",
};

export const MOBILIARIO_TIPO_LABEL: Record<MobiliarioTipo, string> = {
  asiento: "Asiento",
  mesa: "Mesa",
  tocador: "Tocador",
  lavacabezas: "Lavacabezas",
  camilla: "Camilla",
  carrito: "Carrito",
  espejo: "Espejo",
  otro: "Otro",
};

export const MOBILIARIO_ESTADO_LABEL: Record<MobiliarioEstado, string> = {
  bueno: "En buen estado",
  mantenimiento: "En mantenimiento",
  baja: "Dado de baja",
};

export const MOBILIARIO_ESTADO_TONO: Record<MobiliarioEstado, StatusTone> = {
  bueno: "success",
  mantenimiento: "warning",
  baja: "neutral",
};

/**
 * Tinte por tipo de ubicación sobre los tokens `--chart-*` existentes (el
 * plan manda reutilizarlos; la UI los mezcla con `--card` para el relleno).
 */
export const UBICACION_TIPO_COLOR: Record<UbicacionTipo, string> = {
  vitrina: "var(--chart-1)",
  estante: "var(--chart-2)",
  bodega: "var(--chart-3)",
  mostrador: "var(--chart-4)",
  otro: "var(--chart-5)",
};
