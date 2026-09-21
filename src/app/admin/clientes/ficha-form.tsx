"use client";

import { useActionState, useEffect, useRef } from "react";

import { saveFichaTecnica, type FichaActionState } from "@/app/admin/client-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const FICHA_TIPO_LABEL: Record<string, string> = {
  color: "Color",
  tratamiento: "Tratamiento",
  alergia: "Alergia",
  nota: "Nota",
};

const initialState: FichaActionState = {};

/**
 * Alta rápida en la ficha técnica del cliente. `citaId`/`servicioId` se pasan
 * como contexto oculto cuando se lanza desde el panel de una cita en curso.
 */
export function FichaForm({
  citaId,
  clienteId,
  compact = false,
  onSaved,
  organizationId,
  puedePrivada = false,
  servicioId,
  tipoDefault = "color",
}: {
  citaId?: string;
  clienteId: string;
  /** Versión compacta para el panel lateral de agenda. */
  compact?: boolean;
  onSaved?: () => void;
  organizationId: string;
  /** El usuario puede marcar la entrada como privada (`expedientes.privado`). */
  puedePrivada?: boolean;
  servicioId?: string;
  tipoDefault?: string;
}) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState(saveFichaTecnica, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<FichaActionState | null>(null);

  useEffect(() => {
    if (!state.success || handled.current === state) return;
    handled.current = state;
    toast.success(state.message ?? "Registro guardado.");
    formRef.current?.reset();
    onSaved?.();
  }, [onSaved, state, toast]);

  return (
    <form action={formAction} className={cn("space-y-3", compact && "space-y-2.5")} ref={formRef}>
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="clienteId" type="hidden" value={clienteId} />
      {citaId ? <input name="citaId" type="hidden" value={citaId} /> : null}
      {servicioId ? <input name="servicioId" type="hidden" value={servicioId} /> : null}

      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        <Field>
          <FieldLabel required>Tipo</FieldLabel>
          <Select defaultValue={tipoDefault} name="tipo">
            {Object.entries(FICHA_TIPO_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel>Tiempo de pose (min)</FieldLabel>
          <Input min="0" name="tiempoPoseMinutos" placeholder="Ej. 35" step="1" type="number" />
        </Field>
      </div>

      <Field>
        <FieldLabel>Fórmula / mezcla</FieldLabel>
        <Textarea
          name="formula"
          placeholder="Ej. 7.34 + 8.1 (1:1) con oxidante 20 vol"
          rows={compact ? 2 : 3}
        />
      </Field>
      {!compact ? (
        <Field>
          <FieldLabel>Notas</FieldLabel>
          <Textarea name="notas" placeholder="Reacciones, preferencias, observaciones" rows={2} />
        </Field>
      ) : null}
      {puedePrivada ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input className="size-4 accent-primary" name="privada" type="checkbox" value="true" />
          Nota privada — solo visible para quien tenga permiso de expediente privado
        </label>
      ) : null}

      <ActionFeedback state={state} />
      <Button className="rounded-xl" disabled={pending} type="submit">
        {pending ? "Guardando…" : "Registrar en ficha"}
      </Button>
    </form>
  );
}
