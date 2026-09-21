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
  /** Bugambilia profundo — acción primaria, enlaces y foco (modo claro). */
  primary: "#a91d5d",
  /** Bugambilia luminoso — acción primaria en modo oscuro. */
  primaryDark: "#f0649d",
  /** Ciruela oscuro — inicio del tile del isotipo y superficies de marca. */
  ink: "#341523",
  /** Fondo base de la app en modo claro. */
  background: "#faf9fb",
  /** Rosa pálido — acentos y estados activos (modo claro). */
  accent: "#f8e2ee",
  /** Texto sobre primary en claro / glifo del isotipo. */
  primaryForeground: "#fff7fb",
  /** Texto sobre accent (bugambilia oscuro, contraste AA). */
  accentForeground: "#7b1749",
  /** Fin del degradado del tile del isotipo (= primary). */
  brandIconBgEnd: "#a91d5d",
} as const;
