"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { formatDate, formatTime } from "@/lib/format";

import type { CitaMutationResult } from "./actions";
import type { AgendaCita, MoveMode } from "./agenda-types";
import { dateTimeInputValue } from "./agenda-utils";

/** Mueve o reagenda una cita sin arrastrar: fecha, hora y profesional. */
export function MoveCitaDialog({
  cita,
  mode,
  pending,
  staff,
  timeZone,
  onClose,
  onSubmit,
}: {
  cita: AgendaCita | null;
  mode: MoveMode | null;
  pending: boolean;
  staff: Array<{ id: string; nombre: string }>;
  timeZone: string;
  onClose: () => void;
  onSubmit: (fechaHora: string, usuarioId: string | null) => Promise<CitaMutationResult>;
}) {
  const initial = cita ? dateTimeInputValue(cita.fechaHora, timeZone) : "";
  const [fecha, setFecha] = useState(initial.slice(0, 10));
  const [hora, setHora] = useState(initial.slice(11, 16));
  const [usuarioId, setUsuarioId] = useState(cita?.usuarioId ?? "");
  const [sugerencias, setSugerencias] = useState<string[]>([]);

  if (!cita || !mode) return null;

  const aplicarSugerencia = (iso: string) => {
    const local = dateTimeInputValue(iso, timeZone);
    setFecha(local.slice(0, 10));
    setHora(local.slice(11, 16));
    setSugerencias([]);
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="w-[min(92vw,28rem)]">
        <DialogHeader>
          <DialogTitle>{mode === "mover" ? "Mover cita" : "Cambiar fecha de la cita"}</DialogTitle>
          <DialogDescription>
            {mode === "mover"
              ? "Elige la nueva fecha, hora y profesional sin arrastrar la tarjeta."
              : "La cita volverá a estado agendada en el nuevo horario."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await onSubmit(`${fecha}T${hora}`, usuarioId || null);
            if (result.success) {
              onClose();
            } else {
              setSugerencias(result.sugerencias ?? []);
            }
          }}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel required>Fecha</FieldLabel>
              <Input onChange={(event) => setFecha(event.target.value)} required type="date" value={fecha} />
            </Field>
            <Field>
              <FieldLabel required>Hora</FieldLabel>
              <Input onChange={(event) => setHora(event.target.value)} required type="time" value={hora} />
            </Field>
          </div>
          <Field>
            <FieldLabel>Profesional</FieldLabel>
            <Select onChange={(event) => setUsuarioId(event.target.value)} value={usuarioId}>
              <option value="">Sin asignar</option>
              {staff.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </Select>
          </Field>
          {sugerencias.length > 0 ? (
            <div className="rounded-xl border border-border bg-muted/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Horarios libres sugeridos
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sugerencias.map((iso) => (
                  <button
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-accent/70"
                    key={iso}
                    onClick={() => aplicarSugerencia(iso)}
                    type="button"
                  >
                    {formatDate(iso, { timeZone })} · {formatTime(iso, { timeZone })}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-op-xs text-muted-foreground">
                Elige una sugerencia para rellenar fecha y hora, luego confirma.
              </p>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={onClose} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={pending || !fecha || !hora} type="submit">
              {pending ? "Guardando..." : mode === "mover" ? "Mover cita" : "Cambiar fecha"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
