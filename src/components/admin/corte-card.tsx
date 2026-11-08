"use client";

import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { AdminCard } from "@/components/admin/page-header";
import { VistaAdaptativaClient } from "@/components/admin/vista-adaptativa-client";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import type { ViewportPreference } from "@/lib/viewport-preference";

type CorteDetalle = {
  medioNombre: string;
  esperado: string;
  contado: string;
  diferencia: string;
};

type CorteRow = {
  id: string;
  createdAt: string;
  cerradoAt: string | null;
  notas: string | null;
  abiertoPor: string | null;
  fondoInicial: string;
  ventasCount: number;
  ventasTotal: string;
  propinas: string;
  comisionesTotal: string;
  detalles: CorteDetalle[];
};

type CorteCardProps = {
  corte: CorteRow;
  currency: string;
  timeZone: string;
  /** Marca el corte más reciente (borde primario y etiqueta "Último corte"). */
  esPrimero?: boolean;
  /** Retraso de la animación de entrada (stagger). */
  animDelay?: string;
  /** Preferencia de viewport resuelta en Server Component. */
  viewport: ViewportPreference | null;
};

const num = (v: string | number | null | undefined) => Number(v ?? 0);

export function CorteCard({
  corte,
  currency,
  timeZone,
  esPrimero = false,
  animDelay,
  viewport,
}: CorteCardProps) {
  const detallesList = corte.detalles;
  const diferenciaTotal = detallesList.reduce((s, d) => s + num(d.diferencia), 0);
  const esCuadrado = Math.abs(diferenciaTotal) < 0.01;
  const esFaltante = diferenciaTotal <= -0.01;

  const fmt = (v: string | number | null | undefined) =>
    formatCurrency(num(v), { currency });

  return (
    <AdminCard
      animate
      className={cn("self-start", esPrimero ? "border-primary/30 shadow-xs" : undefined)}
      style={{ animationDelay: animDelay }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">
            {formatDate(corte.createdAt, { timeZone })} ·{" "}
            {formatTime(corte.createdAt, { timeZone })} →{" "}
            {corte.cerradoAt
              ? formatTime(corte.cerradoAt, { timeZone })
              : "—"}
          </p>
          {esPrimero ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-op-xs font-semibold text-primary">
              Último corte
            </span>
          ) : null}
        </div>

        {esCuadrado ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-op-xs font-semibold text-success-soft-foreground">
            <CheckCircle2 className="size-3.5 text-success" />
            Arqueo cuadrado
          </span>
        ) : esFaltante ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive-soft px-2.5 py-0.5 text-op-xs font-semibold text-destructive-soft-foreground">
            <AlertCircle className="size-3.5 text-destructive" />
            Faltante de -{fmt(Math.abs(diferenciaTotal))}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-0.5 text-op-xs font-semibold text-warning-soft-foreground">
            <AlertTriangle className="size-3.5 text-warning" />
            Sobrante de +{fmt(diferenciaTotal)}
          </span>
        )}
      </div>

      <p className="mt-1 text-op-xs text-muted-foreground">
        Responsable: {corte.abiertoPor ?? "—"} · Fondo inicial:{" "}
        {fmt(corte.fondoInicial)} · {corte.ventasCount} venta(s) cobrada(s) ({fmt(corte.ventasTotal)}) ·{" "}
        {fmt(corte.propinas)} propinas · {fmt(corte.comisionesTotal)} comisiones
      </p>

      <VistaAdaptativaClient viewport={viewport}>
        <ul className="mt-3 space-y-2">
          {detallesList.map((d, i) => {
            const dif = num(d.diferencia);
            const itemCuadrado = Math.abs(dif) < 0.01;
            const itemFaltante = dif <= -0.01;
            return (
              <li className="rounded-xl border border-border px-3.5 py-2.5 text-sm" key={i}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-foreground">{d.medioNombre}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-op-xs font-medium ${
                      itemCuadrado
                        ? "bg-success-soft text-success-soft-foreground"
                        : itemFaltante
                          ? "bg-destructive-soft text-destructive-soft-foreground"
                          : "bg-warning-soft text-warning-soft-foreground"
                    }`}
                  >
                    {itemCuadrado ? "Cuadrado" : itemFaltante ? "Faltante" : "Sobrante"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-op-xs text-muted-foreground">
                  <span>
                    Esperado <span className="tabular-nums">{fmt(d.esperado)}</span> · Contado{" "}
                    <span className="tabular-nums font-semibold text-foreground">
                      {fmt(d.contado)}
                    </span>
                  </span>
                  <span className="tabular-nums font-semibold">
                    {itemCuadrado ? "$0.00" : (dif > 0 ? "+" : "") + fmt(dif)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 overflow-x-auto">
          <table aria-label="Historial de caja" className="w-full text-left text-sm">
            <thead className="text-op-xs uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Medio de pago</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Esperado</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Contado</th>
                <th className="py-1.5 pr-3 text-right font-semibold">Diferencia</th>
                <th className="py-1.5 text-right font-semibold">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {detallesList.map((d, i) => {
                const dif = num(d.diferencia);
                const itemCuadrado = Math.abs(dif) < 0.01;
                const itemFaltante = dif <= -0.01;

                return (
                  <tr className="hover:bg-muted/30 transition-colors" key={i}>
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {d.medioNombre}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {fmt(d.esperado)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold text-foreground">
                      {fmt(d.contado)}
                    </td>
                    <td
                      className={`py-2 pr-3 text-right font-semibold tabular-nums ${
                        itemCuadrado
                          ? "text-success"
                          : itemFaltante
                            ? "text-destructive"
                            : "text-warning"
                      }`}
                    >
                      {itemCuadrado ? "$0.00" : (dif > 0 ? "+" : "") + fmt(dif)}
                    </td>
                    <td className="py-2 text-right">
                      {itemCuadrado ? (
                        <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-op-xs font-medium text-success-soft-foreground">
                          Cuadrado
                        </span>
                      ) : itemFaltante ? (
                        <span className="rounded-md bg-destructive-soft px-1.5 py-0.5 text-op-xs font-medium text-destructive-soft-foreground">
                          Faltante
                        </span>
                      ) : (
                        <span className="rounded-md bg-warning-soft px-1.5 py-0.5 text-op-xs font-medium text-warning-soft-foreground">
                          Sobrante
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </VistaAdaptativaClient>

      {corte.notas ? (
        <p className="mt-2.5 rounded-lg bg-muted/40 px-3 py-1.5 text-op-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Notas de cierre:</span>{" "}
          {corte.notas}
        </p>
      ) : null}
    </AdminCard>
  );
}
