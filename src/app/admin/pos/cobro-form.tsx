"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { cobrarVenta, type CobroActionState } from "@/app/admin/pos/actions";
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type MedioPago = { id: string; nombre: string; categoria: string };
type PagoRow = { medioPagoId: string; monto: string; referencia: string };

const MAX_PAGOS = 4;

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
  // Una clave por instancia del formulario: si el request se repite (doble
  // click, retry de red) el servidor devuelve el cobro original sin duplicar.
  const [idempotencia] = useState(() => crypto.randomUUID());

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
    if (!medio || !(Number(pago.monto) > 0)) return false;
    return medio.categoria === "efectivo" || pago.referencia.trim().length > 0;
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

  const updatePago = (index: number, patch: Partial<PagoRow>) =>
    setPagos((current) =>
      current.map((pago, i) => (i === index ? { ...pago, ...patch } : pago)),
    );

  const quitarPago = (index: number) =>
    setPagos((current) => current.filter((_, i) => i !== index));

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
      return [{ ...current[0], monto: aCubrir.toFixed(2) }];
    });
  }, [aCubrir]);

  const seleccionarPropina = (opcion: string) => {
    setPropinaOpcion(opcion);
  };

  const chipPagoClass = (seleccionado: boolean) =>
    cn(
      "min-h-10 rounded-xl border px-3.5 text-xs font-medium transition-all duration-150 active:scale-95 cursor-pointer select-none",
      seleccionado
        ? "border-primary bg-accent/80 text-primary font-semibold ring-2 ring-primary/20 shadow-xs"
        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
    );

  const inputClass =
    "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition-all duration-150 focus:border-primary focus:ring-3 focus:ring-primary/20 hover:border-border";

  const quickCashOptions = useMemo(() => {
    if (aCubrir <= 0) return [];
    const set = new Set<number>();
    set.add(aCubrir);
    const commonBills = [50, 100, 200, 500, 1000];
    for (const b of commonBills) {
      if (b > aCubrir) set.add(b);
      else if (aCubrir > b) {
        const nextMultiple = Math.ceil(aCubrir / b) * b;
        if (nextMultiple > aCubrir) set.add(nextMultiple);
      }
    }
    return [...set].sort((a, b) => a - b).slice(0, 4);
  }, [aCubrir]);

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
    >
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="ventaId" type="hidden" value={ventaId} />
      <input name="returnTo" type="hidden" value={returnTo} />
      {modo === "inline" ? <input name="modo" type="hidden" value="inline" /> : null}
      <input name="pagos" type="hidden" value={pagosPayload} />
      <input name="propina" type="hidden" value={propina.toFixed(2)} />
      <input name="idempotencia" type="hidden" value={idempotencia} />

      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-foreground">Cobrar</h2>
        <p className="text-2xl font-bold tabular-nums text-primary">
          {formatCurrency(aCubrir)}
        </p>
      </div>
      {propina > 0 || anticipo > 0 ? (
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {formatCurrency(total)}
          {anticipo > 0 ? ` − ${formatCurrency(anticipo)} anticipo` : ""}
          {propina > 0 ? ` + ${formatCurrency(propina)} propina` : ""}
        </p>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">Propina</p>
        <div aria-label="Propina" className="mt-1.5 flex flex-wrap gap-1.5" role="group">
          {PROPINA_OPCIONES.map((opcion) => (
            <button
              aria-pressed={propinaOpcion === opcion.value}
              className={cn(
                "min-h-9 rounded-xl border px-3 text-xs font-medium transition-all duration-150 active:scale-95 cursor-pointer",
                propinaOpcion === opcion.value
                  ? "border-primary bg-accent/70 text-primary font-semibold ring-2 ring-primary/20 shadow-xs"
                  : "border-border bg-card text-muted-foreground hover:border-accent-foreground/30 hover:text-primary",
              )}
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
        <p className="mt-5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success">
          {anticipo > 0
            ? `El anticipo cubre el total${propina > 0 ? " y la propina" : ""}; confirma para cerrar la venta.`
            : "El total ya está cubierto; confirma para cerrar la venta."}
        </p>
      ) : null}

      <div className={cubiertoPorAnticipo ? "hidden" : "mt-5 space-y-3"}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Pagos{pagos.length > 1 ? ` (${pagos.length})` : ""}
          </p>
          {pagos.length < MAX_PAGOS && mediosPago.length > 0 ? (
            <button
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-accent/70 cursor-pointer active:scale-95"
              onClick={agregarPago}
              type="button"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Agregar otro pago
            </button>
          ) : null}
        </div>

        {mediosPago.length === 0 ? (
          <p className="rounded-xl bg-warning/10 px-4 py-3 text-sm text-warning">
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
              className="space-y-2.5 rounded-2xl border border-border/80 bg-muted/20 p-3.5 shadow-xs"
              key={`pago-${index}`}
            >
              <div
                aria-label={`Medio del pago ${index + 1}`}
                className="flex flex-wrap gap-1.5"
                role="group"
              >
                {mediosPago.map((item) => (
                  <button
                    aria-pressed={pago.medioPagoId === item.id}
                    className={chipPagoClass(pago.medioPagoId === item.id)}
                    key={item.id}
                    onClick={() => updatePago(index, { medioPagoId: item.id })}
                    type="button"
                  >
                    {item.nombre}
                  </button>
                ))}
              </div>

              {esEfectivo && quickCashOptions.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Billetes rápidos:</span>
                  {quickCashOptions.map((opt) => (
                    <button
                      className={cn(
                        "inline-flex min-h-7 items-center rounded-lg border px-2.5 text-xs font-semibold tabular-nums transition-all duration-150 active:scale-95 cursor-pointer select-none",
                        Math.abs((Number(pago.monto) || 0) - opt) < 0.005
                          ? "border-primary bg-primary text-primary-foreground shadow-xs"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                      key={opt}
                      onClick={() => updatePago(index, { monto: opt.toFixed(2) })}
                      type="button"
                    >
                      {opt === aCubrir ? `Exacto (${formatCurrency(opt)})` : formatCurrency(opt)}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Monto del pago ${index + 1}`}
                  className={cn(inputClass, "min-w-0 flex-1 basis-32 tabular-nums")}
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => updatePago(index, { monto: event.target.value })}
                  placeholder="Monto"
                  step="0.01"
                  type="number"
                  value={pago.monto}
                />
                <button
                  className="min-h-10 rounded-xl border border-border bg-card px-3 text-xs font-medium text-primary transition-all hover:bg-accent/70 active:scale-95 disabled:opacity-50 cursor-pointer"
                  disabled={resto <= 0}
                  onClick={() => updatePago(index, { monto: resto.toFixed(2) })}
                  type="button"
                >
                  Resto · {formatCurrency(resto)}
                </button>
                {pagos.length > 1 ? (
                  <button
                    aria-label={`Quitar pago ${index + 1}`}
                    className="flex size-10 items-center justify-center rounded-xl text-destructive transition-all hover:bg-destructive-soft active:scale-90 cursor-pointer"
                    onClick={() => quitarPago(index)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                ) : null}
              </div>
              {requiereReferencia && medio ? (
                <input
                  aria-label={`Referencia del pago ${index + 1}`}
                  className={inputClass}
                  onChange={(event) =>
                    updatePago(index, { referencia: event.target.value })
                  }
                  placeholder={`Referencia de ${medio.nombre} (folio o autorización)`}
                  type="text"
                  value={pago.referencia}
                />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        {cubiertoPorAnticipo ? null : cubre ? (
          <div
            className={cn(
              "rounded-2xl border p-3.5 transition-all duration-200 animate-in fade-in zoom-in-95",
              cambio > 0.005
                ? "border-success/40 bg-success-soft/70 text-success-soft-foreground shadow-xs"
                : "border-success/30 bg-success/10 text-success",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">
                {cambio > 0.005 ? "Cambio a entregar" : "Monto cubierto"}
              </span>
              <span className="text-lg font-extrabold tabular-nums">
                {cambio > 0.005 ? formatCurrency(cambio) : "Monto exacto"}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-warning/40 bg-warning-soft/70 p-3.5 text-warning-soft-foreground shadow-xs animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider">Falta por cubrir</span>
              <span className="text-lg font-extrabold tabular-nums">{formatCurrency(faltante)}</span>
            </div>
          </div>
        )}
        {cubre && !pagosCompletos ? (
          <p className="mt-2 text-xs font-medium text-warning animate-in fade-in">
            Completa medio, monto y referencia de cada pago.
          </p>
        ) : null}
      </div>

      <ActionFeedback className="mt-3" state={state} />

      <Button
        className={cn(
          "mt-4 w-full rounded-2xl font-bold shadow-sm transition-all duration-200 active:scale-[0.98]",
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
    </form>
  );
}
