"use client";

import { Loader2, ReceiptText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { cargarTicket } from "@/app/admin/pos/actions";
import { VentaTicket } from "@/app/admin/pos/venta-ticket";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { TicketData } from "@/modules/pos/ticket";

function CheckoutContent({
  organizationId,
  ventaId,
  currency,
  returnTo,
  onCobrada,
}: {
  organizationId: string;
  ventaId: string;
  currency: string;
  returnTo: string;
  onCobrada: () => void;
}) {
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  // Reintentar/onChanged: subir la llave re-ejecuta la carga.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    cargarTicket(organizationId, ventaId)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setTicket(data);
          setStatus("ready");
        } else {
          setError("No se encontró la venta o ya no está activa.");
          setStatus("error");
        }
      })
      .catch((fetchError) => {
        if (cancelled) return;
        console.error(fetchError);
        setError("No se pudo cargar el ticket. Intenta de nuevo.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, ventaId, reloadKey]);

  const refetch = useCallback(() => {
    setStatus("loading");
    setError(null);
    setReloadKey((key) => key + 1);
  }, []);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-16" role="status">
        <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary" />
        <span className="sr-only">Cargando ticket…</span>
      </div>
    );
  }
  if (status === "error" || !ticket) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center">
        <p className="text-sm text-destructive">{error ?? "No se pudo cargar el ticket."}</p>
        <Button className="mt-3 rounded-xl" onClick={refetch} type="button" variant="outline">
          Reintentar
        </Button>
      </div>
    );
  }
  return (
    <VentaTicket
      {...ticket}
      currency={currency}
      modo="inline"
      onChanged={refetch}
      onCobrada={onCobrada}
      organizationId={organizationId}
      returnTo={returnTo}
    />
  );
}

/**
 * Sheet de cobro inline: carga el ticket de la venta con `cargarTicket` y
 * renderiza `VentaTicket` en modo inline. `onChanged` re-carga el ticket tras
 * cada mutación de líneas/descuento; `onCobrada` lo delega al padre.
 */
export function CheckoutSheet({
  organizationId,
  ventaId,
  currency,
  returnTo,
  onClose,
  onCobrada,
}: {
  organizationId: string;
  ventaId: string | null;
  currency: string;
  returnTo: string;
  onClose: () => void;
  onCobrada: () => void;
}) {
  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={Boolean(ventaId)}>
      <SheetContent className="w-[min(100vw,54rem)]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ReceiptText aria-hidden="true" className="size-5 text-primary" />
            Cobro de la cita
          </SheetTitle>
          <SheetDescription>
            Ajusta servicios, productos y descuento, y registra el pago sin salir de la agenda.
          </SheetDescription>
        </SheetHeader>
        {/* key remonta el contenido al cambiar de venta (estado fresco). */}
        {ventaId ? (
          <CheckoutContent
            currency={currency}
            key={ventaId}
            onCobrada={onCobrada}
            organizationId={organizationId}
            returnTo={returnTo}
            ventaId={ventaId}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
