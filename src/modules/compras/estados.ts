import type { StatusTone } from "@/components/status-badge";
import type { CompraEstado } from "@/db/schema/compras";

/**
 * Presentación compartida de los estados de compra (plan 10): etiqueta en
 * español de salón + tono de `StatusBadge`. Única fuente para lista y detalle.
 */
export const COMPRA_ESTADO_INFO: Record<CompraEstado, { label: string; tone: StatusTone }> = {
  borrador: { label: "Borrador", tone: "neutral" },
  por_verificar: { label: "Por verificar", tone: "info" },
  verificada: { label: "Verificada", tone: "success" },
  con_observacion: { label: "Con observación", tone: "warning" },
  cancelada: { label: "Cancelada", tone: "destructive" },
};
