"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { updatePoliticaCaja } from "@/app/admin/caja/actions";
import { useToast } from "@/components/ui/toast";

/**
 * Interruptor de la política "exigir corte abierto para cobrar" de la sucursal.
 * Solo se renderiza cuando el usuario tiene `caja.configurar` (la página ya lo
 * resolvió); el servidor vuelve a validar el permiso y la sucursal.
 */
export function PoliticaCajaToggle({
  exigir,
  organizationId,
  sucursalId,
}: {
  exigir: boolean;
  organizationId: string;
  sucursalId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const cambiar = (nuevo: boolean) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("sucursalId", sucursalId);
    data.set("exigirCorteParaCobrar", String(nuevo));
    startTransition(async () => {
      try {
        const result = await updatePoliticaCaja(data);
        if (result.success) {
          toast.success(result.message ?? "Política actualizada.");
          router.refresh();
        } else {
          toast.error(result.error ?? "No se pudo actualizar la política.");
        }
      } catch (error) {
        console.error(error);
        toast.error("No se pudo actualizar la política.");
      }
    });
  };

  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-4 py-2.5 text-sm transition-colors hover:border-accent-foreground/30">
      <input
        checked={exigir}
        className="size-4 accent-primary"
        disabled={pending}
        onChange={(event) => cambiar(event.target.checked)}
        type="checkbox"
      />
      <span className="min-w-0 flex-1">
        <span className="font-medium text-foreground">Exigir corte abierto para cobrar</span>
        <span className="block text-op-xs text-muted-foreground">
          {exigir
            ? "El cobro se rechaza mientras no haya corte abierto."
            : "Se puede cobrar sin corte; la venta se asocia al corte si existe."}
        </span>
      </span>
    </label>
  );
}
