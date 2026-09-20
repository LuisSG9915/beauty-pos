/**
 * Cálculo del monto de una suscripción — la fuente única de verdad vive en
 * el servidor (registrarPagoSuscripcion) y se replica en la UI solo como
 * previsualización. Modelo: el precio base cubre `sucursalesIncluidas`
 * sucursales; cada adicional cuesta `precioSucursalExtra`/mes. El periodo
 * anual equivale a 10 mensualidades (base y extras por igual).
 */

export type Periodicidad = "mensual" | "anual";

/** Precios comerciales de un plan (numéricos — la BD los guarda como string). */
export type PlanPrecios = {
  precioMensual: number;
  precioAnual: number | null;
  /** Sucursales cubiertas por el precio base. */
  sucursalesIncluidas: number;
  /** MXN/mes por sucursal adicional; null = el plan no permite extras. */
  precioSucursalExtra: number | null;
};

export type Cotizacion =
  | {
      ok: true;
      periodicidad: Periodicidad;
      /** Periodos facturados (meses sueltos o años de 12 meses). */
      periodos: number;
      /** Precio del periodo con la cobertura incluida del plan. */
      precioUnitario: number;
      /** Precio del periodo por cada sucursal adicional. */
      precioExtraUnitario: number;
      sucursalesIncluidas: number;
      /** Sucursales facturadas por encima de las incluidas. */
      extras: number;
      /** Total del pago: (precioUnitario + extras × precioExtraUnitario) × periodos. */
      monto: number;
    }
  | { ok: false; error: string };

const redondear = (v: number) => Math.round(v * 100) / 100;

/**
 * Cotiza plan + periodicidad + cobertura. `meses` son periodos de 30 días de
 * acceso: en mensual cada mes es un pago; en anual deben ser múltiplos de 12
 * (cada 12 meses = un pago anual).
 */
export function cotizarSuscripcion(
  plan: PlanPrecios,
  input: { periodicidad: Periodicidad; sucursalesFacturadas: number; meses: number },
): Cotizacion {
  if (!Number.isInteger(input.sucursalesFacturadas) || input.sucursalesFacturadas < 1) {
    return { ok: false, error: "facturadas-invalidas" };
  }
  if (!Number.isInteger(input.meses) || input.meses < 1) {
    return { ok: false, error: "meses-invalidos" };
  }

  const extras = Math.max(0, input.sucursalesFacturadas - plan.sucursalesIncluidas);
  if (extras > 0 && plan.precioSucursalExtra == null) {
    return { ok: false, error: "extras-no-permitidos" };
  }

  if (input.periodicidad === "anual") {
    if (plan.precioAnual == null) return { ok: false, error: "sin-precio-anual" };
    if (input.meses % 12 !== 0) return { ok: false, error: "anual-requiere-12" };
    const periodos = input.meses / 12;
    const precioUnitario = plan.precioAnual;
    const precioExtraUnitario = redondear((plan.precioSucursalExtra ?? 0) * 10);
    return {
      ok: true,
      periodicidad: "anual",
      periodos,
      precioUnitario,
      precioExtraUnitario,
      sucursalesIncluidas: plan.sucursalesIncluidas,
      extras,
      monto: redondear((precioUnitario + extras * precioExtraUnitario) * periodos),
    };
  }

  const precioUnitario = plan.precioMensual;
  const precioExtraUnitario = plan.precioSucursalExtra ?? 0;
  return {
    ok: true,
    periodicidad: "mensual",
    periodos: input.meses,
    precioUnitario,
    precioExtraUnitario,
    sucursalesIncluidas: plan.sucursalesIncluidas,
    extras,
    monto: redondear((precioUnitario + extras * precioExtraUnitario) * input.meses),
  };
}

/** Coerción segura de la fila `planes` (numéricos llegan como string). */
export function planPreciosDesdeFila(row: {
  precioMensual: string;
  precioAnual: string | null;
  sucursalesIncluidas: number;
  precioSucursalExtra: string | null;
}): PlanPrecios {
  return {
    precioMensual: Number(row.precioMensual),
    precioAnual: row.precioAnual == null ? null : Number(row.precioAnual),
    sucursalesIncluidas: row.sucursalesIncluidas,
    precioSucursalExtra: row.precioSucursalExtra == null ? null : Number(row.precioSucursalExtra),
  };
}
