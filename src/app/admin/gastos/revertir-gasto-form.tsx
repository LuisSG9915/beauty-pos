"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { revertirGastoAction } from "@/app/admin/gastos/actions";
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
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";

/**
 * Reversión con motivo obligatorio dentro del diálogo destructivo estándar:
 * el título lleva el importe y la descripción explica la consecuencia en caja.
 */
export function RevertirGastoForm({
  organizationId,
  gastoId,
  concepto,
  importeFormateado,
  cajaVinculada = false,
}: {
  organizationId: string;
  gastoId: string;
  concepto: string;
  importeFormateado?: string;
  cajaVinculada?: boolean;
}) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [state, action, pending] = useActionState(revertirGastoAction, initialActionState);

  const handled = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!state.success || handled.current === state) return;
    handled.current = state;
    toast.success(state.message ?? "Gasto revertido.");
    setAbierto(false);
  }, [state, toast]);

  return (
    <AlertDialog onOpenChange={setAbierto} open={abierto}>
      <AlertDialogTrigger className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
        Revertir gasto…
      </AlertDialogTrigger>
      <AlertDialogContent destructive>
        <form action={action} className="space-y-4">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="gastoId" type="hidden" value={gastoId} />
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              {`¿Revertir gasto ${importeFormateado ? `de ${importeFormateado}` : `«${concepto}»`}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {cajaVinculada
                ? `El gasto «${concepto}» quedará marcado como revertido y el dinero regresará al efectivo esperado de la caja abierta. Esta acción no se puede deshacer.`
                : `El gasto «${concepto}» quedará marcado como revertido en los reportes. Esta acción no se puede deshacer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel required>Motivo</FieldLabel>
            <Input name="motivo" placeholder={`Por qué se revierte «${concepto}»`} required />
          </Field>
          <ActionFeedback state={state} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending} type="button">
              No, volver
            </AlertDialogCancel>
            <Button className="min-h-11" disabled={pending} type="submit" variant="destructive">
              {pending ? "Revirtiendo…" : "Sí, revertir gasto"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
