"use client";

import { useFormStatus } from "react-dom";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { formatCurrency, formatFolioVenta } from "@/lib/format";
import { cobrarVentaSencilla } from "./actions";
import { CatalogoSelector } from "@/app/admin/pos/catalogo-selector";
import type { TicketData } from "@/modules/pos/ticket";

type CobroSencilloProps = {
  organizationId: string;
  sucursalId: string;
  venta: TicketData["venta"];
  lineasServicios: TicketData["lineasServicios"];
  lineasProductos: TicketData["lineasProductos"];
  catalogoServicios: TicketData["catalogoServicios"];
  catalogoProductos: TicketData["catalogoProductos"];
  mediosPago: TicketData["mediosPago"];
  configuracion: Record<string, boolean>;
  currency: string;
};

/**
 * Cobro sencillo: buscar/escanear, agregar líneas al ticket, ver el total y
 * un solo botón "Cobrar". Si `cobro-caja` no está activa, el cobro es directo
 * con efectivo; si está activa, se redirige al cobro completo.
 */
export function CobroSencillo({
  organizationId,
  sucursalId,
  venta,
  lineasServicios,
  lineasProductos,
  catalogoServicios,
  catalogoProductos,
  mediosPago,
  configuracion,
  currency,
}: CobroSencilloProps) {
  const router = useRouter();
  const [idempotencia] = useState(() => crypto.randomUUID());

  const cobroCajaActivo = configuracion["cobro-caja"] ?? true;
  const ventasTiendaActivas = configuracion["ventas-tienda"] ?? true;

  const medioEfectivo = mediosPago.find((m) => m.categoria === "efectivo");

  // Estado visible sin jerga interna (nunca el valor crudo de la BD).
  const estadoLabel =
    venta.estado === "completada"
      ? "Cobrada"
      : venta.estado === "cancelada"
        ? "Cancelada"
        : "En proceso";

  const subtotalServicios = lineasServicios.reduce(
    (s, l) => s + Number(l.precio) * l.cantidad,
    0,
  );
  const subtotalProductos = lineasProductos.reduce(
    (s, l) => s + Number(l.precio) * l.cantidad,
    0,
  );
  const total = subtotalServicios + subtotalProductos;
  const tieneLineas = lineasServicios.length > 0 || lineasProductos.length > 0;

  const pagosEfectivo =
    medioEfectivo && total > 0
      ? JSON.stringify([
          {
            medioPagoId: medioEfectivo.id,
            monto: total,
            referencia: "",
          },
        ])
      : "[]";

  const irACobroCompleto = () => {
    router.push(
      `/admin/pos?organizationId=${organizationId}&sucursalId=${sucursalId}&ventaId=${venta.id}`,
    );
    router.refresh();
  };

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Encabezado: venta y total */}
      <div className="rounded-2xl border border-background bg-card p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <div>
            <h2 className="font-semibold">
              {venta.folio != null ? `Folio ${formatFolioVenta(venta.folio)}` : "Venta en proceso"}
            </h2>
            <p className="text-op-xs text-muted-foreground">
              Punto de venta sencillo · {estadoLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-op-xs font-medium text-muted-foreground">
              Total a cobrar
            </p>
            <p className="text-3xl font-bold tabular-nums text-primary">
              {formatCurrency(total, { currency })}
            </p>
          </div>
        </div>

        {/* Barra de búsqueda y catálogo */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CatalogoSelector
              servicios={catalogoServicios}
              productos={ventasTiendaActivas ? catalogoProductos : []}
              currency={currency}
              organizationId={organizationId}
              ventaId={venta.id}
              onAdded={() => router.refresh()}
            />
          </div>
          <div>
            <div className="rounded-xl border border-background bg-card p-4 shadow-sm h-fit">
              <h3 className="font-semibold mb-3">Ticket</h3>
              {lineasServicios.length === 0 && lineasProductos.length === 0 ? (
                <p className="text-op-xs text-muted-foreground">
                  Agrega servicios o productos para empezar.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {lineasServicios.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-2 text-op-xs"
                    >
                      <span className="line-clamp-1">{l.nombre}</span>
                      <span className="tabular-nums">
                        {formatCurrency(
                          Number(l.precio) * l.cantidad,
                          { currency },
                        )}
                      </span>
                    </div>
                  ))}
                  {lineasProductos.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-2 text-op-xs"
                    >
                      <span className="line-clamp-1">{l.nombre}</span>
                      <span className="tabular-nums">
                        {formatCurrency(
                          Number(l.precio) * l.cantidad,
                          { currency },
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border flex items-baseline justify-between gap-2">
                <span className="font-semibold">Total</span>
                <span className="font-bold tabular-nums">
                  {formatCurrency(total, { currency })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CTA: Cobrar */}
        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          {cobroCajaActivo ? (
            <Button
              className="w-full sm:w-auto rounded-xl font-bold shadow-sm"
              data-action-clave="1"
              data-action-id="pos.cobro.cobrar"
              disabled={!tieneLineas}
              onClick={irACobroCompleto}
              size="lg"
              type="button"
            >
              <Wallet className="size-4 mr-2" />
              {tieneLineas ? "Cobrar venta" : "Agrega líneas primero"}
            </Button>
          ) : (
            <CobroDirectoForm
              organizationId={organizationId}
              ventaId={venta.id}
              pagos={pagosEfectivo}
              idempotencia={idempotencia}
              total={total}
              tieneLineas={tieneLineas}
              medioEfectivo={medioEfectivo}
              currency={currency}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Form oculto que llama a `cobrarVenta` con un pago de efectivo por el total.
 * Se usa cuando `cobro-caja` no está activa (cobro directo, sin medios
 * complejos ni propina).
 */
function CobroDirectoForm({
  organizationId,
  ventaId,
  pagos,
  idempotencia,
  total,
  tieneLineas,
  medioEfectivo,
  currency,
}: {
  organizationId: string;
  ventaId: string;
  pagos: string;
  idempotencia: string;
  total: number;
  tieneLineas: boolean;
  medioEfectivo: { id: string; nombre: string } | undefined;
  currency: string;
}) {
  const { pending } = useFormStatus();
  const puedeCobrar =
    !pending && tieneLineas && Boolean(medioEfectivo) && total > 0;

  return (
    <form action={cobrarVentaSencilla}>
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="ventaId" type="hidden" value={ventaId} />
      <input name="pagos" type="hidden" value={pagos} />
      <input name="propina" type="hidden" value="0" />
      <input name="idempotencia" type="hidden" value={idempotencia} />
      <input name="idempotencyKey" type="hidden" value={idempotencia} />
      <Button
        aria-busy={pending}
        className="w-full min-h-11 rounded-xl font-bold shadow-sm"
        data-action-clave="1"
        data-action-id="pos.cobro.cobrar"
        disabled={!puedeCobrar}
        size="lg"
        type="submit"
      >
        {pending ? "Procesando cobro…" : `Cobrar ${formatCurrency(total, { currency })}`}
      </Button>
    </form>
  );
}
