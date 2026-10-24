/**
 * Gráficas SVG ligeras (server-safe, sin dependencias). Pensadas para lectura
 * rápida en reportes: etiquetas cortas, valor visible con <title> y barras
 * proporcionales al máximo del conjunto.
 */

export type PuntoGrafica = {
  /**
   * Id estable del registro detrás del punto (p. ej. productoId). Reservado
   * para anclajes futuros como «Ver en el mapa» (plan 11); hoy solo alimenta
   * la `key` cuando existe.
   */
  id?: string;
  etiqueta: string;
  valor: number;
  detalle?: string;
  /** Marca de referencia dibujada sobre la barra (p. ej. stock mínimo). */
  marca?: number;
  /** Color propio del punto (p. ej. por estado); sin él se usa `color`. */
  color?: string;
};

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
    <div aria-label="Gráfica de barras" className="w-full max-w-full overflow-x-auto" role="region" tabIndex={0}>
      <svg
        aria-label="Gráfica de barras"
        className="h-auto max-w-none"
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

/**
 * Barras horizontales con etiqueta y valor (p.ej. cobros por medio de pago).
 * Con `etiquetaIzquierda` cambia a un layout SVG de filas (etiqueta a la
 * izquierda, valor a la derecha) que además dibuja `marca` como línea de
 * referencia y respeta `color` por punto — pensado para «stock vs mínimo».
 */
