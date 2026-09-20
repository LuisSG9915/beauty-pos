"use client";

import { useActionState } from "react";

import { saveConfigFiscal } from "@/app/admin/facturacion/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import type { ActionState } from "@/lib/action-state";
import { REGIMENES_FISCALES } from "@/modules/facturacion/sat";

export type ConfigFiscalData = {
  rfc: string | null;
  razonSocial: string | null;
  regimenFiscal: string;
  codigoPostal: string;
  serie: string | null;
  preciosIncluyenIva: boolean;
  tasaIva: string;
};

export function ConfigFiscalForm({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial?: ConfigFiscalData;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveConfigFiscal, {});

  return (
    <form action={formAction} className="rounded-2xl border border-[#eadfd8] bg-white p-6 shadow-sm">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">Datos del emisor</h2>
      <p className="mt-1 text-sm text-[#625b55]">
        Identidad fiscal con la que se emiten los CFDI de esta organización. Es requisito para facturar.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>RFC</FieldLabel>
          <Input defaultValue={initial?.rfc ?? ""} maxLength={13} name="rfc" placeholder="AAA010101AAA" required />
        </Field>
        <Field>
          <FieldLabel required>Razón social</FieldLabel>
          <Input defaultValue={initial?.razonSocial ?? ""} name="razonSocial" placeholder="Salón Bella SA de CV" required />
        </Field>
        <Field>
          <FieldLabel required>Régimen fiscal</FieldLabel>
          <Select defaultValue={initial?.regimenFiscal || "626"} name="regimenFiscal">
            {REGIMENES_FISCALES.map((r) => (
              <option key={r.clave} value={r.clave}>
                {r.clave} · {r.nombre}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <FieldLabel required>Código postal fiscal</FieldLabel>
          <Input defaultValue={initial?.codigoPostal ?? ""} inputMode="numeric" maxLength={5} name="codigoPostal" placeholder="06000" required />
        </Field>
        <Field>
          <FieldLabel>Serie</FieldLabel>
          <Input defaultValue={initial?.serie ?? "A"} maxLength={10} name="serie" />
        </Field>
        <Field>
          <FieldLabel required>Tasa de IVA</FieldLabel>
          <Select defaultValue={String(Number(initial?.tasaIva ?? "0.16"))} name="tasaIva">
            <option value="0.16">16%</option>
            <option value="0.08">8% (frontera)</option>
            <option value="0">0%</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-[#2d2926] sm:col-span-2">
          <input className="h-4 w-4 accent-[#8a5140]" defaultChecked={initial?.preciosIncluyenIva ?? true} name="preciosIncluyenIva" type="checkbox" value="true" />
          Los precios del catálogo ya incluyen IVA
        </label>
      </div>
      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Datos del emisor guardados." />
      </div>
      <Button className="mt-6 rounded-xl" disabled={pending} type="submit">
        {pending ? "Guardando…" : "Guardar emisor"}
      </Button>
    </form>
  );
}
