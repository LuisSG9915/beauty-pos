export type OrganizacionActivacion = {
  creadaAt: Date;
  activa: boolean;
  primeraVentaAt: Date | null;
};

export type ResumenActivacion = {
  conPrimeraVenta: number;
  sinPrimerCobro: number;
  medianaMinutos: number | null;
  p90Minutos: number | null;
  pctHasta10Min: number | null;
};

const MINUTO_MS = 60_000;

export function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const posicion = Math.max(1, Math.ceil((p / 100) * orden.length));
  return orden[posicion - 1];
}

export function resumenActivacion(
  organizaciones: OrganizacionActivacion[],
  umbralMinutos = 10,
): ResumenActivacion {
  const minutos = organizaciones.flatMap((org) =>
    org.primeraVentaAt
      ? [Math.max(0, (org.primeraVentaAt.getTime() - org.creadaAt.getTime()) / MINUTO_MS)]
      : [],
  );
  const dentroDelUmbral = minutos.filter((m) => m <= umbralMinutos).length;
  return {
    conPrimeraVenta: minutos.length,
    sinPrimerCobro: organizaciones.filter((org) => org.activa && !org.primeraVentaAt).length,
    medianaMinutos: percentil(minutos, 50),
    p90Minutos: percentil(minutos, 90),
    pctHasta10Min: minutos.length > 0 ? Math.round((dentroDelUmbral / minutos.length) * 100) : null,
  };
}

export function formatearMinutos(minutos: number | null): string {
  if (minutos === null) return "—";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  if (minutos < 1440) return `${Math.round(minutos / 60)} h`;
  const dias = Math.round(minutos / 1440);
  return dias === 1 ? "1 día" : `${dias} días`;
}
