"use client";

import { ChevronDown, Minus, PackageCheck, Plus, ReceiptText, Trash2 } from "lucide-react";
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
import { TicketActionsBar } from "@/app/admin/pos/printable-ticket";
import { StatusBadge } from "@/components/status-badge";
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
import { Combobox } from "@/components/ui/combobox";
import { RemoteCombobox } from "@/components/ui/remote-combobox";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { formatCurrency } from "@/lib/format";
import { GLOSARIO } from "@/lib/glosario";
import { cn } from "@/lib/utils";
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
    clienteTelefono?: string | null;
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
  /** Nombre del negocio para el encabezado del ticket impreso/WhatsApp. */
  negocioNombre?: string;
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
    <div
      className={cn(
        "group rounded-2xl border border-border/80 bg-card p-3 sm:px-4 text-sm shadow-xs transition-all duration-200 hover:border-border hover:shadow-sm anim-entrada",
        pending && "opacity-60",
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{line.nombre}</p>
          <p className="mt-0.5 text-op-xs tabular-nums text-muted-foreground">
            {formatCurrency(line.precio, { currency })} c/u
            {paquete?.usado ? " · cubierto por paquete" : ""}
            {!editable && profesionalNombre ? ` · ${profesionalNombre}` : ""}
          </p>
        </div>
        {editable ? (
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div
              aria-label={`Cantidad de ${line.nombre}`}
              className="flex items-center overflow-hidden rounded-xl border border-border bg-muted/30 shadow-xs"
              role="group"
            >
              <button
                aria-label="Disminuir cantidad"
                className="flex size-11 min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-all duration-100 hover:bg-muted hover:text-foreground active:scale-[0.98] disabled:opacity-40"
                disabled={pending}
                onClick={() => run(cambiarCantidadLinea, { tipo, delta: "-1" })}
                type="button"
              >
                <Minus aria-hidden="true" className="size-4" />
              </button>
              <span
                aria-live="polite"
                className="w-8 text-center text-op-xs font-bold tabular-nums text-foreground"
              >
                {line.cantidad}
              </span>
              <button
                aria-label="Aumentar cantidad"
                className="flex size-11 min-h-11 min-w-11 items-center justify-center text-muted-foreground transition-all duration-100 hover:bg-muted hover:text-foreground active:scale-[0.98] disabled:opacity-40"
                disabled={pending}
                onClick={() => run(cambiarCantidadLinea, { tipo, delta: "1" })}
                type="button"
              >
                <Plus aria-hidden="true" className="size-4" />
              </button>
            </div>
            <span className="w-24 text-right font-bold tabular-nums text-foreground">
              {paquete?.usado ? "Paquete" : formatCurrency(importe, { currency })}
            </span>
            <Button
              aria-label={`Quitar ${line.nombre}`}
              className="min-h-11 min-w-11 text-muted-foreground transition-all duration-150 hover:bg-destructive-soft hover:text-destructive active:scale-[0.98]"
              disabled={pending}
              onClick={() => run(removeAction, {})}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-op-xs tabular-nums text-muted-foreground">
              {line.cantidad} × {formatCurrency(line.precio, { currency })}
            </span>
            <span className="w-24 text-right font-bold tabular-nums text-foreground">
              {paquete?.usado ? "Paquete" : formatCurrency(importe, { currency })}
            </span>
          </div>
        )}
      </div>
      {esServicio && editable ? (
        <div className="mt-1.5 flex items-center gap-2">
          <label
            className="shrink-0 text-op-xs text-muted-foreground"
            htmlFor={`profesional-${line.id}`}
          >
            Profesional
          </label>
          <select
            aria-label={`Profesional para ${line.nombre}`}
            className="h-11 min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-op-xs outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60 sm:max-w-52"
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
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-op-xs font-medium text-success-soft-foreground">
                <PackageCheck aria-hidden="true" className="size-3.5" />
                Paquete{paquete.nombre ? ` · ${paquete.nombre}` : ""}
              </span>
              <button
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-op-xs font-medium text-primary underline underline-offset-2 transition-colors hover:bg-accent/70 hover:text-primary disabled:opacity-50"
                disabled={pending}
                onClick={() => run(quitarPaqueteDeLinea, {})}
                type="button"
              >
                Liberar sesión
              </button>
            </>
          ) : paquete.disponible > 0 ? (
            <button
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 text-op-xs font-medium bg-success-soft text-success-soft-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
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

/** Selector de cliente para ventas walk-in: habilita paquetes y expediente con búsqueda remota. */
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
  const defaultItems = clientes.map((c) => ({
    value: c.id,
    label: c.nombre,
    description: c.telefono ?? undefined,
    keywords: [c.telefono ?? ""],
  }));

  return (
    <RemoteCombobox
      className="w-56"
      defaultItems={defaultItems}
      disabled={pending}
      inputClassName="h-8 text-op-xs"
      label="Cliente de la venta"
      labelClassName="sr-only"
      placeholder="Asignar cliente…"
      searchUrl={`/api/clientes?organizationId=${organizationId}`}
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
      className="min-h-11 min-w-11"
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
      size="icon"
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
      <Button className="min-h-8 rounded-lg text-op-xs" onClick={() => { setMonto(restante.toFixed(2)); setAbierto(true); }} type="button" variant="outline">
        Corregir medio
      </Button>
    );
  }

  return (
    <form action={action} className="mt-3 space-y-3 rounded-xl border border-border bg-muted/60 p-3">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="ventaId" type="hidden" value={ventaId} />
      <input name="pagoId" type="hidden" value={pago.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 text-op-xs font-medium text-muted-foreground">
          <span>Nuevo medio</span>
          <select aria-label="Nuevo medio de pago" className="h-11 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal" name="medioPagoId" onChange={(event) => setMedioPagoId(event.target.value)} required value={medioPagoId}>
            <option value="">Selecciona…</option>
            {destinos.map((medio) => <option key={medio.id} value={medio.id}>{medio.nombre}</option>)}
          </select>
        </label>
        <label className="space-y-1.5 text-op-xs font-medium text-muted-foreground">
          <span>Monto máximo {formatCurrency(restante, { currency })}</span>
          <input className="h-11 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal tabular-nums" inputMode="decimal" max={restante} min="0.01" name="monto" onChange={(event) => setMonto(event.target.value)} step="0.01" type="number" value={monto} />
        </label>
      </div>
      <label className="block space-y-1.5 text-op-xs font-medium text-muted-foreground">
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
  negocioNombre,
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
  const tieneLineasPostTotal =
    anticipoAplicado > 0 || (editable && anticipoPorAplicar > 0) || totalDevuelto > 0 || propinaNum > 0;
  const tieneAjustesResumen =
    cubiertoPorPaquete > 0 ||
    Number(venta.descuento) > 0 ||
    Number(venta.descuentoPromocion ?? 0) > 0 ||
    Number(venta.descuentoMembresia ?? 0) > 0 ||
    tieneLineasPostTotal;
  const tieneBeneficioActivo =
    Number(venta.descuento) > 0 || Boolean(venta.promocionId) || Boolean(venta.membresiaId);

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
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] min-w-0 max-w-full">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm min-w-0 max-w-full">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ReceiptText aria-hidden="true" className="size-5 text-primary" /> Ticket
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>
                Cliente: {venta.clienteNombre ?? GLOSARIO.clienteDePaso}
                {venta.citaId ? " · desde cita" : ""}
              </span>
              {editable ? (
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
            <h3 className="text-op-xs font-semibold uppercase tracking-wide text-primary">
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
            <h3 className="text-op-xs font-semibold uppercase tracking-wide text-primary">
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
            <h3 className="text-op-xs font-semibold uppercase tracking-wide text-primary">
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
              <h3 className="text-op-xs font-semibold uppercase tracking-wide text-primary">
                Paquetes
              </h3>
              <div className="mt-3 space-y-2">
                {lineasPaquetes.map((linea) => (
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0 rounded-xl border border-border px-3 py-2.5 text-sm sm:px-4"
                    key={linea.id}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <PackageCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{linea.nombre}</p>
                        <p className="mt-0.5 text-op-xs tabular-nums text-muted-foreground">
                          {linea.cantidad} × {formatCurrency(linea.precio, { currency })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
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
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {lineasMembresias.length > 0 ? (
            <section>
              <h3 className="text-op-xs font-semibold uppercase tracking-wide text-primary">
                Membresías
              </h3>
              <div className="mt-3 space-y-2">
                {lineasMembresias.map((linea) => (
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0 rounded-xl border border-border px-3 py-2.5 text-sm sm:px-4"
                    key={linea.id}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <PackageCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{linea.nombre}</p>
                        <p className="mt-0.5 text-op-xs tabular-nums text-muted-foreground">
                          {linea.cantidad} × {formatCurrency(linea.precio, { currency })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
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
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-foreground">Resumen de cobro</h2>
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-op-xs font-medium text-muted-foreground uppercase tracking-wider">
              {venta.estado === "en_proceso" ? "Pendiente" : venta.estado === "completada" ? "Cobrado" : "Cancelado"}
            </span>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/10 p-4">
            <div>
              <span className="text-op-xs font-semibold uppercase tracking-wider text-primary">Total</span>
              {anticipoAplicado > 0 ? (
                <p className="text-op-xs text-muted-foreground">
                  Anticipo: -{formatCurrency(anticipoAplicado, { currency })}
                </p>
              ) : null}
            </div>
            <span className="font-mono text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-primary">
              {formatCurrency(venta.total, { currency })}
            </span>
          </div>

          <details className="group mt-3" open={tieneAjustesResumen}>
            <summary className="cursor-pointer text-op-xs font-medium text-muted-foreground hover:text-foreground">
              Ver desglose detallado
            </summary>
            <div className="mt-2 divide-y divide-border/60 rounded-xl bg-accent/40 p-4 transition-all">
              <div className="space-y-2 pb-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums text-foreground">
                    {formatCurrency(venta.subtotal, { currency })}
                  </span>
                </div>
                {cubiertoPorPaquete > 0 ? (
                  <div className="flex justify-between text-op-xs text-success">
                    <span>Cubierto por paquete (no cobrado)</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrency(cubiertoPorPaquete, { currency })}
                    </span>
                  </div>
                ) : null}
                {Number(venta.descuento) > 0 ? (
                  <div className="flex justify-between text-op-xs text-muted-foreground">
                    <span>Descuento directo</span>
                    <span className="font-mono tabular-nums text-foreground">
                      -{formatCurrency(venta.descuento, { currency })}
                    </span>
                  </div>
                ) : null}
                {Number(venta.descuentoPromocion ?? 0) > 0 ? (
                  <div className="flex justify-between text-op-xs font-medium text-success">
                    <span>Promoción{venta.promocionNombre ? ` · ${venta.promocionNombre}` : ""}</span>
                    <span className="font-mono tabular-nums">
                      -{formatCurrency(venta.descuentoPromocion ?? "0", { currency })}
                    </span>
                  </div>
                ) : null}
                {Number(venta.descuentoMembresia ?? 0) > 0 ? (
                  <div className="flex justify-between text-op-xs font-medium text-primary">
                    <span>Membresía{venta.membresiaNombre ? ` · ${venta.membresiaNombre}` : ""}</span>
                    <span className="font-mono tabular-nums">
                      -{formatCurrency(venta.descuentoMembresia ?? "0", { currency })}
                    </span>
                  </div>
                ) : null}
                {propinaNum > 0 ? (
                  <div className="flex justify-between text-op-xs text-muted-foreground">
                    <span>Propina</span>
                    <span className="font-mono tabular-nums text-foreground">
                      +{formatCurrency(propinaNum, { currency })}
                    </span>
                  </div>
                ) : null}
              </div>

              {tieneLineasPostTotal ? (
                <div className="space-y-2 pt-3">
                  {anticipoAplicado > 0 ? (
                    <div className="flex justify-between text-op-xs font-medium text-success">
                      <span>Anticipo aplicado</span>
                      <span className="font-mono tabular-nums">-{formatCurrency(anticipoAplicado, { currency })}</span>
                    </div>
                  ) : null}
                  {editable && anticipoPorAplicar > 0 ? (
                    <div className="flex justify-between text-op-xs font-medium text-success">
                      <span>Anticipo por aplicar</span>
                      <span className="font-mono tabular-nums">-{formatCurrency(anticipoPorAplicar, { currency })}</span>
                    </div>
                  ) : null}
                  {totalDevuelto > 0 ? (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex justify-between text-op-xs text-destructive">
                        <span>Devuelto</span>
                        <span className="font-mono tabular-nums">-{formatCurrency(totalDevuelto, { currency })}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold text-foreground">
                        <span>Neto cobrado</span>
                        <span className="font-mono tabular-nums">
                          {formatCurrency(Math.max(Number(venta.total) - totalDevuelto, 0), { currency })}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {propinaNum > 0 ? (
                    <div className="flex justify-between text-op-xs font-semibold text-primary pt-1">
                      <span>Total + propina</span>
                      <span className="font-mono tabular-nums">
                        {formatCurrency(Number(venta.total) + propinaNum, { currency })}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </details>
        </section>

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
                    <span className="ml-2 text-op-xs text-muted-foreground">
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
              <p className="mt-3 rounded-xl bg-warning-soft px-4 py-2.5 text-op-xs text-warning-soft-foreground">
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
          <section className="rounded-2xl border border-destructive/30 bg-destructive-soft p-6 shadow-sm">
            <h2 className="font-semibold text-destructive-soft-foreground">Venta cancelada</h2>
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
          <section className="rounded-2xl border border-success/30 bg-success-soft p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-success-soft-foreground">Venta cobrada con éxito</h2>
              <StatusBadge tone="success">Completada</StatusBadge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Venta cerrada — ya fue cobrada y no puede modificarse.
            </p>

            <TicketActionsBar
              clienteNombre={venta.clienteNombre}
              clienteTelefono={venta.clienteTelefono}
              currency={currency}
              descuento={venta.descuento}
              descuentoMembresia={venta.descuentoMembresia}
              descuentoPromocion={venta.descuentoPromocion}
              lineasMembresias={lineasMembresias}
              lineasPaquetes={lineasPaquetes}
              lineasProductos={lineasProductos}
              lineasServicios={lineasServicios}
              negocioNombre={negocioNombre}
              pagos={pagos}
              propina={venta.propina}
              subtotal={venta.subtotal}
              total={venta.total}
              ventaId={venta.id}
            />

            <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-success/20">
              {modo !== "inline" ? (
                <Link
                  className="inline-flex min-h-10 items-center rounded-xl border border-success/30 bg-card px-4 text-sm font-medium text-success hover:bg-success/5 transition-colors"
                  href={returnTo}
                >
                  ← Volver a Cobrar
                </Link>
              ) : null}
              {puedeCancelar ? (
                <CancelarVentaButton
                  currency={currency}
                  onChanged={onChanged}
                  organizationId={organizationId}
                  total={venta.total}
                  ventaId={venta.id}
                />
              ) : null}
            </div>
          </section>
        )}

        {editable ? (
          <details
            className="rounded-2xl border border-border/80 bg-card shadow-sm transition-all duration-200 hover:shadow-md"
            data-testid="pos-beneficios-details"
            open={tieneBeneficioActivo}
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-semibold text-foreground">
              Descuentos, promoción y membresía
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="divide-y divide-border/60 border-t border-border/60">
              <form action={descuentoAction} className="space-y-3 px-5 py-4">
                <input name="organizacionId" type="hidden" value={organizationId} />
                <input name="ventaId" type="hidden" value={venta.id} />
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Descuento</h2>
                  <span className="text-op-xs text-muted-foreground">Directo</span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Field className="w-32">
                    <FieldLabel className="text-op-xs">Monto ($)</FieldLabel>
                    <Input
                      className="font-mono"
                      defaultValue={venta.descuento}
                      key={venta.descuento}
                      min="0"
                      name="descuento"
                      step="0.01"
                      type="number"
                    />
                  </Field>
                  <Button
                    className="rounded-xl active:scale-95 transition-transform"
                    disabled={descuentoPending}
                    type="submit"
                    variant="outline"
                  >
                    {descuentoPending ? "Aplicando…" : "Aplicar"}
                  </Button>
                  <div aria-label="Descuento rápido" className="flex flex-wrap gap-1.5" role="group">
                    {[5, 10, 15, 20].map((pct) => (
                      <Button
                        className="min-h-11 rounded-xl border border-border/60 hover:border-primary/50 hover:bg-primary/5 text-primary text-op-xs font-semibold active:scale-90 transition-all duration-150 px-2.5"
                        disabled={descuentoPending}
                        key={pct}
                        onClick={() => aplicarPorcentaje(pct)}
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

              {promocionesDisponibles.length > 0 || venta.promocionId ? (
                <section className="space-y-3 px-5 py-4">
                  <h2 className="text-sm font-semibold text-foreground">Promoción</h2>
                  {venta.promocionId ? (
                    <form action={quitarPromoAction} className="flex items-center justify-between gap-3 rounded-xl border border-success/20 bg-success-soft p-3">
                      <input name="organizacionId" type="hidden" value={organizationId} />
                      <input name="ventaId" type="hidden" value={venta.id} />
                      <p className="min-w-0 flex-1 text-sm text-success-soft-foreground">
                        <span className="font-semibold">{venta.promocionNombre ?? "Aplicada"}</span>
                        <span className="ml-2 font-mono tabular-nums">-{formatCurrency(venta.descuentoPromocion ?? "0", { currency })}</span>
                      </p>
                      <Button
                        className="rounded-xl text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
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
                        className="rounded-xl active:scale-95 transition-transform"
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

              {Boolean(venta.clienteId) && (membresiasCliente.length > 0 || venta.membresiaId) ? (
                <section className="space-y-3 px-5 py-4">
                  <h2 className="text-sm font-semibold text-foreground">Membresía del cliente</h2>
                  {venta.membresiaId ? (
                    <form action={quitarMembresiaAction} className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/10 p-3">
                      <input name="organizacionId" type="hidden" value={organizationId} />
                      <input name="ventaId" type="hidden" value={venta.id} />
                      <p className="min-w-0 flex-1 text-sm text-primary">
                        <span className="font-semibold">{venta.membresiaNombre ?? "Aplicada"}</span>
                        <span className="ml-2 font-mono tabular-nums">-{formatCurrency(venta.descuentoMembresia ?? "0", { currency })}</span>
                      </p>
                      <Button
                        className="rounded-xl text-destructive hover:bg-destructive/10 active:scale-95 transition-all"
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
                        className="rounded-xl active:scale-95 transition-transform"
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
            </div>
          </details>
        ) : null}

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
                    <span className="text-op-xs text-muted-foreground">{dev.usuarioNombre ?? "—"}</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 text-op-xs text-muted-foreground">
                    {dev.lineas.map((linea, i) => (
                      <li key={i}>
                        {linea.nombre} × {linea.cantidad} · {formatCurrency(linea.monto, { currency })}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-op-xs text-muted-foreground">{dev.motivo}</p>
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
                        <span className="text-op-xs text-muted-foreground">
                          {" "}
                          · recibió {formatCurrency(pago.recibido, { currency })}, cambio{" "}
                          {formatCurrency(pago.cambio, { currency })}
                        </span>
                      ) : null}
                    </span>
                    <span className="tabular-nums">{formatCurrency(pago.monto, { currency })}</span>
                  </div>
                  {pago.ajustes.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-op-xs text-muted-foreground">
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
  currency,
  onChanged,
  organizationId,
  total,
  ventaId,
}: {
  currency: string;
  onChanged?: () => void;
  organizationId: string;
  total: string;
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

  return (
    <AlertDialog onOpenChange={setAbierto} open={abierto}>
      <AlertDialogTrigger className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10">
        Cancelar venta…
      </AlertDialogTrigger>
      <AlertDialogContent destructive>
        <form action={formAction} className="space-y-4">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="ventaId" type="hidden" value={ventaId} />
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              {`¿Cancelar venta de ${formatCurrency(total, { currency })}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se registrará la devolución del dinero en la caja, los productos
              regresarán al inventario y se anularán las propinas y comisiones
              de esta venta. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel required>Motivo</FieldLabel>
            <Input
              aria-label="Motivo de cancelación"
              maxLength={500}
              name="motivo"
              placeholder="Ej. cobro duplicado, error de captura"
              required
            />
          </Field>
          <ActionFeedback state={state} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending} type="button">
              No, volver
            </AlertDialogCancel>
            <Button className="min-h-11" disabled={pending} type="submit" variant="destructive">
              {pending ? "Cancelando…" : "Sí, cancelar venta"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
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
                  <p className="text-op-xs tabular-nums text-muted-foreground">
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
                  <span className="text-op-xs text-muted-foreground">devuelta</span>
                )}
              </li>
            );
          })}
        </ul>
        <Field>
          <FieldLabel className="text-op-xs">Motivo</FieldLabel>
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
        <p className="text-op-xs leading-4 text-muted-foreground">
          El descuento del ticket se prorratea en el monto devuelto; el stock de productos vuelve a inventario.
        </p>
      </form>
    </section>
  );
}
