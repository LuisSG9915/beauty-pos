"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { cobrarVenta, type CobroActionState } from "@/app/admin/pos/actions";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";
import { formatCurrency } from "@/lib/format";
import { useClienteUuid } from "@/lib/use-cliente-uuid";
import { cn } from "@/lib/utils";

type MedioPago = { id: string; nombre: string; categoria: string };
type PagoRow = { medioPagoId: string; monto: string; referencia: string };

const MAX_PAGOS = 4;

const BILLETES_MXN = [50, 100, 200, 500, 1000] as const;

const PROPINA_OPCIONES = [
  { value: "0", label: "Sin propina" },
  { value: "10", label: "10%" },
  { value: "15", label: "15%" },
  { value: "20", label: "20%" },
  { value: "custom", label: "Otro" },
];

const redondear = (valor: number) => Math.round(valor * 100) / 100;

const pagoVacio = (medioPagoId = "", monto = ""): PagoRow => ({
  medioPagoId,
  monto,
  referencia: "",
});

/**
 * Cobro estilo Fresha: propina por atajos, pago dividido con chips por medio,
 * indicador en vivo de faltante/cambio y confirmación bloqueada hasta cubrir.
 *
 * Orden visual (norrhud): el encabezado del diálogo muestra el total; aquí va
 * propina → formas de pago → recibido → billetes → cambio → pie fijo.
 * El teclado numérico propio solo existe en md+ (columna derecha fija); en
 * teléfono se usa el teclado del sistema (`inputMode="decimal"`).
 */
