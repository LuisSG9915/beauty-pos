"use client";

import { Minus, Plus, ReceiptText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  aplicarDescuento,
  asignarEstilistaLinea,
  cambiarCantidadLinea,
  cancelarVentaCobrada,
  quitarProductoVenta,
  quitarServicioVenta,
} from "@/app/admin/pos/actions";
import { CatalogoSelector } from "@/app/admin/pos/catalogo-selector";
import { CobroForm } from "@/app/admin/pos/cobro-form";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { formatCurrency } from "@/lib/format";
import type { TicketData } from "@/modules/pos/ticket";

type LineaServicio = {
  id: string;
  nombre: string;
  precio: string;
  cantidad: number;
  usuarioId: string | null;
};
type LineaProducto = { id: string; nombre: string; precio: string; cantidad: number };

type VentaTicketProps = {
  organizationId: string;
  venta: {
    id: string;
    estado: string;
    citaId: string | null;
    clienteNombre: string | null;
    subtotal: string;
    descuento: string;
    total: string;
    propina: string;
  };
  lineasServicios: LineaServicio[];
  lineasProductos: LineaProducto[];
  catalogoServicios: TicketData["catalogoServicios"];
  catalogoProductos: TicketData["catalogoProductos"];
  mediosPago: Array<{ id: string; nombre: string; categoria: string }>;
  pagos: Array<{ nombre: string; monto: string; recibido: string; cambio: string }>;
  staff: Array<{ id: string; nombre: string }>;
  propinas: Array<{ usuarioNombre: string; monto: string }>;
  comisiones: Array<{ usuarioNombre: string; monto: string }>;
  currency: string;
  returnTo: string;
  /** Permiso ventas.cancelar (lo resuelve la página/llamante). */
  puedeCancelar?: boolean;
  /** "inline" = dentro del sheet de agenda (sin redirect al cobrar). */
  modo?: "page" | "inline";
  /** modo inline: cerrar el sheet al cobrar. */
  onCobrada?: () => void;
  /** modo inline: refetch del ticket tras cada mutación. */
  onChanged?: () => void;
};

type LineAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

