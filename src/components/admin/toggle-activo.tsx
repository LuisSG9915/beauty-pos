"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/toast";

/** Resultado que devuelve la server action de activar/ocultar. */
export type ToggleActivoResult = {
  error?: string;
  success?: boolean;
  /** Aviso a mostrar en la confirmación extra de la baja. */
  warning?: string;
  /** La baja requiere confirmación porque el registro tiene historial. */
  needsConfirm?: boolean;
};

/** Vocabulario de la baja/alta; por defecto el de catálogos ("Ocultar"). */
export type ToggleActivoLabels = {
  /** Botón/acción de baja en infinitivo con mayúscula: "Ocultar", "Desactivar". */
  baja?: string;
  /** Botón/acción de alta: "Activar". */
  alta?: string;
  /** Artículo de la entidad para los mensajes: "el" (default) o "la". */
  articulo?: "el" | "la";
  /** Participio de la alta: "activado" (default) o "activada". */
  participioAlta?: string;
  /** Participio de la baja: "ocultado" (default) o "desactivada". */
  participioBaja?: string;
};

/**
 * Botón "Ocultar"/"Activar" para las listas de catálogos. Al ocultar muestra
 * un toast con "Deshacer" durante 5 s (revertir = reactivar con la misma
 * acción) y, si la acción responde `needsConfirm` (el registro ya tiene
 * historial asociado), pide confirmación antes de aplicar la baja.
 *
 * La server action recibe `organizacionId`, `id`, `activar` ("true"/"false")
 * y `confirmado` ("true" solo tras la confirmación). `labels` adapta el
 * vocabulario a entidades cuya baja no se llama "ocultar" (p. ej. sucursal:
 * "Desactivar", "desactivada", "la").
 */
export function ToggleActivo({
  action,
  activo,
  confirmHint,
  entidad,
  id,
  labels,
  nombre,
  organizationId,
  telemetryBase,
}: {
  action: (formData: FormData) => Promise<ToggleActivoResult>;
  activo: boolean;
  /** Frase extra en la confirmación, p. ej. dónde dejará de aparecer. */
  confirmHint?: string;
  /** Nombre de la entidad en singular para mensajes: "producto", "servicio". */
  entidad: string;
  id: string;
  labels?: ToggleActivoLabels;
  /** Nombre visible del registro (contexto del toast). */
  nombre: string;
  organizationId: string;
  /** Prefijo de telemetría: "catalogo.productos" → `.ocultar` / `.activar`. */
  telemetryBase: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmacion, setConfirmacion] = useState<string | null>(null);
  const label = entidad.charAt(0).toUpperCase() + entidad.slice(1);
  const baja = labels?.baja ?? "Ocultar";
  const alta = labels?.alta ?? "Activar";
  const articulo = labels?.articulo ?? "el";
  const participioAlta = labels?.participioAlta ?? "activado";
  const participioBaja = labels?.participioBaja ?? "ocultado";

  const ejecutar = (activar: boolean, confirmado = false) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("id", id);
    data.set("activar", String(activar));
    if (confirmado) data.set("confirmado", "true");
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result.needsConfirm) {
          setConfirmacion(result.warning ?? `Este ${entidad} tiene registros asociados.`);
          return;
        }
        if (result.error) {
          toast.error(
            `No se pudo ${activar ? alta.toLowerCase() : baja.toLowerCase()} ${articulo} ${entidad}.`,
            result.error,
          );
          return;
        }
        router.refresh();
        if (activar) {
          toast.success(`${label} ${participioAlta}.`, nombre);
          return;
        }
        // Baja con Deshacer: la acción se aplica de inmediato y el toast
        // ofrece revertirla durante 5 s llamando de nuevo con activar=true.
        let toastId = "";
        toastId = toast.show({
          title: `${label} ${participioBaja}.`,
          description: nombre,
          type: "success",
          timeout: 5000,
          actionProps: {
            children: "Deshacer",
            onClick: () => {
              toast.close(toastId);
              ejecutar(true);
            },
          },
        });
      } catch (error) {
        console.error(error);
        toast.error(`No se pudo ${activar ? alta.toLowerCase() : baja.toLowerCase()} ${articulo} ${entidad}.`);
      }
    });
  };

  return (
    <>
      <button
        className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
        data-action-id={`${telemetryBase}.${activo ? "ocultar" : "activar"}`}
        disabled={pending}
        onClick={() => ejecutar(!activo)}
        type="button"
      >
        {activo ? baja : alta}
      </button>
      <ConfirmDialog
        cancelLabel="Cancelar"
        confirmLabel={`${baja} de todas formas`}
        description={
          confirmacion
            ? `${confirmacion}${confirmHint ? ` ${confirmHint}` : ""}`
            : undefined
        }
        destructive={false}
        onConfirm={() => ejecutar(false, true)}
        onOpenChange={(open) => {
          if (!open) setConfirmacion(null);
        }}
        open={confirmacion !== null}
        title={`${baja} ${entidad}`}
      />
    </>
  );
}
