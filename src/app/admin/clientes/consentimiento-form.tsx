"use client";

import { useActionState, useEffect, useRef } from "react";

import { saveConsentimiento, type ConsentimientoActionState } from "@/app/admin/client-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const initialState: ConsentimientoActionState = {};

/**
 * Registro de consentimiento informado: texto que el cliente acepta o rechaza
 * antes del servicio, con el nombre del firmante como evidencia.
 */
export function ConsentimientoForm({
  citaId,
  clienteId,
  compact = false,
  nombreCliente,
  onSaved,
  organizationId,
  servicioId,
}: {
  citaId?: string;
  clienteId: string;
  compact?: boolean;
  /** Pre-llena "Firmado por" con el nombre del cliente. */
  nombreCliente?: string;
  onSaved?: () => void;
  organizationId: string;
  servicioId?: string;
}) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState(saveConsentimiento, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<ConsentimientoActionState | null>(null);

  useEffect(() => {
    if (!state.success || handled.current === state) return;
    handled.current = state;
    toast.success(state.message ?? "Consentimiento registrado.");
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
          <FieldLabel required>Título</FieldLabel>
          <Input name="titulo" placeholder="Consentimiento de depilación láser" required />
        </Field>
        <Field>
          <FieldLabel required>Firmado por</FieldLabel>
          <Input defaultValue={nombreCliente ?? ""} name="firmadoPor" placeholder="Nombre de quien firma" required />
        </Field>
      </div>

      <Field>
        <FieldLabel required>Texto del consentimiento</FieldLabel>
        <Textarea
          name="contenido"
          placeholder="Declaro que se me informaron los riesgos y cuidados del procedimiento…"
          required
          rows={compact ? 3 : 4}
        />
      </Field>

      <Field className="sm:max-w-52">
        <FieldLabel required>Respuesta</FieldLabel>
        <Select defaultValue="aceptado" name="respuesta">
          <option value="aceptado">Aceptado</option>
          <option value="rechazado">Rechazado</option>
        </Select>
      </Field>

      <ActionFeedback state={state} />
      <Button className="rounded-xl" disabled={pending} type="submit">
        {pending ? "Guardando…" : "Registrar consentimiento"}
      </Button>
    </form>
  );
}
