"use client";

import { useActionState } from "react";

import { saveClient } from "@/app/admin/client-actions";
import { Button } from "@/components/ui/button";

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

export function ClientForm({ organizationId, initial }: { organizationId: string; initial?: ClientData }) {
  const [state, formAction, isPending] = useActionState(saveClient, {});
  const value = (key: keyof ClientData) => initial?.[key] ?? "";

  return (
    <form action={formAction} className="rounded-2xl border border-[#eadfd8] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar cliente" : "Nuevo cliente"}</h2>
      <p className="mt-1 text-sm text-[#81746c]">Los campos fiscales son opcionales mientras CFDI esté pendiente.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          ["nombre", "Nombre", "Mariana"],
          ["apellidoPaterno", "Apellido paterno", "López"],
          ["apellidoMaterno", "Apellido materno", "García"],
          ["telefono", "Teléfono", "5512345678"],
          ["correo", "Correo", "cliente@correo.com"],
          ["fechaNacimiento", "Fecha de nacimiento", ""],
        ].map(([name, label, placeholder]) => (
          <label className="space-y-2" key={name}>
            <span className="text-sm font-medium">{label}{name === "nombre" ? " *" : ""}</span>
            <input className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" defaultValue={String(value(name as keyof ClientData))} name={name} placeholder={placeholder} required={name === "nombre"} type={name === "correo" ? "email" : name === "fechaNacimiento" ? "date" : "text"} />
          </label>
        ))}
        <label className="space-y-2 sm:col-span-2"><span className="text-sm font-medium">Notas operativas</span><textarea className="min-h-24 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 py-2 text-sm outline-none focus:border-[#b8795d]" defaultValue={String(value("notasOperativas"))} name="notasOperativas" /></label>
        <p className="text-sm font-semibold text-[#a76348] sm:col-span-2">Datos fiscales opcionales</p>
        {[
          ["rfc", "RFC", "XAXX010101000"],
          ["razonSocial", "Razón social", ""],
          ["codigoPostalFiscal", "Código postal fiscal", ""],
          ["regimenFiscal", "Régimen fiscal", ""],
          ["usoCfdi", "Uso CFDI", ""],
        ].map(([name, label, placeholder]) => <label className="space-y-2" key={name}><span className="text-sm font-medium">{label}</span><input className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" defaultValue={String(value(name as keyof ClientData))} name={name} placeholder={placeholder} /></label>)}
      </div>

      {state.warning ? <label className="mt-5 flex items-start gap-3 rounded-xl border border-[#ecd9a9] bg-[#fff9e9] p-4 text-sm text-[#80621d]"><input className="mt-1" name="confirmarDuplicado" type="checkbox" value="true" /> <span>{state.warning} Deseo guardar el cliente de todas formas.</span></label> : null}
      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a34e3b]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#3d7b50]" role="status">Cliente guardado correctamente.</p> : null}
      <Button className="mt-6 rounded-xl bg-[#2c2522] text-[#fffaf5] hover:bg-[#463a34]" disabled={isPending} type="submit">{isPending ? "Guardando..." : "Guardar cliente"}</Button>
    </form>
  );
}