export function HBarChart({
  puntos,
  color = "var(--chart-1)",
  formato = (v: number) => String(v),
  etiquetaIzquierda = false,
  etiquetaAccesible = "Gráfica de barras horizontales",
  etiquetaMarca = "mínimo",
}: {
  puntos: PuntoGrafica[];
  color?: string;
  formato?: (valor: number) => string;
  /** Etiqueta a la izquierda de la barra (filas tipo tabla, marca y color por punto). */
  etiquetaIzquierda?: boolean;
  /** Nombre accesible del conjunto. */
  etiquetaAccesible?: string;
  /** Cómo se nombra la marca de referencia en el <title> accesible. */
  etiquetaMarca?: string;
}) {
  if (puntos.length === 0) return null;

  if (etiquetaIzquierda) {
    const ANCHO = 640;
    const ALTO_FILA = 32;
    const ALTO_BARRA = 12;
    const ANCHO_ETIQUETA = 148;
    const ANCHO_VALOR = 72;
    const xBarra = ANCHO_ETIQUETA + 12;
    const anchoPista = ANCHO - xBarra - ANCHO_VALOR;
    // El máximo incluye la marca para que el mínimo siempre quede dentro de la pista.
    const max = Math.max(1, ...puntos.map((p) => Math.max(p.valor, p.marca ?? 0)));
    const alto = puntos.length * ALTO_FILA;
    return (
      <div aria-label={etiquetaAccesible} className="w-full max-w-full overflow-x-auto" role="region" tabIndex={0}>
        <svg
          aria-label={etiquetaAccesible}
          className="h-auto w-full min-w-[320px]"
          height={alto}
          role="img"
          viewBox={`0 0 ${ANCHO} ${alto}`}
          width={ANCHO}
        >
          {puntos.map((punto, i) => {
            const y = i * ALTO_FILA;
            const yBarra = y + (ALTO_FILA - ALTO_BARRA) / 2;
            const anchoValor = Math.max(0, Math.min(anchoPista, (punto.valor / max) * anchoPista));
            const xMarca =
              punto.marca == null ? null : xBarra + Math.min(anchoPista, (punto.marca / max) * anchoPista);
            const etiquetaCorta =
              punto.etiqueta.length > 24 ? `${punto.etiqueta.slice(0, 23)}…` : punto.etiqueta;
            return (
              <g key={punto.id ?? punto.etiqueta}>
                <title>
                  {`${punto.etiqueta}: ${formato(punto.valor)}${punto.marca == null ? "" : ` · ${etiquetaMarca} ${formato(punto.marca)}`}${punto.detalle ? ` — ${punto.detalle}` : ""}`}
                </title>
                <text
                  className="fill-foreground"
                  dominantBaseline="central"
                  fontSize={12}
                  textAnchor="end"
                  x={ANCHO_ETIQUETA}
                  y={y + ALTO_FILA / 2}
                >
                  {etiquetaCorta}
                </text>
                <rect className="fill-muted" height={ALTO_BARRA} rx={ALTO_BARRA / 2} width={anchoPista} x={xBarra} y={yBarra} />
                {anchoValor > 0 ? (
                  <rect
                    height={ALTO_BARRA}
                    rx={ALTO_BARRA / 2}
                    style={{ fill: punto.color ?? color }}
                    width={Math.max(3, anchoValor)}
                    x={xBarra}
                    y={yBarra}
                  />
                ) : null}
                {xMarca == null ? null : (
                  <rect
                    className="fill-foreground"
                    height={ALTO_BARRA + 8}
                    rx={1.25}
                    width={2.5}
                    x={xMarca - 1.25}
                    y={yBarra - 4}
                  />
                )}
                <text
                  className="fill-muted-foreground tabular-nums"
                  dominantBaseline="central"
                  fontSize={12}
                  textAnchor="end"
                  x={ANCHO}
                  y={y + ALTO_FILA / 2}
                >
                  {formato(punto.valor)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  const max = Math.max(...puntos.map((p) => p.valor), 1);
  return (
    <div className="w-full min-w-0 space-y-2.5" role="img" aria-label={etiquetaAccesible}>
      {puntos.map((punto) => {
        const ancho = Math.max(2, (punto.valor / max) * 100);
        return (
          <div key={punto.id ?? punto.etiqueta}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-op-xs">
              <span className="truncate font-medium text-foreground">{punto.etiqueta}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formato(punto.valor)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${ancho}%`, backgroundColor: punto.color ?? color }}
                title={punto.detalle}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Paleta cíclica para segmentos de pastel/donut. */
const COLORES_DONUT = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/**
 * Donut SVG con leyenda: el color nunca es la única señal (la leyenda repite
 * etiqueta, valor y porcentaje). Server-safe, sin dependencias.
 */
export function DonutChart({
  puntos,
  formato = (v: number) => String(v),
  etiquetaAccesible = "Gráfica de pastel",
  tamano = 150,
}: {
  puntos: PuntoGrafica[];
  formato?: (valor: number) => string;
  /** Nombre accesible del conjunto. */
  etiquetaAccesible?: string;
  /** Lado del SVG en px; la leyenda queda a la derecha en escritorio. */
  tamano?: number;
}) {
  const total = puntos.reduce((acc, punto) => acc + Math.max(0, punto.valor), 0);
  if (puntos.length === 0 || total <= 0) return null;

  const CENTRO = 60;
  const RADIO = 46;
  const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
  const positivos = puntos.filter((punto) => punto.valor > 0);
  const segmentos = positivos.map((punto, i) => {
    // Inicio del arco = suma de los valores previos (prefijo inmutable).
    const inicio = positivos.slice(0, i).reduce((acc, previo) => acc + previo.valor, 0) / total;
    return {
      punto,
      fraccion: punto.valor / total,
      inicio,
      color: punto.color ?? COLORES_DONUT[i % COLORES_DONUT.length],
    };
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center w-full min-w-0 overflow-hidden">
      <svg
        aria-label={etiquetaAccesible}
        className="mx-auto shrink-0 max-w-full"
        height={tamano}
        role="img"
        viewBox="0 0 120 120"
        width={tamano}
      >
        <circle className="stroke-muted" cx={CENTRO} cy={CENTRO} fill="none" r={RADIO} strokeWidth={18} />
        {segmentos.map((segmento) => (
          <circle
            cx={CENTRO}
            cy={CENTRO}
            fill="none"
            key={segmento.punto.id ?? segmento.punto.etiqueta}
            r={RADIO}
            stroke={segmento.color}
            strokeDasharray={`${segmento.fraccion * CIRCUNFERENCIA} ${CIRCUNFERENCIA}`}
            strokeDashoffset={-segmento.inicio * CIRCUNFERENCIA}
            strokeWidth={18}
            transform={`rotate(-90 ${CENTRO} ${CENTRO})`}
          >
            <title>{`${segmento.punto.etiqueta}: ${formato(segmento.punto.valor)}${segmento.punto.detalle ? ` — ${segmento.punto.detalle}` : ""}`}</title>
          </circle>
        ))}
        <text
          className="fill-foreground font-semibold"
          dominantBaseline="central"
          fontSize={13}
          textAnchor="middle"
          x={CENTRO}
          y={CENTRO}
        >
          {formato(total)}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {segmentos.map((segmento) => (
          <li className="flex items-baseline gap-2 text-sm" key={segmento.punto.id ?? segmento.punto.etiqueta}>
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 self-center rounded-full"
              style={{ backgroundColor: segmento.color }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{segmento.punto.etiqueta}</span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">{formato(segmento.punto.valor)}</span>
            <span className="w-10 shrink-0 text-right text-op-xs tabular-nums text-muted-foreground">
              {Math.round(segmento.fraccion * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
