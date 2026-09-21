/**
 * Gráficas SVG ligeras (server-safe, sin dependencias). Pensadas para lectura
 * rápida en reportes: etiquetas cortas, valor visible con <title> y barras
 * proporcionales al máximo del conjunto.
 */

export type PuntoGrafica = { etiqueta: string; valor: number; detalle?: string };

/** Gráfica de barras verticales (p.ej. ventas por día). */
export function BarChart({
  puntos,
  alto = 160,
  color = "var(--chart-1)",
  formato = (v: number) => String(v),
}: {
  puntos: PuntoGrafica[];
  alto?: number;
  color?: string;
  formato?: (valor: number) => string;
}) {
  if (puntos.length === 0) return null;
  const max = Math.max(...puntos.map((p) => p.valor), 1);
  const anchoBarra = Math.max(8, Math.min(40, Math.floor(600 / puntos.length) - 6));
  const ancho = puntos.length * (anchoBarra + 6);
  const mostrarEtiquetaCada = Math.ceil(puntos.length / 8);

  return (
    <div className="overflow-x-auto">
      <svg
        aria-label="Gráfica de barras"
        className="h-auto"
        height={alto + 36}
        role="img"
        viewBox={`0 0 ${ancho} ${alto + 36}`}
        width={ancho}
      >
        {puntos.map((punto, i) => {
          const h = Math.max(2, (punto.valor / max) * (alto - 12));
          const x = i * (anchoBarra + 6) + 3;
          const y = alto - h;
          return (
            <g key={punto.etiqueta}>
              <title>{`${punto.etiqueta}: ${formato(punto.valor)}${punto.detalle ? ` — ${punto.detalle}` : ""}`}</title>
              <rect height={h} rx={4} style={{ fill: color }} width={anchoBarra} x={x} y={y} />
              {i % mostrarEtiquetaCada === 0 ? (
                <text
                  className="fill-muted-foreground"
                  fontSize={10}
                  textAnchor="middle"
                  x={x + anchoBarra / 2}
                  y={alto + 14}
                >
                  {punto.etiqueta}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Barras horizontales con etiqueta y valor (p.ej. cobros por medio de pago). */
export function HBarChart({
  puntos,
  color = "var(--chart-1)",
  formato = (v: number) => String(v),
}: {
  puntos: PuntoGrafica[];
  color?: string;
  formato?: (valor: number) => string;
}) {
  if (puntos.length === 0) return null;
  const max = Math.max(...puntos.map((p) => p.valor), 1);
  return (
    <div className="space-y-2.5" role="img" aria-label="Gráfica de barras horizontales">
      {puntos.map((punto) => {
        const ancho = Math.max(2, (punto.valor / max) * 100);
        return (
          <div key={punto.etiqueta}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-foreground">{punto.etiqueta}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formato(punto.valor)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${ancho}%`, backgroundColor: color }}
                title={punto.detalle}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
