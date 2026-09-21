/**
 * Identidad de marca de Melena. Centraliza nombre, mensajes y dominio para
 * que el rebrand viva en un solo lugar; los textos legales y de correo lo
 * consumen desde aquí.
 */
export const BRAND = {
  name: "Melena",
  /** Promesa principal (hero, metadata, OG). */
  tagline: "Todo tu salón, bajo control",
  /** Descriptor junto al logotipo en contextos compactos. */
  descriptor: "Gestión para salones y estudios de belleza",
  domain: "melena.app",
  url: "https://melena.app",
  supportEmail: "soporte@melena.app",
  /** Remitente por defecto de correos transaccionales (Brevo). */
  emailFromName: "Melena",
} as const;

export const BRAND_COLORS = {
  /** Coral profundo — acción primaria, enlaces y foco. */
  primary: "#b7442e",
  /** Espresso/vino — superficies oscuras y tile del isotipo. */
  ink: "#211b19",
  /** Crema cálida — fondo operativo del panel. */
  background: "#fbf7f2",
  /** Coral pálido — acentos y estados activos. */
  accent: "#fbe5dc",
} as const;
