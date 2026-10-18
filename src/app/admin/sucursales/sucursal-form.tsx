"use client";

import { useActionState } from "react";

import { actualizarSucursalAction, crearSucursalAction } from "@/app/admin/sucursales/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";

export const ZONAS_HORARIAS_MX = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Tijuana",
  "America/Hermosillo",
  "America/Mazatlan",
  "America/Chihuahua",
  "America/Monterrey",
  "America/Merida",
] as const;

/**
 * Etiquetas legibles de las zonas horarias de México; el valor enviado y
 * guardado sigue siendo el identificador IANA.
 */
export const ZONA_HORARIA_LABELS: Record<(typeof ZONAS_HORARIAS_MX)[number], string> = {
  "America/Mexico_City": "Centro (CDMX, Guadalajara, Monterrey)",
  "America/Cancun": "Quintana Roo",
  "America/Tijuana": "Baja California",
  "America/Hermosillo": "Sonora",
  "America/Mazatlan": "Pacífico (Sinaloa, Nayarit, BCS)",
  "America/Chihuahua": "Chihuahua",
  "America/Monterrey": "Noreste",
  "America/Merida": "Yucatán/Campeche",
};

export function zonaHorariaLabel(zona: string | null | undefined): string {
  if (!zona) return "Zona del negocio";
  return (
    ZONA_HORARIA_LABELS[zona as (typeof ZONAS_HORARIAS_MX)[number]] ??
    zona.replace("America/", "").replaceAll("_", " ")
  );
}

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
  const zonas =
    defaultValue && !ZONAS_HORARIAS_MX.includes(defaultValue as (typeof ZONAS_HORARIAS_MX)[number])
      ? [defaultValue, ...ZONAS_HORARIAS_MX]
      : [...ZONAS_HORARIAS_MX];
  return (
    <Select defaultValue={defaultValue ?? "America/Mexico_City"} name="zonaHoraria">
      {zonas.map((zona) => (
        <option key={zona} value={zona}>
          {zonaHorariaLabel(zona)}
        </option>
      ))}
    </Select>
  );
}

/**
 * Alta de sucursal: solo nombre, dirección y teléfono — la clave se genera
 * sola en el servidor a partir del nombre. El límite del plan se valida en
 * el servidor. La zona horaria hereda la del negocio salvo que se elija
 * otra en "Más opciones".
 */
export function SucursalNuevaForm({
  organizationId,
  zonaHorariaDefault,
  deshabilitado,
}: {
  organizationId: string;
  /** Zona horaria de la organización; se usa como valor inicial. */
  zonaHorariaDefault?: string;
  deshabilitado?: boolean;
}) {
  const [state, action, pending] = useActionState(crearSucursalAction, initialActionState);

  return (
    <form action={action} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <div className="grid grid-cols-1 gap-4">
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input name="nombre" placeholder="Salón Roma Norte" required />
        </Field>
        <Field>
          <FieldLabel>Dirección</FieldLabel>
          <Input name="direccion" placeholder="Calle, número, colonia, ciudad" />
        </Field>
        <Field>
          <FieldLabel>Teléfono</FieldLabel>
          <Input name="telefono" placeholder="55 1234 5678" />
        </Field>
        <details className="rounded-xl border border-border bg-muted/60 px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
            Más opciones
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Correo</FieldLabel>
              <Input name="correo" placeholder="sucursal@negocio.mx" type="email" />
            </Field>
            <Field>
              <FieldLabel>Zona horaria</FieldLabel>
              <ZonaHorariaSelect defaultValue={zonaHorariaDefault} />
              <FieldDescription>Por defecto se usa la de tu negocio.</FieldDescription>
            </Field>
          </div>
        </details>
      </div>
      <ActionFeedback state={state} />
      <Button className="rounded-xl" data-action-clave="1" size="lg" data-action-id="sucursales.sucursal.crear" disabled={pending || deshabilitado} type="submit">
        {pending ? "Creando…" : "Crear sucursal"}
      </Button>
    </form>
  );
}

/**
 * Edición: datos esenciales arriba (nombre, dirección, teléfono) y el resto
 * en "Configuración avanzada" — clave técnica, zona horaria, caja y reglas
 * de reservas en línea — para que el cambio común sea de un vistazo.
 */
export function SucursalEditarForm({ organizationId, sucursal }: { organizationId: string; sucursal: SucursalEditable }) {
  const [state, action, pending] = useActionState(actualizarSucursalAction, initialActionState);

  return (
    <form action={action} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursal.id} />
      <div className="grid grid-cols-1 gap-4">
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input defaultValue={sucursal.nombre} name="nombre" required />
        </Field>
        <Field>
          <FieldLabel>Dirección</FieldLabel>
          <Input defaultValue={sucursal.direccion ?? ""} name="direccion" />
        </Field>
        <Field>
          <FieldLabel>Teléfono</FieldLabel>
          <Input defaultValue={sucursal.telefono ?? ""} name="telefono" />
        </Field>
      </div>

      <details className="space-y-4 rounded-xl border border-border px-4 py-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
          Configuración avanzada
        </summary>
        <div className="grid grid-cols-1 gap-4 pt-3 sm:grid-cols-2">
          <Field>
            <FieldLabel>Correo</FieldLabel>
            <Input defaultValue={sucursal.correo ?? ""} name="correo" type="email" />
          </Field>
          <Field>
            <FieldLabel>Clave</FieldLabel>
            <Input name="clave" placeholder={sucursal.clave} />
            <FieldDescription>Déjala vacía para conservar la clave actual.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Zona horaria</FieldLabel>
            <ZonaHorariaSelect defaultValue={sucursal.zonaHoraria} />
            <FieldDescription>Vacía o distinta a la del negocio solo si la sucursal está en otro estado.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Citas simultáneas sin asignar</FieldLabel>
            <Input defaultValue={sucursal.capacidadSinAsignar} min={1} max={20} name="capacidadSinAsignar" type="number" />
          </Field>
        </div>

        <fieldset className="space-y-2 rounded-xl border border-border p-4">
          <legend className="px-1 text-op-xs font-semibold uppercase tracking-wide text-muted-foreground">Caja y reservas</legend>
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
      </details>

      <ActionFeedback state={state} />
      <Button className="rounded-xl" data-action-id="sucursales.sucursal.editar" disabled={pending} type="submit" variant="outline">
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
