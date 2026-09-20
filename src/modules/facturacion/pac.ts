/**
 * Abstracción del PAC (Proveedor Autorizado de Certificación de CFDI).
 * `emitirFactura`/`cancelarFactura` solo hablan con esta interfaz: conectar un
 * PAC real (Facturama, Finkok, SW Sapien…) es implementar `PacProvider` y
 * registrarlo en `pacActivo`.
 *
 * `stub` simula el timbrado localmente: genera un UUID de formato válido y
 * deja constancia en `pac_proveedor`/`pac_respuesta` — sirve para desarrollar
 * y probar el flujo completo, pero los comprobantes stub NO tienen validez
 * fiscal ante el SAT.
 */

export type ComprobanteParaTimbrar = {
  serie: string;
  folio: number;
  subtotal: number;
  impuestos: number;
  total: number;
  moneda: string;
  metodoPago: string;
  formaPago: string;
  usoCfdi: string;
  emisor: { rfc: string; razonSocial: string; regimenFiscal: string; codigoPostal: string };
  receptor: { rfc: string; nombre: string; regimenFiscal: string; codigoPostal: string };
};

export type ResultadoTimbrado = {
  uuid: string;
  xml?: string;
  pdf?: string;
  respuesta?: Record<string, unknown>;
};

export type ResultadoCancelacion = {
  ok: boolean;
  respuesta?: Record<string, unknown>;
};

export interface PacProvider {
  clave: string;
  timbrar(comprobante: ComprobanteParaTimbrar): Promise<ResultadoTimbrado>;
  cancelar(uuid: string, motivo: string, uuidSustitucion?: string | null): Promise<ResultadoCancelacion>;
}

const stubPac: PacProvider = {
  clave: "stub",
  async timbrar(comprobante) {
    const uuid = crypto.randomUUID();
    return {
      uuid,
      respuesta: {
        stub: true,
        aviso: "Timbrado simulado — sin validez fiscal ante el SAT.",
        comprobante: { serie: comprobante.serie, folio: comprobante.folio, total: comprobante.total },
      },
    };
  },
  async cancelar(uuid, motivo) {
    return { ok: true, respuesta: { stub: true, uuid, motivo } };
  },
};

/** Proveedor configurado para la organización. Hoy solo existe `stub`. */
export function pacActivo(proveedor?: string | null): PacProvider {
  // Cuando se contrate un PAC: switch (proveedor) → instanciar su adapter
  // con las credenciales de `getRuntimeEnv()` (PAC_API_KEY, etc.).
  void proveedor;
  return stubPac;
}
