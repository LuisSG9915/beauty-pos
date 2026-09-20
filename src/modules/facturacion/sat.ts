/**
 * Catálogos del SAT y helpers puros para CFDI. Subconjunto práctico para un
 * salón — los catálogos completos los resuelve el PAC al timbrar.
 */

export const REGIMENES_FISCALES = [
  { clave: "601", nombre: "General de Ley Personas Morales" },
  { clave: "603", nombre: "Personas Morales con Fines no Lucrativos" },
  { clave: "605", nombre: "Sueldos y Salarios e Ingresos Asimilados a Salarios" },
  { clave: "606", nombre: "Arrendamiento" },
  { clave: "612", nombre: "Personas Físicas con Actividades Empresariales y Profesionales" },
  { clave: "614", nombre: "Ingresos interinos" },
  { clave: "616", nombre: "Sin obligaciones fiscales" },
  { clave: "621", nombre: "Incorporación Fiscal" },
  { clave: "625", nombre: "Actividades Empresariales a través de Plataformas Tecnológicas" },
  { clave: "626", nombre: "Régimen Simplificado de Confianza" },
] as const;

export const USOS_CFDI = [
  { clave: "G01", nombre: "Adquisición de mercancías" },
  { clave: "G02", nombre: "Devoluciones, descuentos o bonificaciones" },
  { clave: "G03", nombre: "Gastos en general" },
  { clave: "I01", nombre: "Construcciones" },
  { clave: "I03", nombre: "Equipo de transporte" },
  { clave: "I04", nombre: "Equipo de cómputo y accesorios" },
  { clave: "I05", nombre: "Dados, troqueles, moldes, matrices y herramental" },
  { clave: "I08", nombre: "Otra maquinaria y equipo" },
  { clave: "D01", nombre: "Honorarios médicos, dentales y gastos hospitalarios" },
  { clave: "D10", nombre: "Pagos por servicios educativos (colegiaturas)" },
  { clave: "S01", nombre: "Sin efectos fiscales" },
  { clave: "CP01", nombre: "Pagos" },
  { clave: "CN01", nombre: "Nómina" },
] as const;

export const FORMAS_PAGO = [
  { clave: "01", nombre: "Efectivo" },
  { clave: "02", nombre: "Cheque nominativo" },
  { clave: "03", nombre: "Transferencia electrónica de fondos" },
  { clave: "04", nombre: "Tarjeta de crédito" },
  { clave: "05", nombre: "Monedero electrónico" },
  { clave: "06", nombre: "Dinero electrónico" },
  { clave: "08", nombre: "Vales de despensa" },
  { clave: "28", nombre: "Tarjeta de débito" },
  { clave: "29", nombre: "Tarjeta de servicios" },
  { clave: "30", nombre: "Aplicación de anticipos" },
  { clave: "99", nombre: "Por definir" },
] as const;

export const METODOS_PAGO = [
  { clave: "PUE", nombre: "Pago en una sola exhibición" },
  { clave: "PPD", nombre: "Pago en parcialidades o diferido" },
] as const;

export const MOTIVOS_CANCELACION = [
  { clave: "01", nombre: "Comprobante emitido con errores con relación" },
  { clave: "02", nombre: "Comprobante emitido con errores sin relación" },
  { clave: "03", nombre: "No se llevó a cabo la operación" },
  { clave: "04", nombre: "Operación nominativa relacionada en la factura global" },
] as const;

/** Receptor genérico: "Público en general" (CFDI global / mostrador). */
export const PUBLICO_EN_GENERAL = {
  rfc: "XAXX010101000",
  nombre: "PUBLICO EN GENERAL",
  regimen: "616",
  usoCfdi: "S01",
} as const;

/** Forma de pago SAT sugerida según la categoría interna del medio de pago. */
export function formaPagoDesdeCategoria(categoria: string | null | undefined): string {
  switch (categoria) {
    case "efectivo":
      return "01";
    case "tarjeta":
      return "28";
    case "transferencia":
      return "03";
    case "wallet":
      return "05";
    default:
      return "99";
  }
}

/**
 * Desglosa el IVA del total. Si los precios incluyen IVA, el impuesto va
 * "dentro" (subtotal = total / (1+tasa)); si no, se suma al subtotal.
 * Devuelve {subtotal, impuestos, total} con 2 decimales.
 */
export function desglosarIva(
  totalLineas: number,
  tasa: number,
  incluyeIva: boolean,
): { subtotal: number; impuestos: number; total: number } {
  if (incluyeIva) {
    const subtotal = Math.round((totalLineas / (1 + tasa)) * 100) / 100;
    return { subtotal, impuestos: Math.round((totalLineas - subtotal) * 100) / 100, total: Math.round(totalLineas * 100) / 100 };
  }
  const subtotal = Math.round(totalLineas * 100) / 100;
  const impuestos = Math.round(subtotal * tasa * 100) / 100;
  return { subtotal, impuestos, total: Math.round((subtotal + impuestos) * 100) / 100 };
}

const RFC_REGEX = /^([A-ZÑ&]{3,4})\d{6}([A-Z0-9]{3})?$/;

/** Validación estructural de RFC (persona física 13 o moral 12). */
export function rfcValido(rfc: string): boolean {
  return RFC_REGEX.test(rfc.trim().toUpperCase());
}
