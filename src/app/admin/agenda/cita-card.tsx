"use client";

import {
  Banknote,
  CalendarClock,
  CheckCheck,
  CircleCheck,
  CircleX,
  Play,
  Scissors,
  UserRound,
  UserX,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent as ReactPointerEvent } from "react";

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
 *
 * El arrastre usa Pointer Events (`onPointerDown`, ver agenda-drag.ts); el
 * asa inferior de 14 px (`onPointerDownResize`) cambia la duración.
 */
export function CitaCard({
  cita,
  currency,
  timeZone,
  arrastrable = false,
  compact,
  showProfesional = false,
  resizeHandle = false,
  onClick,
  onCobrar,
  onPointerDown,
  onPointerDownResize,
  className,
  style,
}: {
  cita: AgendaCita;
  currency: string;
  timeZone: string;
  /** Habilita el cursor de agarre; el gesto real lo dirige `onPointerDown`. */
  arrastrable?: boolean;
  /** Fuerza el layout de una línea (altura real < ~50px o vista semana). */
  compact?: boolean;
  /** Vista semana/lista: el profesional no es la columna, va dentro. */
  showProfesional?: boolean;
  /** Asa inferior para cambiar la duración (solo citas editables en día). */
  resizeHandle?: boolean;
  onClick?: () => void;
  onCobrar?: (cita: AgendaCita) => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDownResize?: (event: ReactPointerEvent<HTMLElement>) => void;
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
        "group/card anim-entrada w-full select-none overflow-hidden rounded-xl border border-l-4 px-2.5 py-1.5 pl-2 text-left shadow-sm transition-[box-shadow,transform,opacity] hover:z-10 hover:shadow-md hover:ring-1 hover:ring-ring/40 focus-visible:z-20 motion-safe:hover:-translate-y-0.5",
        arrastrable && "cursor-grab active:cursor-grabbing",
        ESTADO_VISTA_CARD[estadoVista],
        ESTADOS_VISTA_ATENUADOS.has(estadoVista) && "opacity-75 saturate-[0.6]",
        className,
      )}
      data-action-id="agenda.cita.abrir"
      data-cita-card
      onClick={onClick}
      onKeyDown={(event) => activateOnKeys(event, onClick)}
      onPointerDown={onPointerDown}
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
      {esCompacta ? (
        <span className="block truncate text-sm font-semibold leading-5">{cita.clienteNombre}</span>
      ) : (
        // Chips cliente / servicio / profesional: todo el contexto de un vistazo.
        <span className="mt-0.5 flex min-w-0 flex-wrap gap-1">
          <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-foreground/8 px-1.5 py-0.5 text-op-xs font-semibold leading-4">
            <UserRound aria-hidden="true" className="size-3 shrink-0 opacity-70" />
            <span className="truncate">{cita.clienteNombre}</span>
          </span>
          {servicios ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-foreground/8 px-1.5 py-0.5 text-op-xs leading-4">
              <Scissors aria-hidden="true" className="size-3 shrink-0 opacity-70" />
              <span className="truncate">{servicios}</span>
            </span>
          ) : null}
          {showProfesional && cita.usuarioNombre ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-md bg-foreground/8 px-1.5 py-0.5 text-op-xs leading-4">
              <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-foreground/25" />
              <span className="truncate">{cita.usuarioNombre}</span>
            </span>
          ) : null}
        </span>
      )}
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
                data-action-id="agenda.cita.cobrar"
                onClick={() => onCobrar(cita)}
                type="button"
              >
                Cobrar
              </button>
            </span>
          ) : null}
        </span>
      ) : null}
      {resizeHandle ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 z-10 h-3.5 cursor-ns-resize opacity-0 transition-opacity [touch-action:none] group-hover/card:opacity-100 any-pointer-coarse:opacity-100"
          data-resize-handle
          onPointerDown={onPointerDownResize}
        >
          <span className="absolute inset-x-6 bottom-1 h-1 rounded-full bg-current opacity-40" />
        </span>
      ) : null}
    </div>
  );
}