export function CobroForm({
  organizationId,
  ventaId,
  mediosPago,
  total,
  anticipo = 0,
  returnTo,
  modo,
  onCobrada,
  enDialog = false,
  onClose,
  onPendingChange,
}: {
  organizationId: string;
  ventaId: string;
  mediosPago: MedioPago[];
  total: number;
  /** Anticipos vigentes que se aplicarán al cobrar (contra el total). */
  anticipo?: number;
  returnTo: string;
  modo?: "inline";
  onCobrada?: () => void;
  /** Si se renderiza dentro de un <Dialog>, se oculta el CTA pegado y se expone `onClose`. */
  enDialog?: boolean;
  /** Cerrar el diálogo contenedor (botón "Volver"). */
  onClose?: () => void;
  /** Avisa al diálogo si el cobro está en curso para bloquear el cierre (Esc, clic fuera, X). */
  onPendingChange?: (pending: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState<CobroActionState, FormData>(
    cobrarVenta,
    initialActionState as CobroActionState,
  );
  const medioInicial = mediosPago.find((m) => m.categoria === "efectivo") ?? mediosPago[0];
  const [pagos, setPagos] = useState<PagoRow[]>([
    pagoVacio(medioInicial?.id ?? "", Math.max(redondear(total - anticipo), 0).toFixed(2)),
  ]);
  const [propinaOpcion, setPropinaOpcion] = useState("0");
  const [propinaOtro, setPropinaOtro] = useState("");
  const [pagoActivo, setPagoActivo] = useState(0);
  // Rastrea si la fila ya empezó a sumar billetes por toque: mientras el
  // monto es el prellenado automático (exacto o resto), el primer billete
  // reemplaza; a partir de ahí cada toque suma.
  const acumuloBilletesPorPago = useRef<Record<number, boolean>>({});
  // Una clave por instancia del formulario: si el request se repite (doble
  // click, retry de red) el servidor devuelve el cobro original sin duplicar.
  const [idempotencia] = useClienteUuid();

  const medioPorId = useMemo(() => new Map(mediosPago.map((m) => [m.id, m])), [mediosPago]);

  const propina = useMemo(() => {
    if (propinaOpcion === "custom") {
      return Math.max(0, redondear(Number(propinaOtro) || 0));
    }
    const pct = Number(propinaOpcion);
    return pct > 0 ? redondear((total * pct) / 100) : 0;
  }, [propinaOpcion, propinaOtro, total]);

  // El anticipo descuenta el total de la venta; la propina siempre se cobra.
  const aCubrir = Math.max(redondear(total - anticipo + propina), 0);
  const recibido = redondear(
    pagos.reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0),
  );
  const cubiertoPorAnticipo = aCubrir <= 0.005;
  const cubre = cubiertoPorAnticipo || recibido >= aCubrir - 0.005;
  const faltante = Math.max(redondear(aCubrir - recibido), 0);
  const cambio = cubre && !cubiertoPorAnticipo ? redondear(recibido - aCubrir) : 0;

  const pagosCompletos = pagos.every((pago) => {
    const medio = medioPorId.get(pago.medioPagoId);
    return Boolean(medio && Number(pago.monto) > 0);
  });
  const puedeCobrar = !pending && cubre && (cubiertoPorAnticipo || pagosCompletos) && (cubiertoPorAnticipo || aCubrir > 0);

  const pagosPayload = cubiertoPorAnticipo
    ? "[]"
    : JSON.stringify(
        pagos.map((pago) => ({
          medioPagoId: pago.medioPagoId,
          monto: Number(pago.monto) || 0,
          referencia: pago.referencia.trim(),
        })),
      );

  // Cobro inline (sheet de agenda): la action devuelve el resultado en vez de
  // redirigir; aquí se avisa al padre para cerrar el sheet.
  const handledState = useRef<CobroActionState | null>(null);
  useEffect(() => {
    if (modo !== "inline" || !state.success || handledState.current === state) return;
    handledState.current = state;
    onCobrada?.();
  }, [modo, onCobrada, state]);

  // Esc/clic fuera los maneja el Dialog (Base UI) y pasan por onOpenChange:
  // el padre veta el cierre mientras `pending` está activo. Aquí solo se
  // reporta el estado para esa guarda.
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const updatePago = (index: number, patch: Partial<PagoRow>) =>
    setPagos((current) =>
      current.map((pago, i) => (i === index ? { ...pago, ...patch } : pago)),
    );

  const quitarPago = (index: number) => {
    // Los índices se recorren al quitar la fila: se limpian las marcas para
    // que ningún pago herede el estado de acumulación de otro.
    acumuloBilletesPorPago.current = {};
    setPagos((current) => current.filter((_, i) => i !== index));
  };

  const restoPara = (index: number) =>
    Math.max(
      redondear(
        aCubrir -
          pagos.reduce((sum, pago, i) => (i === index ? sum : sum + (Number(pago.monto) || 0)), 0),
      ),
      0,
    );

  const agregarPago = () =>
    setPagos((current) =>
      current.length >= MAX_PAGOS
        ? current
        : [...current, pagoVacio("", faltante > 0 ? faltante.toFixed(2) : "")],
    );

  // Si un solo pago cubre exactamente el total anterior, lo reajusta cuando
  // cambia el total o la propina para que el atajo siga siendo de un toque.
  const prevACubrir = useRef(aCubrir);
  useEffect(() => {
    const previo = prevACubrir.current;
    prevACubrir.current = aCubrir;
    if (previo === aCubrir) return;
    setPagos((current) => {
      if (current.length !== 1) return current;
      if (Math.abs((Number(current[0].monto) || 0) - previo) >= 0.005) return current;
      acumuloBilletesPorPago.current[0] = false;
      return [{ ...current[0], monto: aCubrir.toFixed(2) }];
    });
  }, [aCubrir]);

  const seleccionarPropina = (opcion: string) => {
    setPropinaOpcion(opcion);
  };

  const chipPagoClass = (seleccionado: boolean) =>
    cn(
      "min-h-11 rounded-xl border px-3.5 text-op-xs font-medium transition-all duration-150 active:scale-[0.98] cursor-pointer select-none",
      seleccionado
        ? "border-primary bg-accent/80 text-primary font-semibold ring-2 ring-primary/20 shadow-xs"
        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
    );

  const inputClass =
    "h-11 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition-all duration-150 focus:border-primary focus:ring-3 focus:ring-primary/20 hover:border-border";

  const tocarBillete = (index: number, denom: number) => {
    const yaAcumulando = acumuloBilletesPorPago.current[index] === true;
    acumuloBilletesPorPago.current[index] = true;
    setPagos((current) =>
      current.map((pago, i) =>
        i === index
          ? {
              ...pago,
              monto: (yaAcumulando
                ? redondear((Number(pago.monto) || 0) + denom)
                : denom
              ).toFixed(2),
            }
          : pago,
      ),
    );
  };

  const fijarMontoExacto = (index: number) => {
    acumuloBilletesPorPago.current[index] = false;
    updatePago(index, { monto: aCubrir.toFixed(2) });
  };

  const borrarMonto = (index: number) => {
    acumuloBilletesPorPago.current[index] = true;
    updatePago(index, { monto: "0" });
  };

  // Teclado numérico (solo md+): opera sobre el pago activo.
  const agregarDigito = (index: number, digito: string) => {
    const montoActual = pagos[index].monto;
    const nuevoMonto = montoActual === "0" || montoActual === "" ? digito : montoActual + digito;
    acumuloBilletesPorPago.current[index] = true;
    updatePago(index, { monto: nuevoMonto });
  };

  const agregarDecimal = (index: number) => {
    const montoActual = pagos[index].monto;
    if (!montoActual.includes(".")) {
      acumuloBilletesPorPago.current[index] = true;
      updatePago(index, { monto: montoActual === "" || montoActual === "0" ? "0." : montoActual + "." });
    }
  };

  const borrarDigito = (index: number) => {
    const montoActual = pagos[index].monto;
    const nuevoMonto = montoActual.length > 1 ? montoActual.slice(0, -1) : "0";
    acumuloBilletesPorPago.current[index] = true;
    updatePago(index, { monto: nuevoMonto });
  };

  const botonNumpadClass =
    "min-h-12 rounded-xl border border-border bg-card flex items-center justify-center text-sm font-semibold tabular-nums text-muted-foreground transition-all duration-150 active:scale-[0.95] cursor-pointer select-none hover:border-primary/50 hover:text-primary";

  const botonBorrarClass =
    "min-h-12 rounded-xl border border-border bg-card flex items-center justify-center text-sm font-semibold text-destructive transition-all duration-150 active:scale-[0.95] cursor-pointer select-none hover:bg-destructive-soft";

  const botonBilleteClass =
    "inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-2.5 text-op-xs font-semibold tabular-nums text-muted-foreground transition-all duration-150 active:scale-[0.98] cursor-pointer select-none hover:border-primary/50 hover:text-foreground";

  const mostrarTeclado = !cubiertoPorAnticipo && mediosPago.length > 0;

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="ventaId" type="hidden" value={ventaId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      {modo === "inline" ? <input name="modo" type="hidden" value="inline" /> : null}
      <input name="pagos" type="hidden" value={pagosPayload} />
      <input name="propina" type="hidden" value={propina.toFixed(2)} />
      <input name="idempotencia" type="hidden" value={idempotencia} />
      <input name="idempotencyKey" type="hidden" value={idempotencia} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Flujo principal con scroll propio; el teclado y el pie quedan fijos. */}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {/* Desglose solo cuando el cargo difiere del total del encabezado. */}
          {anticipo > 0 || propina > 0 ? (
            <p className="text-op-xs tabular-nums text-muted-foreground">
              {formatCurrency(total)}
              {anticipo > 0 ? ` − ${formatCurrency(anticipo)} anticipo` : ""}
              {propina > 0 ? ` + ${formatCurrency(propina)} propina` : ""}
              {" = "}
              <span className="font-semibold text-foreground">
                a cobrar {formatCurrency(aCubrir)}
              </span>
            </p>
          ) : null}

          <div className="mt-4">
            <p className="text-op-xs font-medium text-muted-foreground">Propina</p>
            <div aria-label="Propina" className="mt-1.5 flex flex-wrap gap-1.5" role="group">
              {PROPINA_OPCIONES.map((opcion) => (
                <button
                  aria-pressed={propinaOpcion === opcion.value}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 text-op-xs font-medium transition-all duration-150 active:scale-[0.98] cursor-pointer",
                    propinaOpcion === opcion.value
                      ? "border-primary bg-accent/70 text-primary font-semibold ring-2 ring-primary/20 shadow-xs"
                      : "border-border bg-card text-muted-foreground hover:border-accent-foreground/30 hover:text-primary",
                  )}
                  data-action-id="pos.cobro.propina"
                  key={opcion.value}
                  onClick={() => seleccionarPropina(opcion.value)}
                  type="button"
                >
                  {opcion.label}
                </button>
              ))}
            </div>
            {propinaOpcion === "custom" ? (
              <div className="mt-2 w-36">
                <label className="sr-only" htmlFor="propina-otra">
                  Monto de propina
                </label>
                <input
                  aria-label="Monto de propina"
                  className={cn(inputClass, "tabular-nums")}
                  id="propina-otra"
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => setPropinaOtro(event.target.value)}
                  placeholder="Monto"
                  step="0.01"
                  type="number"
                  value={propinaOtro}
                />
              </div>
            ) : null}
          </div>

          {cubiertoPorAnticipo ? (
            <p className="mt-5 rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success-soft-foreground">
              {anticipo > 0
                ? `El anticipo cubre el total${propina > 0 ? " y la propina" : ""}; confirma para cerrar la venta.`
                : "El total ya está cubierto; confirma para cerrar la venta."}
            </p>
          ) : null}

          <div className={cubiertoPorAnticipo ? "hidden" : "mt-5 space-y-3"}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-op-xs font-medium text-muted-foreground">
                Formas de pago{pagos.length > 1 ? ` (${pagos.length})` : ""}
              </p>
              {pagos.length < MAX_PAGOS && mediosPago.length > 0 ? (
                <button
                  aria-label="Pagar con otra forma"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-op-xs font-medium text-primary transition-colors hover:bg-accent/70 cursor-pointer active:scale-[0.98]"
                  data-action-id="pos.cobro.agregar_pago"
                  onClick={agregarPago}
                  type="button"
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Pagar con otra forma
                </button>
              ) : null}
            </div>

            {mediosPago.length === 0 ? (
              <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
                No hay medios de pago configurados.
              </p>
            ) : null}

            {pagos.map((pago, index) => {
              const medio = medioPorId.get(pago.medioPagoId);
              const esEfectivo = medio ? medio.categoria === "efectivo" : false;
              const requiereReferencia = medio ? !esEfectivo : false;
              const resto = restoPara(index);
              return (
                <div
                  className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-3.5 shadow-xs"
                  key={`pago-${index}`}
                >
                  <div
                    aria-label={`Forma de pago ${index + 1}`}
                    className="flex flex-wrap gap-1.5"
                    role="group"
                  >
                    {mediosPago.map((item) => (
                      <button
                        aria-pressed={pago.medioPagoId === item.id}
                        className={chipPagoClass(pago.medioPagoId === item.id)}
                        data-action-id="pos.cobro.medio_pago"
                        key={item.id}
                        onClick={() => {
                          setPagoActivo(index);
                          updatePago(index, { medioPagoId: item.id });
                        }}
                        type="button"
                      >
                        {item.nombre}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="text-op-xs font-medium text-muted-foreground"
                      htmlFor={`cobro-monto-${index}`}
                    >
                      Recibido{pagos.length > 1 ? ` · pago ${index + 1}` : ""}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className={cn(
                          inputClass,
                          "h-12 min-h-12 min-w-32 flex-1 basis-36 text-base font-semibold tabular-nums",
                        )}
                        id={`cobro-monto-${index}`}
                        inputMode="decimal"
                        min="0"
                        onChange={(event) => {
                          setPagoActivo(index);
                          // Edición manual: el siguiente billete suma sobre lo escrito.
                          acumuloBilletesPorPago.current[index] = true;
                          updatePago(index, { monto: event.target.value });
                        }}
                        placeholder="0.00"
                        step="0.01"
                        type="number"
                        value={pago.monto}
                      />
                      <button
                        aria-label={`Cubrir lo que falta: ${formatCurrency(resto)}`}
                        className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-3 text-op-xs font-medium text-primary transition-all hover:bg-accent/70 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                        disabled={resto <= 0}
                        onClick={() => {
                          setPagoActivo(index);
                          // Monto autocompletado: el primer billete reemplaza.
                          acumuloBilletesPorPago.current[index] = false;
                          updatePago(index, { monto: resto.toFixed(2) });
                        }}
                        type="button"
                      >
                        Lo que falta · {formatCurrency(resto)}
                      </button>
                      <button
                        aria-label={`Borrar monto del pago ${index + 1}`}
                        className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-3 text-op-xs font-medium text-destructive transition-all hover:bg-destructive-soft active:scale-[0.98] cursor-pointer"
                        data-action-id="pos.cobro.monto_borrar"
                        onClick={() => {
                          setPagoActivo(index);
                          borrarMonto(index);
                        }}
                        type="button"
                      >
                        Borrar
                      </button>
                      {pagos.length > 1 ? (
                        <button
                          aria-label={`Quitar pago ${index + 1}`}
                          className="flex size-11 min-h-11 min-w-11 items-center justify-center rounded-xl text-destructive transition-all hover:bg-destructive-soft active:scale-[0.98] cursor-pointer"
                          onClick={() => quitarPago(index)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {esEfectivo ? (
                    <div
                      aria-label={`Billetes y monedas para el pago ${index + 1}`}
                      className="flex flex-wrap items-center gap-1.5"
                      role="group"
                    >
                      <button
                        className={botonBilleteClass}
                        data-action-id="pos.cobro.billete_exacto"
                        onClick={() => {
                          setPagoActivo(index);
                          fijarMontoExacto(index);
                        }}
                        type="button"
                      >
                        Exacto · {formatCurrency(aCubrir)}
                      </button>
                      {BILLETES_MXN.map((denom) => (
                        <button
                          aria-label={`Sumar ${formatCurrency(denom)} al pago ${index + 1}`}
                          className={botonBilleteClass}
                          data-action-id="pos.cobro.billete_rapido"
                          key={denom}
                          onClick={() => {
                            setPagoActivo(index);
                            tocarBillete(index, denom);
                          }}
                          type="button"
                        >
                          +${denom.toLocaleString("es-MX")}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {requiereReferencia && medio ? (
                    <div className="space-y-1.5">
                      <label
                        className="text-op-xs font-medium text-muted-foreground"
                        htmlFor={`cobro-referencia-${index}`}
                      >
                        Referencia (opcional)
                      </label>
                      <input
                        className={inputClass}
                        id={`cobro-referencia-${index}`}
                        onChange={(event) =>
                          updatePago(index, { referencia: event.target.value })
                        }
                        placeholder={`Autorización de ${medio.nombre}`}
                        type="text"
                        value={pago.referencia}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div aria-live="polite" className="mt-4">
            {cubiertoPorAnticipo ? null : cubre ? (
              <div
                className={cn(
                  "rounded-2xl border p-3.5 anim-entrada",
                  cambio > 0.005
                    ? "border-success/40 bg-success-soft text-success-soft-foreground shadow-xs"
                    : "border-success/30 bg-success-soft text-success-soft-foreground",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-op-xs font-medium">
                    {cambio > 0.005 ? "Cambio a entregar" : "Monto cubierto"}
                  </span>
                  <span className="text-lg font-extrabold tabular-nums">
                    {cambio > 0.005 ? formatCurrency(cambio) : "Monto exacto"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-warning/40 bg-warning-soft p-3.5 text-warning-soft-foreground shadow-xs anim-entrada">
                <div className="flex items-center justify-between">
                  <span className="text-op-xs font-medium">Lo que falta</span>
                  <span className="text-lg font-extrabold tabular-nums">{formatCurrency(faltante)}</span>
                </div>
              </div>
            )}
            {cubre && !pagosCompletos ? (
              <p className="mt-2 text-op-xs font-medium text-warning anim-entrada">
                Completa el medio y monto de cada pago.
              </p>
            ) : null}
          </div>
        </div>

        {/* Teclado numérico: solo en md+ (columna fija a la derecha del flujo).
            En teléfono se usa el teclado del sistema (inputMode="decimal"). */}
        {mostrarTeclado ? (
          <div
            className="hidden w-44 shrink-0 flex-col gap-2 border-l border-border/60 py-1 pl-5 pr-1 md:flex"
            data-action-id="pos.cobro.teclado"
          >
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="text-op-xs font-medium text-muted-foreground">
                Teclado · pago {pagoActivo + 1} de {pagos.length}
              </span>
              <span className="flex items-center">
                <button
                  aria-label="Seleccionar pago anterior"
                  className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-op-xs transition-colors hover:bg-muted disabled:opacity-40"
                  disabled={pagoActivo === 0 || pagos.length <= 1}
                  onClick={() => setPagoActivo((p) => Math.max(p - 1, 0))}
                  type="button"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  aria-label="Seleccionar pago siguiente"
                  className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-op-xs transition-colors hover:bg-muted disabled:opacity-40"
                  disabled={pagoActivo === pagos.length - 1 || pagos.length <= 1}
                  onClick={() => setPagoActivo((p) => Math.min(p + 1, pagos.length - 1))}
                  type="button"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[...Array(9).keys()].map((i) => (
                <button
                  key={i + 1}
                  aria-label={`Dígito ${i + 1}`}
                  className={botonNumpadClass}
                  onClick={() => agregarDigito(pagoActivo, String(i + 1))}
                  type="button"
                >
                  {i + 1}
                </button>
              ))}
              <button
                aria-label="Punto decimal"
                className={botonNumpadClass}
                onClick={() => agregarDecimal(pagoActivo)}
                type="button"
              >
                .
              </button>
              <button
                aria-label="Dígito 0"
                className={botonNumpadClass}
                onClick={() => agregarDigito(pagoActivo, "0")}
                type="button"
              >
                0
              </button>
              <button
                aria-label="Borrar último dígito"
                className={botonBorrarClass}
                onClick={() => borrarDigito(pagoActivo)}
                type="button"
              >
                <ArrowLeft className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Pie fijo: siempre visible sin importar el scroll del flujo. */}
      <div className="-mx-6 -mb-6 mt-3 flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-card px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <ActionFeedback className="order-first basis-full" state={state} />
        {enDialog ? (
          <Button
            type="button"
            onClick={onClose}
            disabled={pending}
            variant="outline"
          >
            Volver
            <span className="hidden any-pointer-fine:inline">(Esc)</span>
          </Button>
        ) : null}
        <Button
          className={cn(
            "rounded-2xl font-bold shadow-sm transition-all duration-200 active:scale-[0.98]",
            puedeCobrar && "bg-primary text-primary-foreground hover:brightness-105 hover:shadow-md",
          )}
          data-action-clave="1"
          data-action-id="pos.cobro.confirmar"
          disabled={!puedeCobrar}
          size="lg"
          type="submit"
        >
          {pending ? "Procesando cobro…" : cubiertoPorAnticipo ? (anticipo > 0 ? "Completar venta (anticipo)" : "Completar venta") : `Cobrar ${formatCurrency(aCubrir)}`}
        </Button>
      </div>
    </form>
  );
}
