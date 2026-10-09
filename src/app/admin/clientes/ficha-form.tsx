"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { saveFichaTecnica, type FichaActionState } from "@/app/admin/client-actions";
import { FichaFotosField } from "@/components/media-image-field";
import { RecetarioEditor } from "@/components/recetario-editor";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Select, Textarea } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const FICHA_TIPO_LABEL: Record<string, string> = {
  color: "Color / Tinte",
  tratamiento: "Tratamiento / Cuidado",
  alergia: "Alergia / Advertencia",
  nota: "Nota de expediente",
};

const initialState: FichaActionState = {};

/**
 * Alta rápida en la ficha técnica del cliente con recetario químico estructurado
 * para color/tratamiento y captura dual Antes/Después.
 */
export function FichaForm({
  citaId,
  clienteId,
  clienteNombre,
  compact = false,
  onSaved,
  organizationId,
  puedePrivada = false,
  servicioId,
  servicioNombre,
  sucursalId,
  tipoDefault = "color",
}: {
  citaId?: string;
  clienteId: string;
  clienteNombre?: string;
  /** Versión compacta para el panel lateral de agenda o vista rápida. */
  compact?: boolean;
  onSaved?: () => void;
  organizationId: string;
  /** El usuario puede marcar la entrada como privada (`expedientes.privado`). */
  puedePrivada?: boolean;
  servicioId?: string;
  servicioNombre?: string;
  sucursalId?: string;
  tipoDefault?: string;
}) {
  const toast = useToast();
  const [state, formAction, pending] = useActionState(saveFichaTecnica, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<FichaActionState | null>(null);
  const [tipo, setTipo] = useState(tipoDefault);
  // El id de la ficha se genera en cliente para que las fotos suban a R2 con
  // `entidadId` definitivo antes de que la fila exista; la acción lo reutiliza
  // como PK y valida que las llaves pertenecen a ese id.
  const [fichaId, setFichaId] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!state.success || handled.current === state) return;
    handled.current = state;
    toast.success(state.message ?? "Registro guardado.");
    formRef.current?.reset();
    setFichaId(crypto.randomUUID());
    onSaved?.();
  }, [onSaved, state, toast]);

  const esQuimicoOTratamiento = tipo === "color" || tipo === "tratamiento";

  return (
    <form action={formAction} className={cn("space-y-4", compact && "space-y-3")} ref={formRef}>
      <input name="id" type="hidden" value={fichaId} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="clienteId" type="hidden" value={clienteId} />
      {sucursalId ? <input name="sucursalId" type="hidden" value={sucursalId} /> : null}
      {citaId ? <input name="citaId" type="hidden" value={citaId} /> : null}
      {servicioId ? <input name="servicioId" type="hidden" value={servicioId} /> : null}

      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        <Field>
          <FieldLabel required>Tipo de registro</FieldLabel>
          <Select
            name="tipo"
            onChange={(e) => setTipo(e.target.value)}
            value={tipo}
          >
            {Object.entries(FICHA_TIPO_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {esQuimicoOTratamiento ? (
        <RecetarioEditor
          citaId={citaId}
          clienteId={clienteId}
          clienteNombre={clienteNombre}
          entidadId={fichaId}
          key={fichaId}
          organizationId={organizationId}
          servicioNombre={servicioNombre}
        />
      ) : (
        <div className="space-y-3">
          <Field>
            <FieldLabel>Detalle / observaciones</FieldLabel>
            <Textarea
              name="notas"
              placeholder={
                tipo === "alergia"
                  ? "Ej. Alergia a amoníaco, picazón con decolorantes fuertes..."
                  : "Notas y preferencias del cliente"
              }
              rows={compact ? 2 : 3}
            />
          </Field>
          <Field>
            <FieldLabel>Fotos de evidencia</FieldLabel>
            <FichaFotosField entidadId={fichaId} key={fichaId} organizacionId={organizationId} />
          </Field>
        </div>
      )}

      {puedePrivada ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
          <input className="size-4 accent-primary" name="privada" type="checkbox" value="true" />
          Nota privada — solo visible para quien tenga permiso de expediente privado
        </label>
      ) : null}

      <ActionFeedback state={state} />
      <Button className="w-full rounded-xl" disabled={pending} type="submit">
        {pending ? "Guardando en ficha…" : "Guardar en ficha técnica"}
      </Button>
    </form>
  );
}
