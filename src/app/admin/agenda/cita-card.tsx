"use client";

import {
  Banknote,
  CalendarClock,
  CheckCheck,
  CircleCheck,
  CircleX,
  Play,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties, DragEvent, KeyboardEvent, MouseEvent } from "react";

import { categoryTone } from "@/lib/category-color";
import { formatCurrency, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ESTADO_VISTA_ACCENT,
  ESTADO_VISTA_CARD,
  ESTADO_VISTA_LABEL,
  ESTADOS_VISTA_ATENUADOS,
  estadoVistaDeCita,
  type EstadoVista,
} from "@/modules/agenda/estados";

import type { AgendaCita } from "./agenda-types";
import { citaInterval } from "./agenda-utils";

const ESTADO_VISTA_ICON: Record<EstadoVista, LucideIcon> = {
  agendada: CalendarClock,
  confirmada: CircleCheck,
  en_atencion: Play,
  por_cobrar: Banknote,
  cobrada: CheckCheck,
  cancelada: CircleX,
  no_asistio: UserX,
};

/** Insignia de estado con los mismos colores que la tarjeta (lista, panel, mi-día). */
export function EstadoVistaBadge({
  cita,
  className,
}: {
  cita: { estado: string; ventaId: string | null };
  className?: string;
}) {
  const vista = estadoVistaDeCita(cita);
  const EstadoIcon = ESTADO_VISTA_ICON[vista];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-op-xs font-semibold",
        ESTADO_VISTA_CARD[vista],
        className,
      )}
    >
      <EstadoIcon aria-hidden="true" className={cn("size-3.5", ESTADO_VISTA_ACCENT[vista])} />
      {ESTADO_VISTA_LABEL[vista]}
    </span>
  );
}

function activateOnKeys(event: KeyboardEvent<HTMLDivElement>, onClick?: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onClick?.();
  }
}

/**
 * Tarjeta de cita de la agenda. El fondo comunica el ESTADO (agendada,
 * confirmada, en atención, por cobrar, cobrada, cancelada, no vino) y la
 * franja izquierda el tipo de servicio. En "por_cobrar" lleva un botón de
 * cobro propio: la acción más importante del día no exige abrir el panel.
 */
export function CitaCard({
  cita,
  currency,
  timeZone,
  draggable = false,
  compact,
  showProfesional = false,
  onClick,
  onCobrar,
  onDragEnd,
  onDragStart,
  className,
  style,
}: {
  cita: AgendaCita;
  currency: string;
  timeZone: string;
  draggable?: boolean;
  /** Fuerza el layout de una línea (altura real < ~50px o vista semana). */
  compact?: boolean;
  /** Vista semana/lista: el profesional no es la columna, va dentro. */
  showProfesional?: boolean;
  onClick?: () => void;
  onCobrar?: (cita: AgendaCita) => void;
  onDragEnd?: () => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const estadoVista = estadoVistaDeCita(cita);
  const EstadoIcon = ESTADO_VISTA_ICON[estadoVista];
  const principal = cita.servicios[0];
  const tone = categoryTone(principal?.categoriaId ?? principal?.id ?? null);
  const esCompacta = compact ?? cita.duracionMinutos <= 40;
  const fin = formatTime(new Date(citaInterval(cita).terminaAtMs).toISOString(), { timeZone });
  const servicios = cita.servicios.map((servicio) => servicio.nombre).join(", ");
  const etiqueta = `${ESTADO_VISTA_LABEL[estadoVista]}, ${formatTime(cita.fechaHora, { timeZone })}, ${cita.clienteNombre}`;

  return (
    <div
      aria-label={etiqueta}
      className={cn(
        "w-full overflow-hidden rounded-xl border border-l-4 px-2.5 py-1.5 pl-2 text-left shadow-sm transition-[box-shadow,transform] hover:z-10 hover:shadow-md focus-visible:z-20",
        draggable && "cursor-grab active:cursor-grabbing",
        ESTADO_VISTA_CARD[estadoVista],
        ESTADOS_VISTA_ATENUADOS.has(estadoVista) && "opacity-75 saturate-[0.6]",
        className,
      )}
      draggable={draggable}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onKeyDown={(event) => activateOnKeys(event, onClick)}
      role="button"
      style={{ borderLeftColor: tone.accentVar, ...style }}
      tabIndex={0}
    >
      <span className="flex items-center gap-1.5">
        <span className="min-w-0 truncate text-op-sm font-bold leading-5 tabular-nums">
          {esCompacta
            ? formatTime(cita.fechaHora, { timeZone })
            : `${formatTime(cita.fechaHora, { timeZone })}–${fin}`}
        </span>
        <span
          className={cn(
            "ml-auto flex shrink-0 items-center gap-1 text-op-xs font-bold",
            ESTADO_VISTA_ACCENT[estadoVista],
          )}
        >
          <EstadoIcon aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
          <span className={cn(esCompacta && "sr-only")}>{ESTADO_VISTA_LABEL[estadoVista]}</span>
        </span>
      </span>
      <span className="block truncate text-sm font-semibold leading-5">{cita.clienteNombre}</span>
      {!esCompacta && servicios ? (
        <span className="block truncate text-op-xs leading-5 opacity-85">{servicios}</span>
      ) : null}
      {!esCompacta && showProfesional && cita.usuarioNombre ? (
        <span className="block truncate text-op-xs leading-5 opacity-85">{cita.usuarioNombre}</span>
      ) : null}
      {!esCompacta ? (
        <span className="mt-0.5 flex items-center gap-2">
          <span className="text-op-xs font-semibold leading-5 tabular-nums">
            {formatCurrency(cita.totalEstimado, { currency })}
          </span>
          {estadoVista === "por_cobrar" && onCobrar ? (
            <span
              onClick={(event: MouseEvent) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <button
                className="min-h-8 rounded-lg bg-(--cita-por-cobrar) px-2.5 text-op-xs font-bold text-white shadow-sm transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => onCobrar(cita)}
                type="button"
              >
                Cobrar
              </button>
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
