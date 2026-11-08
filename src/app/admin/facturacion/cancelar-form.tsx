"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { cancelarFactura, reemitirComprobante } from "@/app/admin/facturacion/actions";
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
import { Field, FieldError, FieldLabel, Input, Select } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { fieldError, initialActionState, type ActionState } from "@/lib/action-state";
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
  const fe = (name: string) => fieldError(state, name);
  const [motivo, setMotivo] = useState("02");
  const [, startTransition] = useTransition();

  const handled = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!state.success || handled.current === state) return;
    handled.current = state;
    setAbierto(false);
    let toastId = "";
    toastId = toast.show({
      title: state.message ?? "Comprobante cancelado.",
      description: "Puedes deshacer en los próximos segundos.",
      type: "success",
      timeout: 5000,
      actionProps: {
        children: "Deshacer",
        onClick: () => {
          toast.close(toastId);
          const data = new FormData();
          data.set("organizacionId", organizationId);
          data.set("comprobanteId", comprobanteId);
          startTransition(async () => {
            const result = await reemitirComprobante(initialActionState, data);
            if (result.success) {
              toast.success(result.message ?? "Comprobante reemitido.");
            } else {
              toast.error(result.error ?? "No se pudo deshacer la cancelación.");
            }
          });
        },
      },
    });
  }, [state, toast, organizationId, comprobanteId]);

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
              <FieldLabel required>Folio fiscal que lo sustituye</FieldLabel>
              <Input invalid={Boolean(fe("uuidSustitucion"))} name="uuidSustitucion" placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX" required />
              <FieldError error={fe("uuidSustitucion")} />
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
