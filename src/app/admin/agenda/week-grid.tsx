"use client";

import Link from "next/link";

import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getZonedParts } from "@/modules/agenda";

import type { AgendaCita } from "./agenda-types";
import { CitaCard } from "./cita-card";

/**
 * Vista semana: una tarjeta por día con las citas compactas (estado dominante,
 * profesional dentro de la tarjeta). El encabezado enlaza a la vista día.
 */
export function WeekGrid({
  weekDays,
  citas,
  currency,
  timeZone,
  fecha,
  hrefForDia,
  onSelectCita,
  onCobrarCita,
}: {
  weekDays: string[];
  citas: AgendaCita[];
  currency: string;
  timeZone: string;
  /** Día seleccionado (se resalta en la rejilla). */
  fecha: string;
  hrefForDia: (day: string) => string;
  onSelectCita: (id: string) => void;
  onCobrarCita: (cita: AgendaCita) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
      {weekDays.map((day) => {
        const dayCitas = citas.filter(
          (cita) => getZonedParts(new Date(cita.fechaHora), timeZone).dayKey === day,
        );
        const isSelected = day === fecha;
        return (
          <section
            className={cn(
              "min-h-48 rounded-2xl border bg-card p-3 shadow-sm",
              isSelected ? "border-primary/60 ring-1 ring-primary/25" : "border-border",
            )}
            key={day}
          >
            <Link
              className="flex items-center justify-between rounded-lg px-1 pb-2 text-sm font-semibold text-foreground hover:text-primary"
              href={hrefForDia(day)}
            >
              {formatDate(`${day}T12:00:00Z`, { timeZone: "UTC" })}
              <span className="rounded-full bg-muted px-2 py-0.5 text-op-xs tabular-nums text-muted-foreground">
                {dayCitas.length}
              </span>
            </Link>
            <div className="space-y-2">
              {dayCitas.map((cita) => (
                <CitaCard
                  cita={cita}
                  compact={cita.duracionMinutos <= 60}
                  currency={currency}
                  key={cita.id}
                  onClick={() => onSelectCita(cita.id)}
                  onCobrar={onCobrarCita}
                  showProfesional
                  timeZone={timeZone}
                />
              ))}
              {dayCitas.length === 0 ? (
                <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
                  Sin citas
                </p>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
