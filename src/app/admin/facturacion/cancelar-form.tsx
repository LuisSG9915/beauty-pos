"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { cancelarFactura } from "@/app/admin/facturacion/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import type { ActionState } from "@/lib/action-state";
import { MOTIVOS_CANCELACION } from "@/modules/facturacion/sat";

/** Solicita la cancelación de un comprobante emitido (motivo SAT + UUID sustituto si es 01). */
export function CancelarFacturaForm({
  organizationId,
  comprobanteId,
  folioLabel,
}: {
  organizationId: string;
  comprobanteId: string;
  compact?: boolean;
  folioLabel?: string;
}) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(cancelarFactura, {});
  const [motivo, setMotivo] = useState("02");

  const handled = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!state.success || handled.current === state) return;
    handled.current = state;
    toast.success(state.message ?? "Comprobante cancelado.");
    setAbierto(false);
  }, [state, toast]);

  return (
    <AlertDialog onOpenChange={setAbierto} open={abierto}>
      <AlertDialogTrigger className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
        Cancelar comprobante…
      </AlertDialogTrigger>
      <AlertDialogContent destructive>
        <form action={formAction} className="space-y-4">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="comprobanteId" type="hidden" value={comprobanteId} />
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              {`¿Cancelar comprobante${folioLabel ? ` ${folioLabel}` : ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              El comprobante quedará cancelado y sin validez. El cobro de la
              venta en caja no se cancela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel>Motivo SAT</FieldLabel>
            <Select name="motivo" onChange={(e) => setMotivo(e.target.value)} value={motivo}>
              {MOTIVOS_CANCELACION.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {m.clave} · {m.nombre}
                </option>
              ))}
            </Select>
          </Field>
          {motivo === "01" ? (
            <Field>
              <FieldLabel required>UUID que lo sustituye</FieldLabel>
              <Input name="uuidSustitucion" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" required />
            </Field>
          ) : (
            <input name="uuidSustitucion" type="hidden" value="" />
          )}
          <ActionFeedback state={state} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending} type="button">
              No, volver
            </AlertDialogCancel>
            <Button className="min-h-11" disabled={pending} type="submit" variant="destructive">
              {pending ? "Cancelando…" : "Sí, cancelar comprobante"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
