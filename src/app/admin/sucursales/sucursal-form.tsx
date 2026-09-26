"use client";

import { useActionState } from "react";

import { actualizarSucursalAction, crearSucursalAction } from "@/app/admin/sucursales/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";

export const ZONAS_HORARIAS_MX = [
  "America/Mexico_City",
  "America/Monterrey",
  "America/Merida",
  "America/Cancun",
  "America/Mazatlan",
  "America/Hermosillo",
  "America/Chihuahua",
  "America/Tijuana",
] as const;

export type SucursalEditable = {
  id: string;
  nombre: string;
  clave: string;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  zonaHoraria: string | null;
  capacidadSinAsignar: number;
  exigirCorteParaCobrar: boolean;
  reservasOnline: boolean;
  reservasAutoConfirmar: boolean;
  reservasCancelacionHoras: number;
  reservasAnticipacionMinutos: number;
  reservasHorizonteDias: number;
};

function ZonaHorariaSelect({ defaultValue }: { defaultValue?: string | null }) {
  const zonas = defaultValue && !ZONAS_HORARIAS_MX.includes(defaultValue as (typeof ZONAS_HORARIAS_MX)[number])
    ? [defaultValue, ...ZONAS_HORARIAS_MX]
    : [...ZONAS_HORARIAS_MX];
  return (
    <Select defaultValue={defaultValue ?? "America/Mexico_City"} name="zonaHoraria">
      {zonas.map((zona) => (
        <option key={zona} value={zona}>
          {zona.replace("America/", "").replace("_", " ")}
        </option>
      ))}
    </Select>
  );
}

/** Alta de sucursal. El límite del plan se valida en el servidor. */
export function SucursalNuevaForm({ organizationId, deshabilitado }: { organizationId: string; deshabilitado?: boolean }) {
  const [state, action, pending] = useActionState(crearSucursalAction, initialActionState);

  return (
    <form action={action} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input name="nombre" placeholder="Sucursal Centro" required />
        </Field>
        <Field>
          <FieldLabel required>Clave</FieldLabel>
          <Input name="clave" placeholder="centro" required />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel>Dirección</FieldLabel>
          <Input name="direccion" placeholder="Calle, número, colonia, ciudad" />
        </Field>
        <Field>
          <FieldLabel>Teléfono</FieldLabel>
          <Input name="telefono" placeholder="55 1234 5678" />
        </Field>
        <Field>
          <FieldLabel>Correo</FieldLabel>
          <Input name="correo" placeholder="sucursal@negocio.mx" type="email" />
        </Field>
        <Field>
          <FieldLabel>Zona horaria</FieldLabel>
          <ZonaHorariaSelect />
        </Field>
      </div>
      <ActionFeedback state={state} />
      <Button className="rounded-xl" data-action-clave="1" size="lg" data-action-id="sucursales.sucursal.crear" disabled={pending || deshabilitado} type="submit">
        {pending ? "Creando…" : "Crear sucursal"}
      </Button>
    </form>
  );
}

/** Edición completa: datos + políticas de caja y reservas en línea. */
export function SucursalEditarForm({ organizationId, sucursal }: { organizationId: string; sucursal: SucursalEditable }) {
  const [state, action, pending] = useActionState(actualizarSucursalAction, initialActionState);

  return (
    <form action={action} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursal.id} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={sucursal.nombre} name="nombre" required />
        </Field>
        <Field>
          <FieldLabel required>Clave</FieldLabel>
          <Input defaultValue={sucursal.clave} name="clave" required />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel>Dirección</FieldLabel>
          <Input defaultValue={sucursal.direccion ?? ""} name="direccion" />
        </Field>
        <Field>
          <FieldLabel>Teléfono</FieldLabel>
          <Input defaultValue={sucursal.telefono ?? ""} name="telefono" />
        </Field>
        <Field>
          <FieldLabel>Correo</FieldLabel>
          <Input defaultValue={sucursal.correo ?? ""} name="correo" type="email" />
        </Field>
        <Field>
          <FieldLabel>Zona horaria</FieldLabel>
          <ZonaHorariaSelect defaultValue={sucursal.zonaHoraria} />
        </Field>
        <Field>
          <FieldLabel>Citas simultáneas sin asignar</FieldLabel>
          <Input defaultValue={sucursal.capacidadSinAsignar} min={1} max={20} name="capacidadSinAsignar" type="number" />
        </Field>
      </div>

      <fieldset className="space-y-2 rounded-xl border border-border p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Caja y reservas</legend>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input defaultChecked={sucursal.exigirCorteParaCobrar} name="exigirCorteParaCobrar" type="checkbox" />
          Exigir corte de caja abierto para cobrar
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input defaultChecked={sucursal.reservasOnline} name="reservasOnline" type="checkbox" />
          Aceptar reservas en línea
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input defaultChecked={sucursal.reservasAutoConfirmar} name="reservasAutoConfirmar" type="checkbox" />
          Confirmar reservas web automáticamente
        </label>
        <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-3">
          <Field>
            <FieldLabel>Corte cambios (h)</FieldLabel>
            <Input defaultValue={sucursal.reservasCancelacionHoras} min={0} name="reservasCancelacionHoras" type="number" />
          </Field>
          <Field>
            <FieldLabel>Anticipación (min)</FieldLabel>
            <Input defaultValue={sucursal.reservasAnticipacionMinutos} min={0} name="reservasAnticipacionMinutos" type="number" />
          </Field>
          <Field>
            <FieldLabel>Horizonte (días)</FieldLabel>
            <Input defaultValue={sucursal.reservasHorizonteDias} min={1} name="reservasHorizonteDias" type="number" />
          </Field>
        </div>
      </fieldset>

      <ActionFeedback state={state} />
      <Button className="rounded-xl" disabled={pending} type="submit" variant="outline">
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
