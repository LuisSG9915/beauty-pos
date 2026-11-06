import { ChevronDown } from "lucide-react";

import { formatCurrency } from "@/lib/format";
import type { ResumenGananciaNeta } from "@/modules/reportes/queries";

export type TarjetaGananciaNetaProps = {
  ganancia: ResumenGananciaNeta;
  currency: string;
  titulo: string;
  subtitulo: string;
  detalleAbierto: boolean;
  /**
   * - `destacada` (default): bloque protagonista usado en Reportes (`bg-accent/60`).
   * - `compacta`: tarjeta con borde usada en Caja (`bg-card`).
   */
  variante?: "destacada" | "compacta";
};

export function TarjetaGananciaNeta({
  ganancia,
  currency,
  titulo,
  subtitulo,
  detalleAbierto,
  variante = "destacada",
}: TarjetaGananciaNetaProps) {
  const fmt = (centavos: number) => formatCurrency(centavos / 100, { currency });
  const esPositivo = ganancia.utilidadNetaCentavos >= 0;
  const desgloseEfectivo = `Efectivo ${fmt(ganancia.efectivoCentavos)} · Tarjeta ${fmt(ganancia.tarjetaCentavos)} · Transferencia ${fmt(ganancia.transferenciaCentavos)}`;

  if (variante === "compacta") {
    return (
      <div className="surface-card rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <p className="text-op-xs text-muted-foreground">{subtitulo}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div
            className={`order-first rounded-xl border p-4 lg:order-last ${
              esPositivo
                ? "border-success/30 bg-success-soft text-success-soft-foreground"
                : "border-destructive/30 bg-destructive-soft text-destructive-soft-foreground"
            }`}
          >
            <p className="text-op-xs font-medium opacity-85">
              Utilidad Neta en Mano
            </p>
            <p
              className={`mt-1 text-2xl font-black tracking-tight tabular-nums ${
                esPositivo ? "text-success-soft-foreground" : "text-destructive-soft-foreground"
              }`}
            >
              {fmt(ganancia.utilidadNetaCentavos)}
            </p>
            <p className="mt-1.5 text-op-xs font-medium opacity-85">
              {esPositivo ? "Disponible libre de compromisos" : "Déficit en el turno / día"}
            </p>
          </div>

          <details className="group min-w-0 lg:col-span-3" open={detalleAbierto}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-foreground sm:hidden">
              Ver ingresos, comisiones y gastos
              <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-3 sm:pt-0">
              <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                <p className="text-op-xs font-medium text-muted-foreground">Total Ingresado</p>
                <p className="mt-1 text-xl font-bold tracking-tight text-foreground tabular-nums">
                  {fmt(ganancia.totalIngresadoCentavos)}
                </p>
                <p className="mt-1.5 break-words text-op-xs text-muted-foreground">
                  {desgloseEfectivo}
                </p>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                <p className="text-op-xs font-medium text-muted-foreground">Por Pagar a Equipo</p>
                <p className="mt-1 text-xl font-bold tracking-tight text-foreground tabular-nums">
                  {fmt(ganancia.comisionesEquipoCentavos)}
                </p>
                <p className="mt-1.5 text-op-xs text-muted-foreground">Comisiones ganadas</p>
              </div>

              <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                <p className="text-op-xs font-medium text-muted-foreground">Gastos Operativos</p>
                <p className="mt-1 text-xl font-bold tracking-tight text-foreground tabular-nums">
                  {fmt(ganancia.gastosOperativosCentavos)}
                </p>
                <p className="mt-1.5 text-op-xs text-muted-foreground">Salidas de caja / gastos</p>
              </div>
            </div>
          </details>
        </div>
      </div>
    );
  }

  const componentes = [
    {
      detalle: desgloseEfectivo,
      etiqueta: "Total ingresado",
      valor: fmt(ganancia.totalIngresadoCentavos),
    },
    {
      detalle: "Comisiones ganadas",
      etiqueta: "Por pagar a equipo",
      valor: fmt(ganancia.comisionesEquipoCentavos),
    },
    {
      detalle: "Salidas de caja / gastos",
      etiqueta: "Gastos operativos",
      valor: fmt(ganancia.gastosOperativosCentavos),
    },
  ];

  return (
    <section className="rounded-2xl bg-accent/60 px-5 py-6 sm:px-7">
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight text-accent-foreground">{titulo}</h2>
        <p className="mt-1 text-sm text-accent-foreground/80">{subtitulo}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-center">
        <div className="surface-card rounded-xl bg-card px-5 py-4 sm:px-6 sm:py-5">
          <p className="text-op-xs font-medium text-muted-foreground">Utilidad neta en mano</p>
          <p
            className={`mt-1 text-3xl font-black tracking-tight tabular-nums sm:text-4xl ${
              esPositivo ? "text-success" : "text-destructive"
            }`}
          >
            {fmt(ganancia.utilidadNetaCentavos)}
          </p>
          <p className="mt-1.5 text-op-xs font-medium text-muted-foreground">
            {esPositivo ? "Disponible libre de compromisos" : "Déficit en el período"}
          </p>
        </div>

        <details className="group min-w-0" open={detalleAbierto}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-accent-foreground sm:hidden">
            Ver ingresos, comisiones y gastos
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 pt-3 sm:grid-cols-3 sm:pt-0">
            {componentes.map((componente) => (
              <div className="min-w-0" key={componente.etiqueta}>
                <dt className="text-op-xs font-medium text-accent-foreground/80">{componente.etiqueta}</dt>
                <dd className="mt-0.5 truncate text-xl font-bold tracking-tight tabular-nums text-accent-foreground">
                  {componente.valor}
                </dd>
                <dd className="mt-1 break-words text-op-xs text-accent-foreground/80">{componente.detalle}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}
