"use client";

import { useActionState } from "react";

import { saveClient } from "@/app/admin/client-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

type ClientData = {
  id?: string;
  organizacionId: string;
  nombre: string;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  telefono?: string | null;
  correo?: string | null;
  fechaNacimiento?: string | null;
  notasOperativas?: string | null;
  rfc?: string | null;
  razonSocial?: string | null;
  codigoPostalFiscal?: string | null;
  regimenFiscal?: string | null;
  usoCfdi?: string | null;
};

const PERSONAL_FIELDS: Array<{ name: keyof ClientData; label: string; placeholder: string; required?: boolean; type?: string }> = [
  { name: "nombre", label: "Nombre", placeholder: "Mariana", required: true },
  { name: "apellidoPaterno", label: "Apellido paterno", placeholder: "López" },
  { name: "apellidoMaterno", label: "Apellido materno", placeholder: "García" },
  { name: "telefono", label: "Teléfono", placeholder: "5512345678" },
  { name: "correo", label: "Correo", placeholder: "cliente@correo.com", type: "email" },
  { name: "fechaNacimiento", label: "Fecha de nacimiento", placeholder: "", type: "date" },
];

const FISCAL_FIELDS: Array<{ name: keyof ClientData; label: string; placeholder: string }> = [
  { name: "rfc", label: "RFC", placeholder: "XAXX010101000" },
  { name: "razonSocial", label: "Razón social", placeholder: "" },
  { name: "codigoPostalFiscal", label: "Código postal fiscal", placeholder: "" },
  { name: "regimenFiscal", label: "Régimen fiscal", placeholder: "" },
  { name: "usoCfdi", label: "Uso CFDI", placeholder: "" },
];

export function ClientForm({ organizationId, initial }: { organizationId: string; initial?: ClientData }) {
  const [state, formAction, isPending] = useActionState(saveClient, {});
  const value = (key: keyof ClientData) => initial?.[key] ?? "";
  const tieneFiscales = FISCAL_FIELDS.some((field) => Boolean(initial?.[field.name]));

  return (
    <form action={formAction} className="rounded-2xl border border-[#eadfd8] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar cliente" : "Nuevo cliente"}</h2>
      <p className="mt-1 text-sm text-[#81746c]">Solo el nombre es obligatorio; el teléfono ayuda a confirmar citas.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {PERSONAL_FIELDS.map((field) => (
          <Field key={field.name}>
            <FieldLabel required={field.required}>{field.label}</FieldLabel>
            <Input defaultValue={String(value(field.name))} name={field.name} placeholder={field.placeholder} required={field.required} type={field.type ?? "text"} />
          </Field>
        ))}
        <Field className="sm:col-span-2">
          <FieldLabel>Notas operativas</FieldLabel>
          <Textarea defaultValue={String(value("notasOperativas"))} name="notasOperativas" />
        </Field>
      </div>

      {/* Datos fiscales plegados: solo se piden cuando el cliente requiere
          factura; abierto al editar un cliente que ya los tiene. */}
      <details className="mt-5 rounded-xl border border-[#eee8e3] bg-[#faf9f7] px-4 py-3" open={tieneFiscales}>
        <summary className="cursor-pointer list-none text-sm font-medium text-[#625b55] hover:text-[#8a5140]">
          Datos de facturación (solo si el cliente pide factura)
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {FISCAL_FIELDS.map((field) => (
            <Field key={field.name}>
              <FieldLabel>{field.label}</FieldLabel>
              <Input defaultValue={String(value(field.name))} name={field.name} placeholder={field.placeholder} />
            </Field>
          ))}
        </div>
      </details>

      {state.warning ? (
        <label className="mt-5 flex items-start gap-3 rounded-xl border border-[#ecd9a9] bg-[#fff9e9] p-4 text-sm text-[#80621d]">
          <input className="mt-1" name="confirmarDuplicado" type="checkbox" value="true" />
          <span>{state.warning} Deseo guardar el cliente de todas formas.</span>
        </label>
      ) : null}
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Cliente guardado correctamente." />
      </div>
      <Button className="mt-6 rounded-xl" data-action-clave="1" data-action-id="clientes.cliente.guardar" disabled={isPending} type="submit">
        {isPending ? "Guardando…" : "Guardar cliente"}
      </Button>
    </form>
  );
}