function lineFormData(
  organizationId: string,
  ventaId: string,
  detalleId: string,
  extra: Record<string, string>,
) {
  const data = new FormData();
  data.set("organizacionId", organizationId);
  data.set("ventaId", ventaId);
  data.set("detalleId", detalleId);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

/** Fila del ticket: nombre, precio × cantidad, importe y controles de edición. */
function TicketLine({
  currency,
  editable,
  line,
  onChanged,
  organizationId,
  removeAction,
  staff,
  tipo,
  usuarioId,
  ventaId,
}: {
  currency: string;
  editable: boolean;
  line: LineaProducto;
  onChanged?: () => void;
  organizationId: string;
  removeAction: LineAction;
  staff: Array<{ id: string; nombre: string }>;
  tipo: "servicio" | "producto";
  /** Solo líneas de servicio. */
  usuarioId?: string | null;
  ventaId: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const esServicio = tipo === "servicio";
  const profesionalNombre =
    esServicio && usuarioId ? staff.find((p) => p.id === usuarioId)?.nombre : undefined;
  const importe = Number(line.precio) * line.cantidad;

  const run = (action: LineAction, extra: Record<string, string>, onError?: () => void) => {
    const data = lineFormData(organizationId, ventaId, line.id, extra);
    startTransition(async () => {
      const result = await action(initialActionState, data);
      if (result.success) {
        toast.success(result.message ?? "Ticket actualizado.");
        onChanged?.();
      } else {
        toast.error(result.error ?? "No se pudo actualizar la línea.");
        onError?.();
      }
    });
  };

  return (
    <div className="rounded-xl border border-[#eee8e3] px-3 py-2.5 text-sm sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-44">
          <p className="truncate font-medium">{line.nombre}</p>
          <p className="mt-0.5 text-xs tabular-nums text-[#81746c]">
            {formatCurrency(line.precio, { currency })} c/u
            {!editable && profesionalNombre ? ` · ${profesionalNombre}` : ""}
          </p>
        </div>
        {editable ? (
          <>
            <div
              aria-label={`Cantidad de ${line.nombre}`}
              className="flex items-center overflow-hidden rounded-lg border border-[#ded8d2]"
              role="group"
            >
              <button
                aria-label="Reducir cantidad"
                className="flex size-9 items-center justify-center text-[#625b55] transition-colors hover:bg-[#f1eeea] disabled:opacity-40"
                disabled={pending}
                onClick={() => run(cambiarCantidadLinea, { tipo, delta: "-1" })}
                type="button"
              >
                <Minus aria-hidden="true" className="size-3.5" />
              </button>
              <span
                aria-live="polite"
                className="w-9 text-center text-sm font-semibold tabular-nums"
              >
                {line.cantidad}
              </span>
              <button
                aria-label="Aumentar cantidad"
                className="flex size-9 items-center justify-center text-[#625b55] transition-colors hover:bg-[#f1eeea] disabled:opacity-40"
                disabled={pending}
                onClick={() => run(cambiarCantidadLinea, { tipo, delta: "1" })}
                type="button"
              >
                <Plus aria-hidden="true" className="size-3.5" />
              </button>
            </div>
            <span className="w-24 text-right font-semibold tabular-nums">
              {formatCurrency(importe, { currency })}
            </span>
            <Button
              aria-label={`Quitar ${line.nombre}`}
              disabled={pending}
              onClick={() => run(removeAction, {})}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" className="text-destructive" />
            </Button>
          </>
        ) : (
          <>
            <span className="text-xs tabular-nums text-[#625b55]">
              {line.cantidad} × {formatCurrency(line.precio, { currency })}
            </span>
            <span className="w-24 text-right font-semibold tabular-nums">
              {formatCurrency(importe, { currency })}
            </span>
          </>
        )}
      </div>
      {esServicio && editable ? (
        <div className="mt-1.5 flex items-center gap-2">
          <label
            className="shrink-0 text-xs text-[#81746c]"
            htmlFor={`profesional-${line.id}`}
          >
            Profesional
          </label>
          <select
            aria-label={`Profesional para ${line.nombre}`}
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60 sm:max-w-52"
            defaultValue={usuarioId ?? ""}
            disabled={pending}
            id={`profesional-${line.id}`}
            // Remonta el select cuando el servidor confirma el nuevo valor.
            key={usuarioId ?? "none"}
            onChange={(event) => {
              const select = event.currentTarget;
              const previo = usuarioId ?? "";
              run(asignarEstilistaLinea, { usuarioId: select.value }, () => {
                select.value = previo;
              });
            }}
          >
            <option value="">Sin asignar</option>
            {staff.map((profesional) => (
              <option key={profesional.id} value={profesional.id}>
                {profesional.nombre}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

export function VentaTicket({
  organizationId,
  venta,
  lineasServicios,
  lineasProductos,
  catalogoServicios,
  catalogoProductos,
  mediosPago,
  pagos,
  staff,
  propinas,
  comisiones,
  currency,
  returnTo,
  puedeCancelar = false,
  modo = "page",
  onCobrada,
  onChanged,
}: VentaTicketProps) {
  const editable = venta.estado === "en_proceso";
  const cancelada = venta.estado === "cancelada";
  const [descuentoState, descuentoAction, descuentoPending] = useActionState(
    aplicarDescuento,
    initialActionState,
  );
  const [, startQuickTransition] = useTransition();
  const propinaNum = Number(venta.propina) || 0;

  // En modo inline el descuento también debe provocar el refetch del ticket.
  const handledDescuento = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!descuentoState.success || handledDescuento.current === descuentoState) return;
    handledDescuento.current = descuentoState;
    onChanged?.();
  }, [descuentoState, onChanged]);

  const aplicarPorcentaje = (pct: number) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("ventaId", venta.id);
    data.set("descuento", ((Number(venta.subtotal) * pct) / 100).toFixed(2));
    startQuickTransition(() => {
      descuentoAction(data);
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#2d2926]">
              <ReceiptText aria-hidden="true" className="size-5 text-[#8a5140]" /> Ticket
            </h2>
            <p className="mt-1 text-sm text-[#81746c]">
              Cliente: {venta.clienteNombre ?? "Walk-in"}
              {venta.citaId ? " · desde cita" : ""}
            </p>
          </div>
          <StatusBadge tone={editable ? "warning" : cancelada ? "destructive" : "success"}>
            {editable ? "En proceso" : cancelada ? "Cancelada" : "Completada"}
          </StatusBadge>
        </div>

        {editable ? (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
              Agregar al ticket
            </h3>
            <CatalogoSelector
              className="mt-3"
              currency={currency}
              onAdded={onChanged}
              organizationId={organizationId}
              productos={catalogoProductos}
              servicios={catalogoServicios}
              ventaId={venta.id}
            />
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
              Servicios
            </h3>
            <div className="mt-3 space-y-2">
              {lineasServicios.length === 0 ? (
                <p className="rounded-xl bg-[#f1eeea] px-4 py-3 text-sm text-[#625b55]">
                  Sin servicios en esta venta.
                </p>
              ) : (
                lineasServicios.map((linea) => (
                  <TicketLine
                    currency={currency}
                    editable={editable}
                    key={linea.id}
                    line={linea}
                    onChanged={onChanged}
                    organizationId={organizationId}
                    removeAction={quitarServicioVenta}
                    staff={staff}
                    tipo="servicio"
                    usuarioId={linea.usuarioId}
                    ventaId={venta.id}
                  />
                ))
              )}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
              Productos
            </h3>
            <div className="mt-3 space-y-2">
              {lineasProductos.length === 0 ? (
                <p className="rounded-xl bg-[#f1eeea] px-4 py-3 text-sm text-[#625b55]">
                  Sin productos en esta venta.
                </p>
              ) : (
                lineasProductos.map((linea) => (
                  <TicketLine
                    currency={currency}
                    editable={editable}
                    key={linea.id}
                    line={linea}
                    onChanged={onChanged}
                    organizationId={organizationId}
                    removeAction={quitarProductoVenta}
                    staff={staff}
                    tipo="producto"
                    ventaId={venta.id}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-[#2d2926]">Totales</h2>
          <div className="mt-3 space-y-2 rounded-xl bg-[#f2e3dc] p-4">
            <div className="flex justify-between text-sm text-[#625b55]">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {formatCurrency(venta.subtotal, { currency })}
              </span>
            </div>
            <div className="flex justify-between text-sm text-[#625b55]">
              <span>Descuento</span>
              <span className="tabular-nums">
                -{formatCurrency(venta.descuento, { currency })}
              </span>
            </div>
            {propinaNum > 0 ? (
              <div className="flex justify-between text-sm text-[#625b55]">
                <span>Propina</span>
                <span className="tabular-nums">
                  +{formatCurrency(propinaNum, { currency })}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-[#e3d9d1] pt-2 text-lg font-bold text-[#8a5140]">
              <span>Total</span>
              <span className="tabular-nums">
                {formatCurrency(venta.total, { currency })}
              </span>
            </div>
            {propinaNum > 0 ? (
              <div className="flex justify-between text-sm font-semibold text-[#60392e]">
                <span>Total + propina</span>
                <span className="tabular-nums">
                  {formatCurrency(Number(venta.total) + propinaNum, { currency })}
                </span>
              </div>
            ) : null}
          </div>
        </section>

        {editable ? (
          <form
            action={descuentoAction}
            className="space-y-3 rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm"
          >
            <input name="organizacionId" type="hidden" value={organizationId} />
            <input name="ventaId" type="hidden" value={venta.id} />
            <h2 className="text-sm font-semibold text-[#2d2926]">Descuento</h2>
            <div className="flex flex-wrap items-end gap-2">
              <Field className="w-36">
                <FieldLabel className="text-xs">Monto</FieldLabel>
                <Input
                  defaultValue={venta.descuento}
                  key={venta.descuento}
                  min="0"
                  name="descuento"
                  step="0.01"
                  type="number"
                />
              </Field>
              <Button
                className="rounded-xl"
                disabled={descuentoPending}
                type="submit"
                variant="outline"
              >
                {descuentoPending ? "Aplicando…" : "Aplicar"}
              </Button>
              <div aria-label="Descuento rápido" className="flex gap-1.5" role="group">
                {[5, 10].map((pct) => (
                  <Button
                    className="rounded-xl text-[#8a5140]"
                    disabled={descuentoPending}
                    key={pct}
                    onClick={() => aplicarPorcentaje(pct)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {pct}%
                  </Button>
                ))}
              </div>
            </div>
            <ActionFeedback state={descuentoState} />
          </form>
        ) : null}

        {editable ? (
          <CobroForm
            mediosPago={mediosPago}
            modo={modo === "inline" ? "inline" : undefined}
            onCobrada={onCobrada}
            organizationId={organizationId}
            returnTo={returnTo}
            total={Number(venta.total)}
            ventaId={venta.id}
          />
        ) : cancelada ? (
          <section className="rounded-2xl border border-[#f0cdc5] bg-[#fdf1ee] p-6 shadow-sm">
            <h2 className="font-semibold text-[#a8443a]">Venta cancelada</h2>
            <p className="mt-2 text-sm leading-6 text-[#625b55]">
              Se generó una devolución compensatoria: el stock de productos fue
              revertido y las comisiones/propinas quedaron anuladas.
            </p>
            {modo !== "inline" ? (
              <Link
                className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-[#e8bab0] bg-white px-4 text-sm font-medium text-[#a8443a]"
                href={returnTo}
              >
                ← Volver
              </Link>
            ) : null}
          </section>
        ) : (
          <section className="rounded-2xl border border-[#cce5d2] bg-[#f1faf3] p-6 shadow-sm">
            <h2 className="font-semibold text-[#347052]">Venta cerrada</h2>
            <p className="mt-2 text-sm leading-6 text-[#625b55]">
              Esta venta ya fue cobrada y no puede modificarse.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {modo !== "inline" ? (
                <Link
                  className="inline-flex min-h-10 items-center rounded-xl border border-[#b5d4bd] bg-white px-4 text-sm font-medium text-[#347052]"
                  href={returnTo}
                >
                  ← Volver
                </Link>
              ) : null}
              {puedeCancelar ? (
                <CancelarVentaButton
                  onChanged={onChanged}
                  organizationId={organizationId}
                  ventaId={venta.id}
                />
              ) : null}
            </div>
          </section>
        )}

        {pagos.length > 0 ? (
          <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#2d2926]">Pagos registrados</h3>
            <div className="mt-3 space-y-2">
              {pagos.map((pago, index) => (
                <div className="flex justify-between text-sm" key={`${pago.nombre}-${index}`}>
                  <span>
                    {pago.nombre}
                    {Number(pago.cambio) > 0 ? (
                      <span className="text-xs text-[#81746c]">
                        {" "}
                        · recibió {formatCurrency(pago.recibido, { currency })}, cambio{" "}
                        {formatCurrency(pago.cambio, { currency })}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(pago.monto, { currency })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {propinas.length > 0 || comisiones.length > 0 ? (
          <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#2d2926]">Propinas y comisiones</h3>
            <div className="mt-3 space-y-2">
              {propinas.map((propina, index) => (
                <div
                  className="flex justify-between text-sm"
                  key={`propina-${propina.usuarioNombre}-${index}`}
                >
                  <span>Propina · {propina.usuarioNombre}</span>
                  <span className="tabular-nums">
                    {formatCurrency(propina.monto, { currency })}
                  </span>
                </div>
              ))}
              {comisiones.map((comision, index) => (
                <div
                  className="flex justify-between text-sm"
                  key={`comision-${comision.usuarioNombre}-${index}`}
                >
                  <span>Comisión · {comision.usuarioNombre}</span>
                  <span className="tabular-nums">
                    {formatCurrency(comision.monto, { currency })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

/**
 * Cancelación de venta cobrada: pide motivo y confirma antes de llamar a la
 * action que genera la devolución compensatoria.
 */
function CancelarVentaButton({
  onChanged,
  organizationId,
  ventaId,
}: {
  onChanged?: () => void;
  organizationId: string;
  ventaId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    cancelarVentaCobrada,
    initialActionState,
  );

  const handled = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!state.success || handled.current === state) return;
    handled.current = state;
    toast.success(state.message ?? "Venta cancelada.");
    setAbierto(false);
    onChanged?.();
    router.refresh();
  }, [state, toast, onChanged, router]);

  if (!abierto) {
    return (
      <button
        className="inline-flex min-h-10 items-center rounded-xl border border-[#e8bab0] bg-white px-4 text-sm font-medium text-[#a8443a] transition-colors hover:bg-[#fdf1ee]"
        onClick={() => setAbierto(true)}
        type="button"
      >
        Cancelar venta…
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full space-y-3 rounded-xl border border-[#f0cdc5] bg-[#fdf8f6] p-4"
    >
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="ventaId" type="hidden" value={ventaId} />
      <p className="text-xs font-medium text-[#a8443a]">
        La venta se cancelará con devolución compensatoria (no se puede deshacer).
      </p>
      <Field>
        <FieldLabel className="text-xs">Motivo</FieldLabel>
        <Input
          aria-label="Motivo de cancelación"
          maxLength={500}
          name="motivo"
          placeholder="Ej. cobro duplicado, error de captura"
          required
        />
      </Field>
      <ActionFeedback state={state} />
      <div className="flex gap-2">
        <Button
          className="rounded-xl"
          disabled={pending}
          type="submit"
          variant="destructive"
        >
          {pending ? "Cancelando…" : "Confirmar cancelación"}
        </Button>
        <Button
          className="rounded-xl"
          disabled={pending}
          onClick={() => setAbierto(false)}
          type="button"
          variant="ghost"
        >
          Volver
        </Button>
      </div>
    </form>
  );
}
