"use client";

import { useActionState, useRef, useState } from "react";
import { Banknote, Calculator, ChevronDown, ChevronUp, Coins, CreditCard, ShieldCheck } from "lucide-react";

import { cerrarCaja, type CajaActionState } from "@/app/admin/caja/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";

const initialState: CajaActionState = {};

type MedioPago = { id: string; nombre: string; categoria: string };

const DENOMINACIONES_BILLETES = [1000, 500, 200, 100, 50, 20];
const DENOMINACIONES_MONEDAS = [20, 10, 5, 2, 1, 0.5];

/**
 * Conteo ciego: muestra un input por medio de pago sin revelar lo que el
 * sistema espera. Incluye un desglosador interactivo de billetes y monedas
 * para contar el efectivo con máxima precisión y rapidez.
 */
export function CierreCajaForm({
  corteId,
  medios,
  organizationId,
}: {
  corteId: string;
  medios: MedioPago[];
  organizationId: string;
}) {
  const [state, formAction, pending] = useActionState(cerrarCaja, initialState);
  const conteosRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const efectivoMedio = medios.find((m) => m.categoria === "efectivo") || medios[0];
  const otrosMedios = medios.filter((m) => m.id !== efectivoMedio?.id);

  const [mostrarDesglose, setMostrarDesglose] = useState(false);
  const [cantidadesBilletes, setCantidadesBilletes] = useState<Record<number, number>>({});
  const [cantidadesMonedas, setCantidadesMonedas] = useState<Record<number, number>>({});
  const [montoEfectivoManual, setMontoEfectivoManual] = useState<string>("");

  const totalBilletes = DENOMINACIONES_BILLETES.reduce(
    (sum, d) => sum + d * (cantidadesBilletes[d] || 0),
    0
  );
  const totalMonedas = DENOMINACIONES_MONEDAS.reduce(
    (sum, d) => sum + d * (cantidadesMonedas[d] || 0),
    0
  );
  const totalDesglose = totalBilletes + totalMonedas;

  const aplicarDesgloseAEfectivo = (nuevoTotal: number) => {
    setMontoEfectivoManual(nuevoTotal > 0 ? nuevoTotal.toFixed(2) : "");
  };

  const actualizarBillete = (denominacion: number, valStr: string) => {
    const qty = Math.max(0, parseInt(valStr, 10) || 0);
    const updated = { ...cantidadesBilletes, [denominacion]: qty };
    setCantidadesBilletes(updated);
    const sumB = DENOMINACIONES_BILLETES.reduce((s, d) => s + d * (updated[d] || 0), 0);
    aplicarDesgloseAEfectivo(sumB + totalMonedas);
  };

  const actualizarMoneda = (denominacion: number, valStr: string) => {
    const qty = Math.max(0, parseInt(valStr, 10) || 0);
    const updated = { ...cantidadesMonedas, [denominacion]: qty };
    setCantidadesMonedas(updated);
    const sumM = DENOMINACIONES_MONEDAS.reduce((s, d) => s + d * (updated[d] || 0), 0);
    aplicarDesgloseAEfectivo(totalBilletes + sumM);
  };

  const limpiarDesglose = () => {
    setCantidadesBilletes({});
    setCantidadesMonedas({});
    setMontoEfectivoManual("");
  };

  return (
    <form
      action={formAction}
      className="space-y-5"
      onSubmit={() => {
        const data = new FormData(formRef.current ?? undefined);
        const conteos: Record<string, number> = {};
        for (const medio of medios) {
          conteos[medio.id] = Number(data.get(`contado_${medio.id}`) ?? 0) || 0;
        }
        if (conteosRef.current) conteosRef.current.value = JSON.stringify(conteos);
      }}
      ref={formRef}
    >
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="corteId" type="hidden" value={corteId} />
      <input name="conteos" ref={conteosRef} type="hidden" value="{}" />

      <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
        <ShieldCheck className="size-5 shrink-0 text-primary mt-0.5" />
        <div className="space-y-1 text-xs sm:text-sm">
          <p className="font-semibold text-foreground">Arqueo Ciego de Seguridad</p>
          <p className="text-muted-foreground leading-relaxed">
            Cuenta el dinero físico y los vouchers de tus terminales bancarias sin ver los números esperados por el sistema.
            Al confirmar, el sistema contrastará el dinero con las ventas y movimientos del turno para calcular si la caja está cuadrada o si existe sobrante o faltante.
          </p>
        </div>
      </div>

      {efectivoMedio ? (
        <Field className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Banknote className="size-5 text-success" />
              <FieldLabel className="text-base font-semibold text-foreground" required>
                {efectivoMedio.nombre} (Total contado)
              </FieldLabel>
            </div>
            <button
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline self-start sm:self-auto cursor-pointer"
              onClick={() => setMostrarDesglose(!mostrarDesglose)}
              type="button"
            >
              <Calculator className="size-3.5" />
              {mostrarDesglose ? "Ocultar desglosador" : "Abrir conteo por billetes y monedas"}
              {mostrarDesglose ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>

          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-muted-foreground">$</span>
            <Input
              className="pl-7 text-lg font-semibold tabular-nums"
              inputMode="decimal"
              min="0"
              name={`contado_${efectivoMedio.id}`}
              onChange={(e) => setMontoEfectivoManual(e.target.value)}
              placeholder="0.00"
              required
              step="0.01"
              type="number"
              value={montoEfectivoManual}
            />
          </div>

          {mostrarDesglose ? (
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Desglose de efectivo
                </span>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={limpiarDesglose}
                  type="button"
                >
                  Reiniciar conteo
                </button>
              </div>

              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-2">
                  <Banknote className="size-3.5 text-success" />
                  Billetes (Subtotal: ${totalBilletes.toLocaleString("es-MX", { minimumFractionDigits: 2 })})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DENOMINACIONES_BILLETES.map((denom) => (
                    <div
                      className="flex items-center justify-between gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5"
                      key={denom}
                    >
                      <span className="text-xs font-semibold text-foreground tabular-nums">${denom}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">×</span>
                        <input
                          aria-label={`Cantidad de billetes de $${denom}`}
                          className="w-14 rounded-md border border-input bg-background px-2 py-1 text-right text-xs font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                          inputMode="numeric"
                          min="0"
                          onChange={(e) => actualizarBillete(denom, e.target.value)}
                          placeholder="0"
                          type="number"
                          value={cantidadesBilletes[denom] || ""}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-2">
                  <Coins className="size-3.5 text-amber-500" />
                  Monedas (Subtotal: ${totalMonedas.toLocaleString("es-MX", { minimumFractionDigits: 2 })})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DENOMINACIONES_MONEDAS.map((denom) => (
                    <div
                      className="flex items-center justify-between gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5"
                      key={denom}
                    >
                      <span className="text-xs font-semibold text-foreground tabular-nums">${denom.toFixed(denom < 1 ? 2 : 0)}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">×</span>
                        <input
                          aria-label={`Cantidad de monedas de $${denom}`}
                          className="w-14 rounded-md border border-input bg-background px-2 py-1 text-right text-xs font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-primary"
                          inputMode="numeric"
                          min="0"
                          onChange={(e) => actualizarMoneda(denom, e.target.value)}
                          placeholder="0"
                          type="number"
                          value={cantidadesMonedas[denom] || ""}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                <span className="font-medium text-muted-foreground">Total desglosado:</span>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  ${totalDesglose.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          ) : null}
        </Field>
      ) : null}

      {otrosMedios.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Terminales y otros medios de pago</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Ingresa el importe total acumulado en el voucher o resumen de cierre de cada terminal bancaria / pasarela.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pt-1">
            {otrosMedios.map((medio) => (
              <Field key={medio.id}>
                <FieldLabel required>{medio.nombre}</FieldLabel>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">$</span>
                  <Input
                    className="pl-7 font-semibold tabular-nums"
                    inputMode="decimal"
                    min="0"
                    name={`contado_${medio.id}`}
                    placeholder="0.00"
                    required
                    step="0.01"
                    type="number"
                  />
                </div>
              </Field>
            ))}
          </div>
        </div>
      ) : null}

      <Field>
        <FieldLabel>Notas del cierre</FieldLabel>
        <Textarea name="notas" placeholder="Aclaraciones sobre diferencias, incidencias del turno, pagos especiales…" rows={2} />
      </Field>

      <ActionFeedback state={state} />
      <Button
        className="w-full rounded-xl"
        data-action-clave="1"
        data-action-id="caja.cierre.confirmar"
        disabled={pending}
        size="touch"
        type="submit"
      >
        {pending ? "Cerrando y auditando arqueo…" : "Confirmar cierre de caja"}
      </Button>
    </form>
  );
}
