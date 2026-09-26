"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";

import {
  agregarNotaIncidente,
  asignarIncidente,
  cambiarEstadoIncidente,
  cambiarPrioridadIncidente,
  resolverIncidente,
} from "../actions";

function useFormConToast(
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>,
) {
  const toast = useToast();
  const wrapped = async (prev: ActionState, formData: FormData) => {
    const state = await action(prev, formData);
    if (state.success) {
      toast.success(state.message ?? "Listo");
    } else if (state.error) {
      toast.error(state.error);
    }
    return state;
  };
  return useActionState(wrapped, initialActionState);
}

/** Controles de triage del incidente: estado, prioridad, responsable. */
export function IncidenteControles({
  incidenteId,
  estado,
  prioridad,
  asignadoA,
  administradores,
}: {
  incidenteId: string;
  estado: string;
  prioridad: string;
  asignadoA: string | null;
  administradores: { id: string; nombre: string }[];
}) {
  const [, accionEstado, pendingEstado] = useFormConToast(cambiarEstadoIncidente);
  const [, accionPrioridad, pendingPrioridad] = useFormConToast(cambiarPrioridadIncidente);
  const [, accionAsignar, pendingAsignar] = useFormConToast(asignarIncidente);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <form action={accionEstado} className="flex items-end gap-2">
        <input name="incidenteId" type="hidden" value={incidenteId} />
        <Field className="flex-1">
          <FieldLabel htmlFor="estado">Estado</FieldLabel>
          <Select defaultValue={estado} id="estado" name="estado">
            <option value="nuevo">Nuevo</option>
            <option value="en_revision">En revisión</option>
            <option value="en_progreso">En progreso</option>
            <option value="resuelto">Resuelto</option>
            <option value="ignorado">Ignorado</option>
          </Select>
        </Field>
        <Button className="min-h-10" disabled={pendingEstado} type="submit" variant="secondary">
          Guardar
        </Button>
      </form>

      <form action={accionPrioridad} className="flex items-end gap-2">
        <input name="incidenteId" type="hidden" value={incidenteId} />
        <Field className="flex-1">
          <FieldLabel htmlFor="prioridad">Prioridad</FieldLabel>
          <Select defaultValue={prioridad} id="prioridad" name="prioridad">
            <option value="p0">P0 · Crítica</option>
            <option value="p1">P1 · Alta</option>
            <option value="p2">P2 · Media</option>
            <option value="p3">P3 · Baja</option>
          </Select>
        </Field>
        <Button className="min-h-10" disabled={pendingPrioridad} type="submit" variant="secondary">
          Guardar
        </Button>
      </form>

      <form action={accionAsignar} className="flex items-end gap-2">
        <input name="incidenteId" type="hidden" value={incidenteId} />
        <Field className="flex-1">
          <FieldLabel htmlFor="asignadoA">Responsable</FieldLabel>
          <Select defaultValue={asignadoA ?? ""} id="asignadoA" name="asignadoA">
            <option value="">Sin asignar</option>
            {administradores.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Button className="min-h-10" disabled={pendingAsignar} type="submit" variant="secondary">
          Asignar
        </Button>
      </form>
    </div>
  );
}

/** Formulario de resolución: nota obligatoria + release donde se corrigió. */
export function IncidenteResolver({ incidenteId }: { incidenteId: string }) {
  const [state, accion, pending] = useFormConToast(resolverIncidente);
  return (
    <form action={accion} className="space-y-4">
      <input name="incidenteId" type="hidden" value={incidenteId} />
      <Field>
        <FieldLabel htmlFor="nota" required>
          ¿Cómo se solucionó?
        </FieldLabel>
        <Textarea
          id="nota"
          invalid={Boolean(state.fieldErrors?.nota)}
          name="nota"
          placeholder="Ej. Se corrigió la validación del horario al agendar en sucursal nueva."
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="releaseCorregido">Versión donde se corrigió (opcional)</FieldLabel>
        <Input id="releaseCorregido" name="releaseCorregido" placeholder="Ej. commit 1ecc221" />
      </Field>
      {state.error ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button className="min-h-10" disabled={pending} type="submit">
        Marcar como resuelto
      </Button>
    </form>
  );
}

/** Nota interna de seguimiento (sin cambiar el estado). */
export function IncidenteNota({ incidenteId }: { incidenteId: string }) {
  const [state, accion, pending] = useFormConToast(agregarNotaIncidente);
  return (
    <form action={accion} className="space-y-3">
      <input name="incidenteId" type="hidden" value={incidenteId} />
      <Field>
        <FieldLabel htmlFor="comentario">Agregar nota interna</FieldLabel>
        <Textarea
          id="comentario"
          invalid={Boolean(state.fieldErrors?.comentario)}
          name="comentario"
          placeholder="Contexto, hallazgos o pasos para reproducir…"
          rows={2}
        />
      </Field>
      <Button className="min-h-10" disabled={pending} type="submit" variant="secondary">
        Agregar nota
      </Button>
    </form>
  );
}
