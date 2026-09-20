/**
 * Reglas puras de reportes: periodos comparables, deltas, presets de fechas
 * y serialización CSV segura. No conocen la base de datos.
 */

/** Periodo inmediatamente anterior de la misma duración (ambos inclusive). */
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } | null {
  const d0 = new Date(`${desde}T00:00:00Z`);
  const d1 = new Date(`${hasta}T00:00:00Z`);
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime()) || d0 > d1) return null;
  const dias = Math.round((d1.getTime() - d0.getTime()) / 86_400_000) + 1;
  const hastaAnt = new Date(d0.getTime() - 86_400_000);
  const desdeAnt = new Date(hastaAnt.getTime() - (dias - 1) * 86_400_000);
  return { desde: desdeAnt.toISOString().slice(0, 10), hasta: hastaAnt.toISOString().slice(0, 10) };
}

export type PresetPeriodo = { clave: string; etiqueta: string; desde: string; hasta: string };

function shiftDay(diaKey: string, dias: number): string {
  const d = new Date(`${diaKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Presets de rango en la zona del negocio. `hoy` es YYYY-MM-DD local.
 * "Este mes" va del día 1 a hoy; "Mes pasado" es el mes calendario anterior.
 */
export function presetsPeriodo(hoy: string): PresetPeriodo[] {
  const [anio, mes] = hoy.split("-").map(Number);
  const inicioMes = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const mesPrevio = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
  const inicioMesPrevio = `${mesPrevio.anio}-${String(mesPrevio.mes).padStart(2, "0")}-01`;
  const finMesPrevio = shiftDay(inicioMes, -1);
  return [
    { clave: "hoy", etiqueta: "Hoy", desde: hoy, hasta: hoy },
    { clave: "ayer", etiqueta: "Ayer", desde: shiftDay(hoy, -1), hasta: shiftDay(hoy, -1) },
    { clave: "7d", etiqueta: "7 días", desde: shiftDay(hoy, -6), hasta: hoy },
    { clave: "30d", etiqueta: "30 días", desde: shiftDay(hoy, -29), hasta: hoy },
    { clave: "mes", etiqueta: "Este mes", desde: inicioMes, hasta: hoy },
    { clave: "mes_previo", etiqueta: "Mes pasado", desde: inicioMesPrevio, hasta: finMesPrevio },
  ];
}

export type Delta = { valor: number; /** % vs periodo anterior; null si no hay base. */ pct: number | null };

/**
 * Delta de un KPI vs el periodo anterior. `pct` es null cuando el previo es 0
 * (no hay base comparable); el signo se infiere del valor.
 */
export function deltaKpi(actual: number, previo: number): Delta {
  const valor = actual - previo;
  if (previo === 0) return { valor, pct: actual === 0 ? 0 : null };
  return { valor, pct: Math.round((valor / previo) * 100) };
}

/** Texto del delta para la hint del KPI: "+12% vs periodo anterior". */
export function etiquetaDelta(delta: Delta): string {
  if (delta.pct == null) return "sin base comparable en el periodo anterior";
  const signo = delta.pct > 0 ? "+" : "";
  return `${signo}${delta.pct}% vs periodo anterior`;
}

/**
 * Celda CSV segura: escapa comillas/comas/saltos y neutraliza fórmulas de
 * hojas de cálculo (`=`, `+`, `-`, `@` al inicio, también tras espacios)
 * prefijando un apóstrofo — un valor de cliente nunca se ejecuta como fórmula.
 */
export function escapeCsv(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Fila CSV a partir de celdas ya crudas. */
export function filaCsv(celdas: readonly unknown[]): string {
  return celdas.map(escapeCsv).join(",");
}

// ---------------------------------------------------------------------------
// Derivación de KPIs — pura, misma definición para pantalla y CSV.
// ---------------------------------------------------------------------------

// Los agregados llegan del driver como number o string según la columna;
// se coercen con Number() — un "0" + "1" jamás debe concatenarse a "01".
export type CitaEstadoRow = { estado: string; total: number | string };
export type CitaOrigenRow = { origen: string; total: number | string };
export type VentaDiaRow = { dia: string; operaciones: number | string; descuentos: string; propinas: string; total: string };
export type AvisoEstadoRow = { estado: string; total: number | string; reintentos: number | string };

export type ReporteKpis = {
  totalCitas: number;
  completadas: number;
  finalizadas: number;
  /** % completadas/finalizadas; null sin base. */
  asistencia: number | null;
  reservasWeb: number;
  vendido: number;
  propinasTotal: number;
  operaciones: number;
  /** Vendido ÷ operaciones; null sin ventas. */
  ticketPromedio: number | null;
  /** Enviados = aceptados por el proveedor (no garantiza lectura). */
  avisosEnviados: number;
  avisosFallidos: number;
  avisosOmitidos: number;
  avisosPendientes: number;
  avisosReintentos: number;
};

const FINALIZADAS = new Set(["completada", "cancelada", "no_asistio"]);

export function derivarCitas(rows: readonly CitaEstadoRow[]) {
  const totalCitas = rows.reduce((acc, row) => acc + Number(row.total), 0);
  const completadas = Number(rows.find((row) => row.estado === "completada")?.total ?? 0);
  const finalizadas = rows
    .filter((row) => FINALIZADAS.has(row.estado))
    .reduce((acc, row) => acc + Number(row.total), 0);
  const asistencia = finalizadas > 0 ? Math.round((completadas / finalizadas) * 100) : null;
  return { totalCitas, completadas, finalizadas, asistencia };
}

export function derivarVentas(rows: readonly VentaDiaRow[]) {
  const vendido = rows.reduce((acc, row) => acc + Number(row.total ?? 0), 0);
  const propinasTotal = rows.reduce((acc, row) => acc + Number(row.propinas ?? 0), 0);
  const operaciones = rows.reduce((acc, row) => acc + Number(row.operaciones), 0);
  const ticketPromedio = operaciones > 0 ? vendido / operaciones : null;
  return { vendido, propinasTotal, operaciones, ticketPromedio };
}

/** Citas de origen "web" = reservas hechas por el cliente en el portal público. */
export function derivarReservasWeb(rows: readonly CitaOrigenRow[]) {
  return rows.filter((row) => row.origen === "web").reduce((acc, row) => acc + Number(row.total), 0);
}

export function derivarAvisos(rows: readonly AvisoEstadoRow[]) {
  const porEstado = new Map(rows.map((row) => [row.estado, Number(row.total)]));
  return {
    avisosEnviados: porEstado.get("enviado") ?? 0,
    avisosFallidos: porEstado.get("fallido") ?? 0,
    avisosOmitidos: porEstado.get("omitido") ?? 0,
    avisosPendientes: (porEstado.get("pendiente") ?? 0) + (porEstado.get("enviando") ?? 0),
    avisosReintentos: rows.reduce((acc, row) => acc + Number(row.reintentos), 0),
  };
}
