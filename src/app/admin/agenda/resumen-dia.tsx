"use client";

import { formatCurrency, formatTime } from "@/lib/format";
import { getZonedParts } from "@/modules/agenda";
import { estadoVistaDeCita } from "@/modules/agenda/estados";

import type { AgendaCita } from "./agenda-types";

/**
 * Resumen del día sobre la rejilla: cuántas citas hay, cuánto falta por
 * cobrar y cuál es la siguiente. Solo vista día; los números son lo primero
 * que pregunta quien opera el salón.
 */
export function ResumenDia({
  citas,
  currency,
  timeZone,
  minutoActual,
}: {
  citas: AgendaCita[];
  currency: string;
  timeZone: string;
  /** Minuto del día actual en la zona (null cuando no es hoy). */
  minutoActual: number | null;
}) {
  const vivas = citas.filter((cita) => !["cancelada", "no_asistio"].includes(cita.estado));
  const porCobrar = citas.filter((cita) => estadoVistaDeCita(cita) === "por_cobrar");
  const totalPorCobrar = porCobrar.reduce((acc, cita) => acc + Number(cita.totalEstimado || 0), 0);
  const siguiente =
    minutoActual === null
      ? undefined
      : vivas
          .filter((cita) => ["pendiente", "confirmada"].includes(cita.estado))
          .filter(
            (cita) =>
              getZonedParts(new Date(cita.fechaHora), timeZone).minutosDelDia >= minutoActual,
          )
          .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora))[0];

  if (vivas.length === 0) {
    return (
      <p className="anim-entrada rounded-xl border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground sm:px-4 sm:py-2.5 sm:text-sm">
        Día libre — toca un horario libre en la rejilla o usa{" "}
        <span className="font-semibold text-foreground">Nueva cita</span> para agendar.
      </p>
    );
  }

  return (
    <div className="anim-entrada flex flex-wrap items-center gap-1.5 sm:gap-2" role="status">
      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground sm:px-3 sm:py-1.5 sm:text-sm">
        {vivas.length} {vivas.length === 1 ? "cita" : "citas"}
      </span>
      {porCobrar.length > 0 ? (
        <span className="rounded-full border border-(--cita-por-cobrar-border) bg-(--cita-por-cobrar-bg) px-2.5 py-1 text-xs font-semibold text-(--cita-por-cobrar-fg) sm:px-3 sm:py-1.5 sm:text-sm">
          {porCobrar.length} por cobrar · {formatCurrency(totalPorCobrar, { currency })}
        </span>
      ) : null}
      {siguiente ? (
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground sm:px-3 sm:py-1.5 sm:text-sm">
          Siguiente:{" "}
          <span className="font-semibold text-foreground">
            {formatTime(siguiente.fechaHora, { timeZone })} {siguiente.clienteNombre}
          </span>
        </span>
      ) : null}
    </div>
  );
}
