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
      "min-h-10 rounded-lg border px-3.5 text-sm font-medium transition-colors",
      seleccionado
        ? "border-primary bg-accent/70 text-primary"
        : "border-border bg-card text-muted-foreground hover:border-accent-foreground/30 hover:text-primary",
    );

  const inputClass =
    "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30";

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
                "min-h-9 rounded-lg border px-3 text-xs font-medium transition-colors",
                propinaOpcion === opcion.value
                  ? "border-primary bg-accent/70 text-primary"
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
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-primary transition-colors hover:bg-accent/70"
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
          const requiereReferencia = medio ? medio.categoria !== "efectivo" : false;
          const resto = restoPara(index);
          return (
            <div
              className="space-y-2 rounded-xl border border-border p-3"
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
                  className="min-h-10 rounded-lg border border-border bg-card px-3 text-xs font-medium text-primary transition-colors hover:bg-accent/70 disabled:opacity-50"
                  disabled={resto <= 0}
                  onClick={() => updatePago(index, { monto: resto.toFixed(2) })}
                  type="button"
                >
                  Resto · {formatCurrency(resto)}
                </button>
                {pagos.length > 1 ? (
                  <button
                    aria-label={`Quitar pago ${index + 1}`}
                    className="flex size-10 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-muted/60"
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
          <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-medium text-success">
            {cambio > 0.005 ? `Cambio ${formatCurrency(cambio)}` : "Monto exacto"}
          </p>
        ) : (
          <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm font-medium text-warning">
            Falta {formatCurrency(faltante)}
          </p>
        )}
        {cubre && !pagosCompletos ? (
          <p className="mt-1.5 text-xs text-warning">
            Completa medio, monto y referencia de cada pago.
          </p>
        ) : null}
      </div>

      <ActionFeedback className="mt-3" state={state} />

      <Button
        className="mt-4 w-full rounded-xl"
        data-action-clave="1"
        data-action-id="pos.cobro.confirmar"
        disabled={!puedeCobrar}
        size="lg"
        type="submit"
      >
        {pending ? "Cobrando…" : cubiertoPorAnticipo ? (anticipo > 0 ? "Completar venta (anticipo)" : "Completar venta") : `Cobrar ${formatCurrency(aCubrir)}`}
      </Button>
    </form>
  );
}
