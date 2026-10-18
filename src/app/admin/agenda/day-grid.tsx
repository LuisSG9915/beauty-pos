"use client";

import { Plus, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { categoryTone } from "@/lib/category-color";
import { trackAction } from "@/lib/telemetry/cliente";
import { cn } from "@/lib/utils";
import { getZonedParts, isCitaEditable } from "@/modules/agenda";

import { useArrastreCita, type SoltarDuracion, type SoltarMover } from "./agenda-drag";
import type { AgendaBloqueo, AgendaCita, AgendaHorario } from "./agenda-types";
import { COLUMN_HEADER_PX, HOUR_PX, PX_PER_MIN, BLOQUEO_LABEL } from "./agenda-types";
import { citaInterval, etiquetaMinuto, iniciales, layoutCitas, minutoDesdeY, pad2 } from "./agenda-utils";
import { CitaCard } from "./cita-card";

type Columna = { id: string; nombre: string };

export type DayGridData = {
  columns: Columna[];
  columnsVisibles: Columna[];
  citasPorColumna: Map<string, AgendaCita[]>;
  bloqueos: AgendaBloqueo[];
  turnosDia: AgendaHorario[];
  startMin: number;
  endMin: number;
  hours: number[];
  dayStartMs: number | null;
  minutoActual: number | null;
  isMd: boolean;
  /** Fecha visible (`YYYY-MM-DD`): reposiciona la rejilla al cambiar de día. */
  fecha: string;
};

/** Clic sobre el fondo o sus pistas (nunca sobre tarjetas/bloqueos/controles). */
function esHueco(target: HTMLElement) {
  return !target.closest(
    "[data-cita-card], [data-bloqueo], button, a, input, select, textarea",
  );
}

/**
 * Rejilla del día: columnas por profesional, horas a la izquierda, bloqueos y
 * tarjetas posicionadas. El color dominante de cada tarjeta es el estado de la
 * cita; el clic en un hueco abre "Nueva cita" con el horario precargado.
 *
 * El arrastre (Pointer Events, ver agenda-drag.ts) muestra un fantasma con la
 * hora destino; el asa inferior de cada tarjeta cambia la duración. Citas
 * traslapadas se reparten carriles (`layoutCitas`) y llevan `pattern-conflicto`.
 */
export function DayGrid({
  data,
  sucursalNombre,
  currency,
  timeZone,
  pending,
  columnaMovil,
  onColumnaMovil,
  onClickHueco,
  onSelectCita,
  onCobrarCita,
  onSoltarMover,
  onSoltarDuracion,
  ultimaCitaTocada,
}: {
  data: DayGridData;
  sucursalNombre: string;
  currency: string;
  timeZone: string;
  pending: boolean;
  columnaMovil: string;
  onColumnaMovil: (id: string) => void;
  /** Minuto del día bajo el puntero (snap 15) + profesional de la columna. */
  onClickHueco: (minutos: number, usuarioId: string) => void;
  onSelectCita: (id: string) => void;
  onCobrarCita: (cita: AgendaCita) => void;
  onSoltarMover: (resultado: SoltarMover) => void;
  onSoltarDuracion: (resultado: SoltarDuracion) => void;
  /** Pulso de confirmación en la tarjeta recién movida/ajustada. */
  ultimaCitaTocada: string | null;
}) {
  const {
    columns,
    columnsVisibles,
    citasPorColumna,
    bloqueos,
    turnosDia,
    startMin,
    endMin,
    hours,
    dayStartMs,
    minutoActual,
    isMd,
    fecha,
  } = data;

  const cardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoverHueco, setHoverHueco] = useState<{ columnaId: string; minuto: number } | null>(null);

  // En móvil hay un solo carril visible: "mover" queda fijado a ese profesional.
  const { arrastre, consumirClick, iniciarGesto } = useArrastreCita({
    gridRef: scrollRef,
    startMin,
    endMin,
    timeZone,
    columnaUnica: isMd ? undefined : columnaMovil,
    disabled: pending,
    onSoltarMover,
    onSoltarDuracion,
  });

  // Primer minuto con cita entre las columnas visibles (en móvil solo hay
  // una): es el destino de scroll cuando el día aún no empieza o es otro día.
  const primeraCitaMinuto = useMemo(() => {
    let min: number | null = null;
    for (const column of columnsVisibles) {
      for (const cita of citasPorColumna.get(column.id) ?? []) {
        const minuto = getZonedParts(new Date(cita.fechaHora), timeZone).minutosDelDia;
        if (min === null || minuto < min) min = minuto;
      }
    }
    return min;
  }, [columnsVisibles, citasPorColumna, timeZone]);

  // Autoposición al entrar o cambiar de fecha: la rejilla interna se abre en
  // la hora actual (si es hoy) o en la primera cita del profesional visible.
  // Idempotente: el efecto puede correr dos veces (StrictMode) y posiciona lo mismo.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const region = scrollRef.current;
      if (!region) return;
      const ahora = getZonedParts(new Date(), timeZone);
      const objetivo =
        ahora.dayKey === fecha ? ahora.minutosDelDia : (primeraCitaMinuto ?? startMin);
      region.scrollTop = Math.max(
        0,
        (objetivo - startMin) * PX_PER_MIN - COLUMN_HEADER_PX - HOUR_PX / 2,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [fecha, isMd, startMin, primeraCitaMinuto, timeZone]);

  const fondoLineas = `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, color-mix(in srgb, var(--border) 80%, transparent) ${HOUR_PX - 1}px, color-mix(in srgb, var(--border) 80%, transparent) ${HOUR_PX}px), repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX / 4 - 1}px, color-mix(in srgb, var(--border) 45%, transparent) ${HOUR_PX / 4 - 1}px, color-mix(in srgb, var(--border) 45%, transparent) ${HOUR_PX / 4}px)`;

  const minutoLabel = minutoActual !== null ? etiquetaMinuto(minutoActual) : null;

  const clickEnHueco = (event: MouseEvent<HTMLDivElement>, columnaId: string) => {
    const objetivo = event.target as HTMLElement;
    if (!esHueco(objetivo)) return;
    if (consumirClick()) return; // clic residual tras un arrastre.
    const rect = event.currentTarget.getBoundingClientRect();
    const minuto = minutoDesdeY(event.clientY, rect.top, startMin, endMin, 15);
    trackAction("agenda.vacio.crear");
    onClickHueco(minuto, columnaId);
  };

  const moverEnHueco = (event: MouseEvent<HTMLDivElement>, columnaId: string) => {
    if (arrastre) {
      if (hoverHueco) setHoverHueco(null);
      return;
    }
    const objetivo = event.target as HTMLElement;
    if (!esHueco(objetivo)) {
      if (hoverHueco) setHoverHueco(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const minuto = minutoDesdeY(event.clientY, rect.top, startMin, endMin, 15);
    setHoverHueco((prev) =>
      prev?.columnaId === columnaId && prev.minuto === minuto ? prev : { columnaId, minuto },
    );
  };

  return (
    // Scroll interno en ambos ejes: permite que los encabezados de columna
    // queden sticky (top-0) al desplazarse verticalmente por el día.
    // tabIndex: la región scrollable debe ser alcanzable con teclado (WCAG).
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
      ref={cardRef}
    >
      {columns.length > 1 ? (
        <div
          aria-label="Profesional visible"
          className="flex gap-1.5 overflow-x-auto border-b border-border bg-muted/40 p-1.5 md:hidden"
          role="tablist"
        >
          {columns.map((column) => {
            const activo = columnaMovil === column.id;
            const tone = categoryTone(column.id || "sin-asignar");
            const total = citasPorColumna.get(column.id)?.length ?? 0;
            return (
              <button
                aria-selected={activo}
                className={cn(
                  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-op-xs font-medium transition-colors active:scale-95",
                  activo ? "border-primary/40 bg-accent text-accent-foreground shadow-xs font-semibold" : "border-border bg-card text-muted-foreground",
                )}
                key={column.id || "sin-asignar"}
                onClick={() => onColumnaMovil(column.id)}
                role="tab"
                type="button"
              >
                <span className={cn("flex size-5.5 items-center justify-center rounded-full border text-op-xs font-semibold", tone.chip)}>
                  {column.id ? iniciales(column.nombre) : <UserRound aria-hidden="true" className="size-3" />}
                </span>
                <span className="max-w-28 truncate">{column.nombre}</span>
                <span className="rounded-full bg-background px-1.5 py-0.5 text-op-xs tabular-nums">{total}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        aria-label={`Citas del día por profesional en ${sucursalNombre}`}
        className="max-h-[calc(100dvh-13.5rem)] overflow-auto overscroll-contain sm:max-h-[calc(100dvh-10rem)]"
        data-agenda-grid
        ref={scrollRef}
        role="region"
        tabIndex={0}
      >
        <div className={cn("flex", isMd && "min-w-[760px]")}>
          <div
            className="sticky left-0 z-20 w-14 shrink-0 border-r border-border bg-card"
            style={{ paddingTop: COLUMN_HEADER_PX }}
          >
            {hours.map((hour) => (
              <div className="relative" key={hour} style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-2 text-op-xs font-medium text-muted-foreground">
                  {pad2(hour)}:00
                </span>
              </div>
            ))}
          </div>
          {columnsVisibles.map((column, index) => {
            const columnCitas = citasPorColumna.get(column.id) ?? [];
            const columnBloqueos = bloqueos.filter(
              (bloqueo) => bloqueo.usuarioId === null || bloqueo.usuarioId === column.id,
            );
            const layout = layoutCitas(columnCitas, timeZone);
            const tone = categoryTone(column.id || "sin-asignar");
            return (
              <section
                aria-label={column.nombre || "Sin asignar"}
                className={cn(
                  "min-w-0 flex-1 transition-colors md:min-w-[150px]",
                  index > 0 && "border-l border-border",
                  arrastre?.columnaId === column.id && arrastre.modo === "mover" && "bg-accent/40",
                )}
                key={column.id || "sin-asignar"}
              >
                <h3
                  className="sticky top-0 z-10 flex items-center justify-center gap-2 border-b border-border bg-card/95 px-2 backdrop-blur-sm"
                  style={{ height: COLUMN_HEADER_PX }}
                >
                  <span
                    className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-op-xs font-semibold", tone.chip)}
                    style={{ borderColor: tone.accentVar }}
                  >
                    {column.id ? iniciales(column.nombre) : <UserRound aria-hidden="true" className="size-4" />}
                  </span>
                  <span className="truncate text-sm font-semibold text-foreground">{column.nombre}</span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-op-xs tabular-nums text-muted-foreground">
                    {columnCitas.length}
                  </span>
                </h3>
                <div
                  className="group relative cursor-cell bg-background"
                  data-columna-id={column.id}
                  onClick={(event) => clickEnHueco(event, column.id)}
                  onMouseLeave={() => setHoverHueco((prev) => (prev?.columnaId === column.id ? null : prev))}
                  onMouseMove={(event) => moverEnHueco(event, column.id)}
                  style={{ height: (endMin - startMin) * PX_PER_MIN, backgroundImage: fondoLineas }}
                  title="Toca un horario libre para agendar"
                >
                  {turnosDia.length === 0 ? (
                    <div className="absolute inset-0 z-0 bg-muted/60 p-3 text-center text-sm font-medium text-muted-foreground">
                      Sin horario configurado
                    </div>
                  ) : null}
                  {/* Pista de creación: "Crear cita HH:mm" sigue al puntero sobre huecos. */}
                  {turnosDia.length > 0 && hoverHueco?.columnaId === column.id && !arrastre ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-2 z-[4] flex justify-center"
                      style={{ top: (hoverHueco.minuto - startMin) * PX_PER_MIN }}
                    >
                      <span className="flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-primary/60 bg-card/95 px-2.5 py-1 text-op-xs font-semibold text-primary shadow-sm">
                        <Plus className="size-3.5" />
                        Crear cita {etiquetaMinuto(hoverHueco.minuto)}
                      </span>
                    </div>
                  ) : null}
                  {columnCitas.length === 0 && turnosDia.length > 0 ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-2 top-1/3 z-[1] text-center text-op-xs font-medium text-muted-foreground/70"
                    >
                      <Plus className="mx-auto mb-1 size-5 opacity-60" />
                      Toca un horario para agendar
                    </div>
                  ) : null}
                  {minutoActual !== null && minutoActual >= startMin && minutoActual <= endMin ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 z-[3]"
                      style={{ top: (minutoActual - startMin) * PX_PER_MIN }}
                    >
                      <div className="border-t-[3px] border-primary" />
                      {index === 0 && minutoLabel ? (
                        <span className="absolute -top-3 left-0.5 z-[4] rounded-md bg-primary px-1.5 py-0.5 text-op-xs font-bold text-primary-foreground shadow-sm">
                          {minutoLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {columnBloqueos.map((bloqueo) => {
                    if (dayStartMs === null) return null;
                    const inicia = new Date(bloqueo.iniciaAt).getTime();
                    const termina = new Date(bloqueo.terminaAt).getTime();
                    const dayStart = dayStartMs + startMin * 60_000;
                    const dayEnd = dayStartMs + endMin * 60_000;
                    if (termina <= dayStart || inicia >= dayEnd) return null;
                    const top = (Math.max(inicia, dayStart) - dayStart) / 60_000 * PX_PER_MIN;
                    const height = Math.max((Math.min(termina, dayEnd) - Math.max(inicia, dayStart)) / 60_000 * PX_PER_MIN, 24);
                    return (
                      <div
                        className="absolute inset-x-1 z-[1] rounded-lg border border-dashed border-muted-foreground/40 bg-muted/80 px-2 py-1 text-op-xs font-medium text-muted-foreground"
                        data-bloqueo
                        key={bloqueo.id}
                        style={{ top, height }}
                        title={bloqueo.motivo ?? BLOQUEO_LABEL[bloqueo.tipo] ?? "Bloqueo"}
                      >
                        {BLOQUEO_LABEL[bloqueo.tipo] ?? "Bloqueo"}
                      </div>
                    );
                  })}
                  {/* Fantasma del arrastre: horario destino con snap de 15 min. */}
                  {arrastre && arrastre.columnaId === column.id ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-1 z-[5] rounded-lg border-2 border-dashed border-primary bg-primary/10"
                      style={{
                        top: (arrastre.minutoInicio - startMin) * PX_PER_MIN,
                        height: Math.max(arrastre.duracion * PX_PER_MIN, 20),
                      }}
                    >
                      <span className="absolute left-1 top-1 rounded-md bg-primary px-1.5 py-0.5 text-op-xs font-bold text-primary-foreground shadow-sm">
                        {etiquetaMinuto(arrastre.minutoInicio)}–{etiquetaMinuto(arrastre.minutoInicio + arrastre.duracion)}
                      </span>
                    </div>
                  ) : null}
                  {columnCitas.map((cita, citaIndex) => {
                    const interval = citaInterval(cita);
                    const top = (getZonedParts(new Date(cita.fechaHora), timeZone).minutosDelDia - startMin) * PX_PER_MIN;
                    const height = Math.max((interval.terminaAtMs - interval.iniciaAtMs) / 60_000 * PX_PER_MIN, 34);
                    const pos = layout.get(cita.id) ?? { lane: 0, lanes: 1 };
                    const editable = isCitaEditable(cita.estado);
                    const enArrastre = arrastre?.citaId === cita.id;
                    return (
                      <CitaCard
                        arrastrable={editable && !pending}
                        cita={cita}
                        className={cn(
                          "absolute z-[2]",
                          pos.lanes > 1 && "pattern-conflicto",
                          enArrastre && "opacity-40",
                          ultimaCitaTocada === cita.id && "anim-pulso",
                        )}
                        currency={currency}
                        key={cita.id}
                        onClick={() => {
                          if (consumirClick()) return;
                          onSelectCita(cita.id);
                        }}
                        onCobrar={onCobrarCita}
                        onPointerDown={
                          editable ? (event) => iniciarGesto(event, cita, "mover") : undefined
                        }
                        onPointerDownResize={
                          editable ? (event) => iniciarGesto(event, cita, "duracion") : undefined
                        }
                        resizeHandle={editable}
                        style={{
                          top,
                          height,
                          left: `calc(${(pos.lane * 100) / pos.lanes}% + 2px)`,
                          width: `calc(${100 / pos.lanes}% - 4px)`,
                          animationDelay: `${Math.min(citaIndex, 8) * 30}ms`,
                        }}
                        timeZone={timeZone}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
