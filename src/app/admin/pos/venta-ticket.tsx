"use client";

import { Minus, PackageCheck, Plus, ReceiptText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import {
  aplicarDescuento,
  aplicarMembresiaVenta,
  ajustarMedioPagoVenta,
  aplicarPromocionVenta,
  asignarClienteVenta,
  asignarEstilistaLinea,
  cambiarCantidadLinea,
  cancelarVentaCobrada,
  devolverLineasVenta,
  quitarMembresiaAplicada,
  quitarMembresiaVenta,
  quitarPaqueteDeLinea,
  quitarPaqueteVenta,
  quitarProductoVenta,
  quitarPromocionVenta,
  quitarServicioVenta,
  usarPaqueteEnLinea,
} from "@/app/admin/pos/actions";
import { CatalogoSelector } from "@/app/admin/pos/catalogo-selector";
import { CobroForm } from "@/app/admin/pos/cobro-form";
import { FacturarPanel } from "@/app/admin/pos/facturar-panel";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { formatCurrency } from "@/lib/format";
import { formaPagoDesdeCategoria } from "@/modules/facturacion/sat";
import type { TicketData } from "@/modules/pos/ticket";

type LineaServicio = {
  id: string;
  servicioId: string;
  nombre: string;
  precio: string;
  cantidad: number;
  usuarioId: string | null;
  paqueteUsado: boolean;
  paqueteNombre: string | null;
};
type LineaProducto = { id: string; nombre: string; precio: string; cantidad: number };
type LineaPaquete = { id: string; paqueteId: string; nombre: string; precio: string; cantidad: number };
type LineaMembresia = { id: string; membresiaId: string; nombre: string; precio: string; cantidad: number };

type VentaTicketProps = {
  organizationId: string;
  venta: {
    id: string;
    estado: string;
    citaId: string | null;
    clienteId: string | null;
    clienteNombre: string | null;
    subtotal: string;
    descuento: string;
    total: string;
    propina: string;
    promocionId?: string | null;
    promocionNombre?: string | null;
    descuentoPromocion?: string;
    membresiaId?: string | null;
    membresiaNombre?: string | null;
    descuentoMembresia?: string;
  };
  promocionesDisponibles?: TicketData["promocionesDisponibles"];
  lineasServicios: LineaServicio[];
  lineasProductos: LineaProducto[];
  lineasPaquetes?: LineaPaquete[];
  lineasMembresias?: LineaMembresia[];
  catalogoServicios: TicketData["catalogoServicios"];
  catalogoProductos: TicketData["catalogoProductos"];
  catalogoPaquetes?: TicketData["catalogoPaquetes"];
  catalogoMembresias?: TicketData["catalogoMembresias"];
  membresiasCliente?: TicketData["membresiasCliente"];
  paquetesCliente?: TicketData["paquetesCliente"];
  catalogoClientes?: TicketData["catalogoClientes"];
  mediosPago: Array<{ id: string; nombre: string; categoria: string }>;
  pagos: TicketData["pagos"];
  staff: Array<{ id: string; nombre: string }>;
  propinas: Array<{ usuarioNombre: string; monto: string }>;
  comisiones: Array<{ usuarioNombre: string; monto: string }>;
  devoluciones?: TicketData["devoluciones"];
  devueltoPorDetalle?: Record<string, number>;
  anticipos?: TicketData["anticipos"];
  anticipoAplicado?: number;
  anticipoPorAplicar?: number;
  currency: string;
  returnTo: string;
  /** Permiso ventas.cancelar (lo resuelve la página/llamante). */
  puedeCancelar?: boolean;
  /** Permiso ventas.ajustar_pago (lo resuelve la página/llamante). */
  puedeAjustarPago?: boolean;
  /** Permiso facturacion.emitir/cancelar (lo resuelve la página/llamante). */
  puedeFacturar?: boolean;
  /** Comprobante fiscal activo de la venta (si se emitió). */
  comprobante?: TicketData["comprobante"];
  /** Datos fiscales del cliente de la venta (null si incompletos). */
  clienteFiscal?: TicketData["clienteFiscal"];
  /** La organización ya configuró los datos del emisor. */
  facturacionConfigurada?: boolean;
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
  paquete,
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
  /** Solo líneas de servicio: estado de cobertura por paquete del cliente. */
  paquete?: { usado: boolean; nombre: string | null; disponible: number };
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
    <div className="rounded-xl border border-border px-3 py-2.5 text-sm sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-44">
          <p className="truncate font-medium">{line.nombre}</p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {formatCurrency(line.precio, { currency })} c/u
            {paquete?.usado ? " · cubierto por paquete" : ""}
            {!editable && profesionalNombre ? ` · ${profesionalNombre}` : ""}
          </p>
        </div>
        {editable ? (
          <>
            <div
              aria-label={`Cantidad de ${line.nombre}`}
              className="flex items-center overflow-hidden rounded-lg border border-border"
              role="group"
            >
              <button
                aria-label="Reducir cantidad"
                className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-40"
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
                className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-40"
                disabled={pending}
                onClick={() => run(cambiarCantidadLinea, { tipo, delta: "1" })}
                type="button"
              >
                <Plus aria-hidden="true" className="size-3.5" />
              </button>
            </div>
            <span className="w-24 text-right font-semibold tabular-nums">
              {paquete?.usado ? "Paquete" : formatCurrency(importe, { currency })}
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
            <span className="text-xs tabular-nums text-muted-foreground">
              {line.cantidad} × {formatCurrency(line.precio, { currency })}
            </span>
            <span className="w-24 text-right font-semibold tabular-nums">
              {paquete?.usado ? "Paquete" : formatCurrency(importe, { currency })}
            </span>
          </>
        )}
      </div>
      {esServicio && editable ? (
        <div className="mt-1.5 flex items-center gap-2">
          <label
            className="shrink-0 text-xs text-muted-foreground"
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
      {esServicio && editable && paquete ? (
        <div className="mt-1.5 flex items-center gap-2">
          {paquete.usado ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <PackageCheck aria-hidden="true" className="size-3.5" />
                Paquete{paquete.nombre ? ` · ${paquete.nombre}` : ""}
              </span>
              <button
                className="text-xs text-primary underline underline-offset-2 hover:text-primary disabled:opacity-50"
                disabled={pending}
                onClick={() => run(quitarPaqueteDeLinea, {})}
                type="button"
              >
                Liberar sesión
              </button>
            </>
          ) : paquete.disponible > 0 ? (
            <button
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-success/30 px-2.5 text-xs font-medium text-success transition-colors hover:bg-success/10 disabled:opacity-50"
              disabled={pending}
              onClick={() => run(usarPaqueteEnLinea, {})}
              type="button"
            >
              <PackageCheck aria-hidden="true" className="size-3.5" />
              Usar paquete ({paquete.disponible} disp.)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Selector de cliente para ventas walk-in: habilita paquetes y expediente. */
function ClientePicker({
  clientes,
  onChanged,
  organizationId,
  ventaId,
}: {
  clientes: TicketData["catalogoClientes"];
  onChanged?: () => void;
  organizationId: string;
  ventaId: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Combobox
      className="w-56"
      disabled={pending}
      inputClassName="h-8 text-xs"
      items={clientes.map((c) => ({
        value: c.id,
        label: c.nombre,
        description: c.telefono ?? undefined,
        keywords: [c.telefono ?? ""],
      }))}
      label="Cliente de la venta"
      onValueChange={(value) => {
        if (!value) return;
        const data = new FormData();
        data.set("organizacionId", organizationId);
        data.set("ventaId", ventaId);
        data.set("clienteId", value);
        startTransition(async () => {
          const result = await asignarClienteVenta(initialActionState, data);
          if (result.success) {
            toast.success(result.message ?? "Cliente asignado.");
            onChanged?.();
          } else {
            toast.error(result.error ?? "No se pudo asignar el cliente.");
          }
        });
      }}
      placeholder="Asignar cliente…"
    />
  );
}

/** Botón quitar para líneas de paquete/membresía (acción dedicada por tipo). */
function PaqueteQuitarButton({
  action,
  detalleId,
  nombre,
  onChanged,
  organizationId,
  ventaId,
}: {
  action?: LineAction;
  detalleId: string;
  nombre: string;
  onChanged?: () => void;
  organizationId: string;
  ventaId: string;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const removeAction = action ?? quitarPaqueteVenta;
  return (
    <Button
      aria-label={`Quitar ${nombre}`}
      disabled={pending}
      onClick={() => {
        const data = lineFormData(organizationId, ventaId, detalleId, {});
        startTransition(async () => {
          const result = await removeAction(initialActionState, data);
          if (result.success) {
            toast.success(result.message ?? "Línea quitada.");
            onChanged?.();
          } else {
            toast.error(result.error ?? "No se pudo quitar la línea.");
          }
        });
      }}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <Trash2 aria-hidden="true" className="text-destructive" />
    </Button>
  );
}

function AjusteMedioPagoForm({
  currency,
  mediosPago,
  onChanged,
  organizationId,
  pago,
  ventaId,
}: {
  currency: string;
  mediosPago: Array<{ id: string; nombre: string; categoria: string }>;
  onChanged?: () => void;
  organizationId: string;
  pago: TicketData["pagos"][number];
  ventaId: string;
}) {
  const [state, action, pending] = useActionState(ajustarMedioPagoVenta, initialActionState);
  const [abierto, setAbierto] = useState(false);
  const [medioPagoId, setMedioPagoId] = useState("");
  const [monto, setMonto] = useState(() => Number(pago.monto).toFixed(2));
  const [motivo, setMotivo] = useState("");
  const ajustado = pago.ajustes.reduce((sum, ajuste) => sum + Number(ajuste.monto), 0);
  const restante = Math.max(Math.round((Number(pago.monto) - ajustado) * 100) / 100, 0);
  const destinos = mediosPago.filter((medio) => medio.id !== pago.medioPagoId);

  useEffect(() => {
    if (state.success) onChanged?.();
  }, [onChanged, state.success]);

  if (destinos.length === 0 || restante <= 0) return null;
  if (!abierto) {
    return (
      <Button className="min-h-8 rounded-lg text-xs" onClick={() => { setMonto(restante.toFixed(2)); setAbierto(true); }} type="button" variant="outline">
        Corregir medio
      </Button>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3 rounded-xl border border-border bg-muted/60 p-3">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="ventaId" type="hidden" value={ventaId} />
      <input name="pagoId" type="hidden" value={pago.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          <span>Nuevo medio</span>
          <select className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal" name="medioPagoId" onChange={(event) => setMedioPagoId(event.target.value)} required value={medioPagoId}>
            <option value="">Selecciona…</option>
            {destinos.map((medio) => <option key={medio.id} value={medio.id}>{medio.nombre}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
          <span>Monto máximo {formatCurrency(restante, { currency })}</span>
          <input className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal tabular-nums" inputMode="decimal" max={restante} min="0.01" name="monto" onChange={(event) => setMonto(event.target.value)} step="0.01" type="number" value={monto} />
        </label>
      </div>
      <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
        <span>Motivo</span>
        <textarea className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal" maxLength={500} name="motivo" onChange={(event) => setMotivo(event.target.value)} placeholder="Ej. Se capturó transferencia en lugar de tarjeta." required value={motivo} />
      </label>
      <ActionFeedback state={state} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={pending} onClick={() => setAbierto(false)} type="button" variant="ghost">Cerrar</Button>
        <Button disabled={pending || !medioPagoId || !motivo.trim() || !(Number(monto) > 0)} type="submit">{pending ? "Guardando…" : "Guardar corrección"}</Button>
      </div>
    </form>
  );
}

export function VentaTicket({
  organizationId,
  venta,
  lineasServicios,
  lineasProductos,
  lineasPaquetes = [],
  lineasMembresias = [],
  catalogoServicios,
  catalogoProductos,
  catalogoPaquetes = [],
  catalogoMembresias = [],
  membresiasCliente = [],
  paquetesCliente = [],
  catalogoClientes = [],
  mediosPago,
  pagos,
  staff,
  propinas,
  comisiones,
  devoluciones = [],
  devueltoPorDetalle = {},
  anticipos = [],
  anticipoAplicado = 0,
  anticipoPorAplicar = 0,
  promocionesDisponibles = [],
  currency,
  returnTo,
  puedeCancelar = false,
  puedeAjustarPago = false,
  puedeFacturar = false,
  comprobante = null,
  clienteFiscal = null,
  facturacionConfigurada = false,
  modo = "page",
  onCobrada,
  onChanged,
}: VentaTicketProps) {
  const editable = venta.estado === "en_proceso";
  const cancelada = venta.estado === "cancelada";
  // Forma de pago SAT sugerida: categoría del medio con mayor monto pagado.
  const pagoPrincipal = pagos.reduce<(typeof pagos)[number] | null>(
    (mayor, p) => (Number(p.monto) > Number(mayor?.monto ?? -1) ? p : mayor),
    null,
  );
  const formaPagoSugerida = formaPagoDesdeCategoria(
    mediosPago.find((m) => m.nombre === pagoPrincipal?.nombre)?.categoria,
  );
  const [descuentoState, descuentoAction, descuentoPending] = useActionState(
    aplicarDescuento,
    initialActionState,
  );
  const [promoState, promoAction, promoPending] = useActionState(
    aplicarPromocionVenta,
    initialActionState,
  );
  const [quitarPromoState, quitarPromoAction, quitarPromoPending] = useActionState(
    quitarPromocionVenta,
    initialActionState,
  );
  const [membresiaState, membresiaAction, membresiaPending] = useActionState(
    aplicarMembresiaVenta,
    initialActionState,
  );
  const [quitarMembresiaState, quitarMembresiaAction, quitarMembresiaPending] = useActionState(
    quitarMembresiaAplicada,
    initialActionState,
  );
  const [, startQuickTransition] = useTransition();
  const propinaNum = Number(venta.propina) || 0;
  const totalDevuelto = devoluciones.reduce((s, d) => s + Number(d.monto), 0);
  // Importe de servicios cubiertos por paquete (informativo; no cobrado).
  const cubiertoPorPaquete = lineasServicios
    .filter((l) => l.paqueteUsado)
    .reduce((s, l) => s + Number(l.precio) * l.cantidad, 0);

  // En modo inline el descuento también debe provocar el refetch del ticket.
  const handledDescuento = useRef<ActionState | null>(null);
  useEffect(() => {
    if (!descuentoState.success || handledDescuento.current === descuentoState) return;
    handledDescuento.current = descuentoState;
    onChanged?.();
  }, [descuentoState, onChanged]);
  // En modo inline la promoción también provoca el refetch del ticket.
  const handledPromo = useRef<ActionState | null>(null);
  useEffect(() => {
    const estado = promoState.success ? promoState : quitarPromoState.success ? quitarPromoState : null;
    if (!estado || handledPromo.current === estado) return;
    handledPromo.current = estado;
    onChanged?.();
  }, [promoState, quitarPromoState, onChanged]);
  // Ídem la membresía aplicada al ticket.
  const handledMembresia = useRef<ActionState | null>(null);
  useEffect(() => {
    const estado = membresiaState.success ? membresiaState : quitarMembresiaState.success ? quitarMembresiaState : null;
    if (!estado || handledMembresia.current === estado) return;
    handledMembresia.current = estado;
    onChanged?.();
  }, [membresiaState, quitarMembresiaState, onChanged]);

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
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ReceiptText aria-hidden="true" className="size-5 text-primary" /> Ticket
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                Cliente: {venta.clienteNombre ?? "Walk-in"}
                {venta.citaId ? " · desde cita" : ""}
              </span>
              {editable && catalogoClientes.length > 0 ? (
                <ClientePicker
                  clientes={catalogoClientes}
                  onChanged={onChanged}
                  organizationId={organizationId}
                  ventaId={venta.id}
                />
              ) : null}
            </div>
          </div>
          <StatusBadge tone={editable ? "warning" : cancelada ? "destructive" : "success"}>
            {editable ? "En proceso" : cancelada ? "Cancelada" : "Completada"}
          </StatusBadge>
        </div>

        {editable ? (
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
              Agregar al ticket
            </h3>
            <CatalogoSelector
              className="mt-3"
              currency={currency}
              hasCliente={Boolean(venta.clienteId)}
              membresias={catalogoMembresias}
              onAdded={onChanged}
              organizationId={organizationId}
              paquetes={catalogoPaquetes}
              productos={catalogoProductos}
              servicios={catalogoServicios}
              ventaId={venta.id}
            />
          </div>
        ) : null}

        <div className="mt-6 space-y-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
              Servicios
            </h3>
            <div className="mt-3 space-y-2">
              {lineasServicios.length === 0 ? (
                <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
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
                    paquete={{
                      usado: linea.paqueteUsado,
                      nombre: linea.paqueteNombre,
                      disponible: paquetesCliente
                        .filter((p) => p.servicioId === linea.servicioId)
                        .reduce((s, p) => s + p.sesionesRestantes, 0),
                    }}
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
              Productos
            </h3>
            <div className="mt-3 space-y-2">
              {lineasProductos.length === 0 ? (
                <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
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

          {lineasPaquetes.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
                Paquetes
              </h3>
              <div className="mt-3 space-y-2">
                {lineasPaquetes.map((linea) => (
                  <div
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm sm:px-4"
                    key={linea.id}
                  >
                    <PackageCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{linea.nombre}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {linea.cantidad} × {formatCurrency(linea.precio, { currency })}
                      </p>
                    </div>
                    <span className="w-24 text-right font-semibold tabular-nums">
                      {formatCurrency(Number(linea.precio) * linea.cantidad, { currency })}
                    </span>
                    {editable ? (
                      <PaqueteQuitarButton
                        detalleId={linea.id}
                        nombre={linea.nombre}
                        onChanged={onChanged}
                        organizationId={organizationId}
                        ventaId={venta.id}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {lineasMembresias.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
                Membresías
              </h3>
              <div className="mt-3 space-y-2">
                {lineasMembresias.map((linea) => (
                  <div
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm sm:px-4"
                    key={linea.id}
                  >
                    <PackageCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{linea.nombre}</p>
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {linea.cantidad} × {formatCurrency(linea.precio, { currency })}
                      </p>
                    </div>
                    <span className="w-24 text-right font-semibold tabular-nums">
                      {formatCurrency(Number(linea.precio) * linea.cantidad, { currency })}
                    </span>
                    {editable ? (
                      <PaqueteQuitarButton
                        action={quitarMembresiaVenta}
                        detalleId={linea.id}
                        nombre={linea.nombre}
                        onChanged={onChanged}
                        organizationId={organizationId}
                        ventaId={venta.id}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Totales</h2>
          <div className="mt-3 space-y-2 rounded-xl bg-accent/70 p-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal</span>
              <span className="tabular-nums">
                {formatCurrency(venta.subtotal, { currency })}
              </span>
            </div>
            {cubiertoPorPaquete > 0 ? (
              <div className="flex justify-between text-xs text-success">
                <span>Cubierto por paquete (no cobrado)</span>
                <span className="tabular-nums">
                  {formatCurrency(cubiertoPorPaquete, { currency })}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Descuento</span>
              <span className="tabular-nums">
                -{formatCurrency(venta.descuento, { currency })}
              </span>
            </div>
            {Number(venta.descuentoPromocion ?? 0) > 0 ? (
              <div className="flex justify-between text-sm font-medium text-success">
                <span>Promoción{venta.promocionNombre ? ` · ${venta.promocionNombre}` : ""}</span>
                <span className="tabular-nums">
                  -{formatCurrency(venta.descuentoPromocion ?? "0", { currency })}
                </span>
              </div>
            ) : null}
            {Number(venta.descuentoMembresia ?? 0) > 0 ? (
              <div className="flex justify-between text-sm font-medium text-primary">
                <span>Membresía{venta.membresiaNombre ? ` · ${venta.membresiaNombre}` : ""}</span>
                <span className="tabular-nums">
                  -{formatCurrency(venta.descuentoMembresia ?? "0", { currency })}
                </span>
              </div>
            ) : null}
            {propinaNum > 0 ? (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Propina</span>
                <span className="tabular-nums">
                  +{formatCurrency(propinaNum, { currency })}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-border pt-2 text-lg font-bold text-primary">
              <span>Total</span>
              <span className="tabular-nums">
                {formatCurrency(venta.total, { currency })}
              </span>
            </div>
            {anticipoAplicado > 0 ? (
              <div className="flex justify-between text-sm font-medium text-success">
                <span>Anticipo aplicado</span>
                <span className="tabular-nums">-{formatCurrency(anticipoAplicado, { currency })}</span>
              </div>
            ) : null}
            {editable && anticipoPorAplicar > 0 ? (
              <div className="flex justify-between text-sm font-medium text-success">
                <span>Anticipo por aplicar</span>
                <span className="tabular-nums">-{formatCurrency(anticipoPorAplicar, { currency })}</span>
              </div>
            ) : null}
            {totalDevuelto > 0 ? (
              <>
                <div className="flex justify-between text-sm text-destructive">
                  <span>Devuelto</span>
                  <span className="tabular-nums">-{formatCurrency(totalDevuelto, { currency })}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold text-foreground">
                  <span>Neto cobrado</span>
                  <span className="tabular-nums">
                    {formatCurrency(Math.max(Number(venta.total) - totalDevuelto, 0), { currency })}
                  </span>
                </div>
              </>
            ) : null}
            {propinaNum > 0 ? (
              <div className="flex justify-between text-sm font-semibold text-primary">
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
            className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <input name="organizacionId" type="hidden" value={organizationId} />
            <input name="ventaId" type="hidden" value={venta.id} />
            <h2 className="text-sm font-semibold text-foreground">Descuento</h2>
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
                    className="rounded-xl text-primary"
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

        {editable && (promocionesDisponibles.length > 0 || venta.promocionId) ? (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Promoción</h2>
            {venta.promocionId ? (
              <form action={quitarPromoAction} className="flex items-center justify-between gap-3">
                <input name="organizacionId" type="hidden" value={organizationId} />
                <input name="ventaId" type="hidden" value={venta.id} />
                <p className="min-w-0 flex-1 text-sm text-success">
                  <span className="font-medium">{venta.promocionNombre ?? "Aplicada"}</span>
                  <span className="ml-2 tabular-nums">-{formatCurrency(venta.descuentoPromocion ?? "0", { currency })}</span>
                </p>
                <Button
                  className="rounded-xl"
                  disabled={quitarPromoPending}
                  size="sm"
                  type="submit"
                  variant="ghost"
                >
                  {quitarPromoPending ? "Quitando…" : "Quitar"}
                </Button>
              </form>
            ) : (
              <form action={promoAction} className="flex flex-wrap items-end gap-2">
                <input name="organizacionId" type="hidden" value={organizationId} />
                <input name="ventaId" type="hidden" value={venta.id} />
                <div className="min-w-0 flex-1">
                  <Combobox
                    clearable={false}
                    emptyMessage="Sin promociones vigentes"
                    items={promocionesDisponibles.map((p) => ({
                      value: p.id,
                      label: p.nombre,
                      description:
                        p.tipo === "porcentaje"
                          ? `${Number(p.valor)}% ${p.aplica === "ambos" ? "en todo" : `en ${p.aplica}`}`
                          : `-${formatCurrency(p.valor, { currency })} ${p.aplica === "ambos" ? "en todo" : `en ${p.aplica}`}`,
                    }))}
                    label="Promoción vigente"
                    name="promocionId"
                    placeholder="Buscar promoción…"
                    required
                  />
                </div>
                <Button
                  className="rounded-xl"
                  disabled={promoPending}
                  type="submit"
                  variant="outline"
                >
                  {promoPending ? "Aplicando…" : "Aplicar promoción"}
                </Button>
              </form>
            )}
            <ActionFeedback state={promoState.success || promoState.error ? promoState : quitarPromoState} />
          </section>
        ) : null}

        {editable && (membresiasCliente.length > 0 || venta.membresiaId) ? (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Membresía del cliente</h2>
            {venta.membresiaId ? (
              <form action={quitarMembresiaAction} className="flex items-center justify-between gap-3">
                <input name="organizacionId" type="hidden" value={organizationId} />
                <input name="ventaId" type="hidden" value={venta.id} />
                <p className="min-w-0 flex-1 text-sm text-primary">
                  <span className="font-medium">{venta.membresiaNombre ?? "Aplicada"}</span>
                  <span className="ml-2 tabular-nums">-{formatCurrency(venta.descuentoMembresia ?? "0", { currency })}</span>
                </p>
                <Button
                  className="rounded-xl"
                  disabled={quitarMembresiaPending}
                  size="sm"
                  type="submit"
                  variant="ghost"
                >
                  {quitarMembresiaPending ? "Quitando…" : "Quitar"}
                </Button>
              </form>
            ) : (
              <form action={membresiaAction} className="flex flex-wrap items-end gap-2">
                <input name="organizacionId" type="hidden" value={organizationId} />
                <input name="ventaId" type="hidden" value={venta.id} />
                <div className="min-w-0 flex-1">
                  <Combobox
                    clearable={false}
                    emptyMessage="Sin membresías vigentes"
                    items={membresiasCliente.map((m) => ({
                      value: m.id,
                      label: m.nombre,
                      description: `${Number(m.descuentoPorcentaje)}% ${m.aplica === "ambos" ? "en todo" : `en ${m.aplica}`} · hasta ${m.vigenciaHasta}`,
                    }))}
                    label="Membresía vigente"
                    name="clienteMembresiaId"
                    placeholder="Buscar membresía…"
                    required
                  />
                </div>
                <Button
                  className="rounded-xl"
                  disabled={membresiaPending}
                  type="submit"
                  variant="outline"
                >
                  {membresiaPending ? "Aplicando…" : "Aplicar membresía"}
                </Button>
              </form>
            )}
            <ActionFeedback state={membresiaState.success || membresiaState.error ? membresiaState : quitarMembresiaState} />
          </section>
        ) : null}

        {anticipos.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-foreground">Anticipos de la cita</h2>
            <ul className="mt-3 space-y-2">
              {anticipos.map((ant) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-2.5 text-sm"
                  key={ant.id}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium tabular-nums">
                      {formatCurrency(ant.monto, { currency })}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {ant.medioNombre ?? "Medio"}
                    </span>
                  </span>
                  <StatusBadge
                    tone={ant.estado === "aplicado" ? "success" : ant.estado === "devuelto" ? "destructive" : "info"}
                  >
                    {ant.estado === "aplicado" ? "Aplicado" : ant.estado === "devuelto" ? "Devuelto" : "Vigente"}
                  </StatusBadge>
                </li>
              ))}
            </ul>
            {editable && anticipos.some((a) => a.estado === "vigente") && anticipoPorAplicar === 0 ? (
              <p className="mt-3 rounded-xl bg-warning/10 px-4 py-2.5 text-xs text-warning">
                El anticipo vigente excede el total del ticket; no se aplicará automáticamente.
                Devuélvelo desde la cita.
              </p>
            ) : null}
          </section>
        ) : null}

        {editable ? (
          <CobroForm
            anticipo={anticipoPorAplicar}
            mediosPago={mediosPago}
            modo={modo === "inline" ? "inline" : undefined}
            onCobrada={onCobrada}
            organizationId={organizationId}
            returnTo={returnTo}
            total={Number(venta.total)}
            ventaId={venta.id}
          />
        ) : cancelada ? (
          <section className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 shadow-sm">
            <h2 className="font-semibold text-destructive">Venta cancelada</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Se generó una devolución compensatoria: el stock de productos fue
              revertido y las comisiones/propinas quedaron anuladas.
            </p>
            {modo !== "inline" ? (
              <Link
                className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-destructive"
                href={returnTo}
              >
                ← Volver
              </Link>
            ) : null}
          </section>
        ) : (
          <section className="rounded-2xl border border-success/30 bg-success/10 p-6 shadow-sm">
            <h2 className="font-semibold text-success">Venta cerrada</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Esta venta ya fue cobrada y no puede modificarse.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {modo !== "inline" ? (
                <Link
                  className="inline-flex min-h-10 items-center rounded-xl border border-success/30 bg-card px-4 text-sm font-medium text-success"
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

        {devoluciones.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Devoluciones</h3>
            <ul className="mt-3 space-y-3">
              {devoluciones.map((dev) => (
                <li className="rounded-xl border border-border px-4 py-3 text-sm" key={dev.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-destructive">
                      -{formatCurrency(dev.monto, { currency })}
                    </span>
                    <span className="text-xs text-muted-foreground">{dev.usuarioNombre ?? "—"}</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {dev.lineas.map((linea, i) => (
                      <li key={i}>
                        {linea.nombre} × {linea.cantidad} · {formatCurrency(linea.monto, { currency })}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">{dev.motivo}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!editable && !cancelada && puedeCancelar ? (
          <DevolucionParcialPanel
            currency={currency}
            devueltoPorDetalle={devueltoPorDetalle}
            lineas={[
              ...lineasServicios.map((l) => ({ tipo: "servicio" as const, detalleId: l.id, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
              ...lineasProductos.map((l) => ({ tipo: "producto" as const, detalleId: l.id, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
              ...lineasPaquetes.map((l) => ({ tipo: "paquete" as const, detalleId: l.id, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
              ...lineasMembresias.map((l) => ({ tipo: "membresia" as const, detalleId: l.id, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
            ]}
            onChanged={onChanged}
            organizationId={organizationId}
            ventaId={venta.id}
          />
        ) : null}

        {pagos.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Pagos registrados</h3>
            <div className="mt-3 space-y-3">
              {pagos.map((pago) => (
                <div className="rounded-xl border border-border px-3 py-2.5" key={pago.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {pago.nombre}
                      {Number(pago.cambio) > 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          · recibió {formatCurrency(pago.recibido, { currency })}, cambio{" "}
                          {formatCurrency(pago.cambio, { currency })}
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums">{formatCurrency(pago.monto, { currency })}</span>
                  </div>
                  {pago.ajustes.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {pago.ajustes.map((ajuste) => (
                        <li key={ajuste.id}>
                          Reclasificado a <span className="font-medium text-primary">{ajuste.destinoNombre ?? "medio inactivo"}</span> por {formatCurrency(ajuste.monto, { currency })} · {ajuste.motivo}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {!editable && !cancelada && puedeAjustarPago ? (
                    <AjusteMedioPagoForm
                      currency={currency}
                      mediosPago={mediosPago}
                      onChanged={onChanged}
                      organizationId={organizationId}
                      pago={pago}
                      ventaId={venta.id}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!editable && !cancelada && puedeFacturar ? (
          <FacturarPanel
            clienteFiscal={clienteFiscal}
            comprobante={comprobante}
            currency={currency}
            facturacionConfigurada={facturacionConfigurada}
            formaPagoSugerida={formaPagoSugerida}
            organizationId={organizationId}
            ventaId={venta.id}
          />
        ) : null}

        {propinas.length > 0 || comisiones.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Propinas y comisiones</h3>
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
        className="inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
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
      className="w-full space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4"
    >
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="ventaId" type="hidden" value={ventaId} />
      <p className="text-xs font-medium text-destructive">
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

/**
 * Devolución parcial por línea: selecciona cantidades a devolver por línea del
 * ticket (tope = vendidas − ya devueltas) y genera el documento compensatorio.
 */
function DevolucionParcialPanel({
  currency,
  devueltoPorDetalle,
  lineas,
  onChanged,
  organizationId,
  ventaId,
}: {
  currency: string;
  devueltoPorDetalle: Record<string, number>;
  lineas: Array<{ tipo: "servicio" | "producto" | "paquete" | "membresia"; detalleId: string; nombre: string; precio: string; cantidad: number }>;
  onChanged?: () => void;
  organizationId: string;
  ventaId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();

  const conSaldo = lineas.filter((l) => l.cantidad - (devueltoPorDetalle[l.detalleId] ?? 0) > 0);
  const totalSeleccionado = conSaldo.reduce((s, l) => s + (cantidades[l.detalleId] ?? 0), 0);

  const submit = (form: HTMLFormElement) => {
    const motivo = String(new FormData(form).get("motivo") ?? "").trim();
    const seleccion = conSaldo
      .filter((l) => (cantidades[l.detalleId] ?? 0) > 0)
      .map((l) => ({ tipo: l.tipo, detalleId: l.detalleId, cantidad: cantidades[l.detalleId] }));
    if (seleccion.length === 0) {
      toast.error("Indica al menos una cantidad a devolver.");
      return;
    }
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("ventaId", ventaId);
    data.set("motivo", motivo);
    data.set("lineas", JSON.stringify(seleccion));
    startTransition(async () => {
      const result = await devolverLineasVenta(initialActionState, data);
      if (result.success) {
        toast.success(result.message ?? "Devolución registrada.");
        setAbierto(false);
        setCantidades({});
        onChanged?.();
        router.refresh();
      } else {
        toast.error(result.error ?? "No se pudo registrar la devolución.");
      }
    });
  };

  if (!abierto) {
    return conSaldo.length > 0 ? (
      <button
        className="inline-flex min-h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-accent-foreground/30"
        onClick={() => setAbierto(true)}
        type="button"
      >
        Devolver líneas…
      </button>
    ) : null;
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">Devolución parcial</h3>
      <form
        className="mt-3 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit(event.currentTarget);
        }}
      >
        <ul className="space-y-2">
          {lineas.map((linea) => {
            const devueltas = devueltoPorDetalle[linea.detalleId] ?? 0;
            const pendiente = linea.cantidad - devueltas;
            return (
              <li
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm"
                key={linea.detalleId}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{linea.nombre}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {linea.tipo} · {linea.cantidad} vendida(s)
                    {devueltas > 0 ? ` · ${devueltas} devuelta(s)` : ""}
                    {(cantidades[linea.detalleId] ?? 0) > 0
                      ? ` · devuelve ≈${formatCurrency(Number(linea.precio) * (cantidades[linea.detalleId] ?? 0), { currency })}`
                      : ""}
                  </p>
                </div>
                {pendiente > 0 ? (
                  <Input
                    aria-label={`Cantidad a devolver de ${linea.nombre}`}
                    className="w-20 text-center"
                    max={pendiente}
                    min={0}
                    onChange={(event) =>
                      setCantidades((current) => ({
                        ...current,
                        [linea.detalleId]: Math.min(Math.max(Number(event.target.value) || 0, 0), pendiente),
                      }))
                    }
                    step={1}
                    type="number"
                    value={cantidades[linea.detalleId] ?? 0}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">devuelta</span>
                )}
              </li>
            );
          })}
        </ul>
        <Field>
          <FieldLabel className="text-xs">Motivo</FieldLabel>
          <Input maxLength={500} name="motivo" placeholder="Ej. producto defectuoso" required />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-xl" disabled={pending || totalSeleccionado === 0} type="submit" variant="outline">
            {pending ? "Registrando…" : "Registrar devolución"}
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
        <p className="text-[11px] leading-4 text-muted-foreground">
          El descuento del ticket se prorratea en el monto devuelto; el stock de productos vuelve a inventario.
        </p>
      </form>
    </section>
  );
}
