"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CheckCircle,
  Copy,
  Link,
  Printer,
  Send,
  Ticket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/components/ui/toast";

/**
 * Modal de confirmación post-cobro (tipo Northud).
 * Se muestra tras cobrar una venta y ofrece:
 * - Enviar ticket por WhatsApp (país + teléfono + Enviar).
 * - Cuatro acciones rápidas: Imprimir, Copiar, Enlace, Ver venta.
 * - Botón primario "Nueva venta" para empezar otra venta sin fricción.
 */
type ModalConfirmacionCobroProps = {
  abierto: boolean;
  onCerrar: () => void;
  /** ID de la venta cobrada. */
  ventaId: string;
  /** Monto cobrado (número, no string). */
  montoCobrado: number;
  /** Código de moneda (p. ej. "MXN"). */
  moneda: string;
  /** ID de la organización (para construir URLs). */
  organizacionId: string;
  /** ID de la sucursal (para construir URLs). */
  sucursalId: string;
  /** Callback opcional al pulsar "Nueva venta". */
  onNuevaVenta?: () => void;
};

/** Países disponibles para el selector de WhatsApp. */
const PAISES_WHATSAPP: Array<{ etiqueta: string; codigo: string }> = [
  { etiqueta: "México", codigo: "52" },
  { etiqueta: "Estados Unidos", codigo: "1" },
  { etiqueta: "España", codigo: "34" },
  { etiqueta: "Colombia", codigo: "57" },
  { etiqueta: "Argentina", codigo: "54" },
  { etiqueta: "Chile", codigo: "56" },
  { etiqueta: "Perú", codigo: "51" },
];

export function ModalConfirmacionCobro({
  abierto,
  onCerrar,
  ventaId,
  montoCobrado,
  moneda,
  organizacionId,
  sucursalId,
  onNuevaVenta,
}: ModalConfirmacionCobroProps) {
  const router = useRouter();
  const toast = useToast();
  const [paisSeleccionado, setPaisSeleccionado] = useState(PAISES_WHATSAPP[0]);
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);

  const urlVenta = `/admin/pos?organizationId=${organizacionId}&sucursalId=${sucursalId}&ventaId=${ventaId}`;
  const urlNuevaVenta = `/pos?organizationId=${organizacionId}&sucursalId=${sucursalId}&nueva=1`;

  const mensajeWhatsApp = encodeURIComponent(
    `Hola! Aquí tienes tu ticket de compra: ${urlVenta}`,
  );

  const enviarWhatsApp = () => {
    const numero = telefono.replace(/\s/g, "");
    if (!numero) {
      toast.error("Ingresa un número de teléfono.");
      return;
    }
    setEnviando(true);
    const url = `https://wa.me/${paisSeleccionado.codigo}${numero}?text=${mensajeWhatsApp}`;
    // Abrir WhatsApp en una pestaña nueva para no salir del flujo de cobro.
    window.open(url, "_blank");
    setEnviando(false);
    toast.success("Ticket listo para enviar por WhatsApp.");
  };

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(urlVenta);
      toast.success("Enlace copiado al portapapeles.");
    } catch {
      toast.error("No se pudo copiar el enlace.");
    }
  };

  const imprimirTicket = () => {
    window.print();
  };

  const verVenta = () => {
    router.push(urlVenta);
    onCerrar();
  };

  const nuevaVenta = () => {
    onCerrar();
    if (onNuevaVenta) {
      onNuevaVenta();
    } else {
      router.push(urlNuevaVenta);
      router.refresh();
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={onCerrar}>
      <DialogContent className="p-0 sm:p-6 max-w-md">
        <DialogHeader>
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center justify-center size-16 rounded-full bg-success/10 text-success-foreground">
              <CheckCircle className="size-8" />
            </div>
            <DialogTitle className="text-op-lg font-semibold text-center">
              Venta #{ventaId.slice(-4)}
            </DialogTitle>
            <DialogDescription className="text-op-sm text-center">
              {formatCurrency(montoCobrado, { currency: moneda })}
            </DialogDescription>
            <p className="text-op-xs text-muted-foreground">
              Cobrado · sin cambio
            </p>
          </div>
        </DialogHeader>

        {/* Enviar ticket por WhatsApp */}
        <div className="mt-6 rounded-xl border border-background bg-card p-4 shadow-sm">
          <p className="text-op-xs font-medium mb-3">
            Enviar ticket por WhatsApp
          </p>
          <div className="flex items-end gap-2">
            <SelectPais
              value={paisSeleccionado}
              onChange={setPaisSeleccionado}
            />
            <Input
              placeholder="Teléfono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              inputMode="tel"
              maxLength={15}
              className="flex-1 min-w-0"
            />
            <Button
              onClick={enviarWhatsApp}
              disabled={enviando || !telefono}
              variant="outline"
              size="sm"
              data-action-id="pos.cobro.whatsapp"
            >
              {enviando ? "Enviando…" : (
                <>
                  <Send className="size-3.5 mr-1.5" />
                  Enviar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Acciones rápidas */}
        <div className="mt-6 grid grid-cols-4 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={imprimirTicket}
            data-action-id="pos.cobro.imprimir"
          >
            <Printer className="size-4" />
            <span className="sr-only">Imprimir</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copiarEnlace}
            data-action-id="pos.cobro.copiar"
          >
            <Copy className="size-4" />
            <span className="sr-only">Copiar</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copiarEnlace}
            data-action-id="pos.cobro.enlace"
          >
            <Link className="size-4" />
            <span className="sr-only">Enlace</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={verVenta}
            data-action-id="pos.cobro.ver"
          >
            <Ticket className="size-4" />
            <span className="sr-only">Ver venta</span>
          </Button>
        </div>

        <DialogFooter>
          <Button
            onClick={nuevaVenta}
            className="w-full rounded-xl font-bold bg-primary text-primary-foreground shadow-sm hover:brightness-105"
            data-action-clave="1"
            data-action-id="pos.cobro.nueva_venta"
            size="touch"
          >
            Nueva venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectPais({
  value,
  onChange,
}: {
  value: (typeof PAISES_WHATSAPP)[number];
  onChange: (pais: (typeof PAISES_WHATSAPP)[number]) => void;
}) {
  return (
    <select
      value={value.codigo}
      onChange={(e) => {
        const pais = PAISES_WHATSAPP.find((p) => p.codigo === e.target.value);
        if (pais) onChange(pais);
      }}
      className="h-10 rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {PAISES_WHATSAPP.map((pais) => (
        <option key={pais.codigo} value={pais.codigo}>
          +{pais.codigo} {pais.etiqueta}
        </option>
      ))}
    </select>
  );
}
