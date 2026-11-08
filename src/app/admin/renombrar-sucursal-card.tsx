"use client";

import { useActionState } from "react";

import {
  omitirNombreSucursalAction,
  renombrarSucursalAction,
} from "@/app/admin/sucursales/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { fieldError, initialActionState } from "@/lib/action-state";

/**
 * Tarjeta del inicio "¿Cómo se llama tu salón?": aparece cuando la
 * organización tiene una sola sucursal con el nombre genérico
 * "Sucursal principal". El input llega pre-llenado con el nombre del
 * negocio; "Ahora no" la descarta (cookie `melena_nombre_sucursal_*`)
 * sin tocar datos.
 */
export function RenombrarSucursalCard({
  organizationId,
  sucursalId,
  nombreSugerido,
}: {
  organizationId: string;
  sucursalId: string;
  /** Nombre del negocio, pre-llenado en el input. */
  nombreSugerido: string;
}) {
  const [state, action, pending] = useActionState(renombrarSucursalAction, initialActionState);
  const fe = (name: string) => fieldError(state, name);

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">¿Cómo se llama tu salón?</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Tu sucursal se creó como «Sucursal principal». Ponle el nombre con que la
            conocen tu equipo y tus clientes.
          </p>
        </div>
        <form action={omitirNombreSucursalAction}>
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="sucursalId" type="hidden" value={sucursalId} />
          <button
            className="min-h-9 rounded-lg px-2.5 text-op-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            data-action-id="inicio.sucursal.omitir_nombre"
            type="submit"
          >
            Ahora no
          </button>
        </form>
      </div>

      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input name="organizacionId" type="hidden" value={organizationId} />
        <input name="sucursalId" type="hidden" value={sucursalId} />
        <Field className="w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <FieldLabel required>Nombre de la sucursal</FieldLabel>
          <Input defaultValue={nombreSugerido} invalid={Boolean(fe("nombre"))} name="nombre" required />
          <FieldError error={fe("nombre")} />
        </Field>
        <Button
          className="rounded-xl"
          data-action-id="inicio.sucursal.renombrar"
          disabled={pending}
          type="submit"
        >
          {pending ? "Guardando…" : "Guardar nombre"}
        </Button>
        <ActionFeedback state={state} />
      </form>
    </section>
  );
}
