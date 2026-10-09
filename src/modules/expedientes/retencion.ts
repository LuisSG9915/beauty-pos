export type CategoriaRetencion =
  | "color_decoloracion"
  | "color_global"
  | "alisado_keratina"
  | "tratamiento"
  | "corte"
  | "general";

export type EstadoCicloRetencion = "a_tiempo" | "ventana_optima" | "vencido";

export type ReglaRetencion = {
  categoria: CategoriaRetencion;
  diasRecomendados: number;
  tituloTratamiento: string;
  motivoExplicativo: string;
  rutinaCuidadoCasa: string[];
};

export type RetencionCalculada = {
  categoria: CategoriaRetencion;
  diasRecomendados: number;
  fechaSugerida: Date;
  fechaSugeridaIso: string;
  diasRestantes: number;
  estadoCiclo: EstadoCicloRetencion;
  tituloTratamiento: string;
  motivoExplicativo: string;
  rutinaCuidadoCasa: string[];
  mensajeWhatsApp: string;
  whatsappUrl?: string;
  linkReserva?: string;
};

/**
 * Determina la regla de ciclo de retención capilar/belleza según el nombre del servicio,
 * fórmula aplicada y tipo de ficha técnica.
 */
export function determinarReglaRetencion(params: {
  servicioNombre?: string | null;
  formula?: string | null;
  tipoFicha?: string | null;
}): ReglaRetencion {
  const texto = `${params.servicioNombre ?? ""} ${params.formula ?? ""} ${params.tipoFicha ?? ""}`.toLowerCase();

  // 1. Decoloraciones / Balayage / Mechas / Babylights / Matices
  if (/balayage|mechas|decolora|rubio|blond|babylight|matiz|toner|visos|platinado|claritos/.test(texto)) {
    return {
      categoria: "color_decoloracion",
      diasRecomendados: 28, // 4 semanas
      tituloTratamiento: "Matiz & Nutrición de Rubios",
      motivoExplicativo:
        "Neutraliza reflejos cobrizos o amarillentos y sella la cutícula para prolongar el brillo del color.",
      rutinaCuidadoCasa: [
        "Shampoo matizador violeta o azul (usar 1 vez por semana alternado)",
        "Mascarilla ácida ultra-nutritiva para sellar cutícula",
        "Protector térmico indispensable antes de secadora o plancha",
      ],
    };
  }

  // 2. Coloración global / Tintes / Canas / Raíz
  if (/tinte|color|cobertura|canas|raiz|crecimiento|reflejos/.test(texto) || params.tipoFicha === "color") {
    return {
      categoria: "color_global",
      diasRecomendados: 25, // ~3.5 semanas
      tituloTratamiento: "Retoque de Crecimiento & Brillo",
      motivoExplicativo:
        "Conserva la uniformidad del color en raíces y evita contrastes notorios con el tono de medios a puntas.",
      rutinaCuidadoCasa: [
        "Shampoo libre de sulfatos formulado para color",
        "Acondicionador con filtro UV para proteger pigmentos",
        "Aceite ligero de sellado en puntas",
      ],
    };
  }

  // 3. Alaciados / Keratina / Nanoplastia / Botox capilar
  if (/keratina|alaciad|alisad|nanoplastia|tanino|botox|japones/.test(texto)) {
    return {
      categoria: "alisado_keratina",
      diasRecomendados: 90, // 12-13 semanas
      tituloTratamiento: "Mantenimiento de Alaciado / Keratina",
      motivoExplicativo:
        "Restaura la película de termo-protección y mantiene el cabello disciplinado y libre de frizz.",
      rutinaCuidadoCasa: [
        "Shampoo 100% libre de sales y sulfatos",
        "Leave-in termo-activado al contacto con secadora",
        "Evitar ligas metálicas o peinados apretados en húmedo",
      ],
    };
  }

  // 4. Tratamientos profundos / Hidratación / Nutrición / Cauterización
  if (/tratamiento|hidratac|nutric|reparac|molecular|olaplex|k18|cauteriz|sos|ampolleta/.test(texto) || params.tipoFicha === "tratamiento") {
    return {
      categoria: "tratamiento",
      diasRecomendados: 21, // 3 semanas
      tituloTratamiento: "Refuerzo Nutritivo Profundo",
      motivoExplicativo:
        "Aporta lípidos y aminoácidos esenciales a la corteza capilar para prevenir orzuela y quiebre.",
      rutinaCuidadoCasa: [
        "Mascarilla reconstructora semanal con tiempo de pose de 10 min",
        "Serum de puntas abiertas con aceite de argán o macadamia",
        "Enjuagar con agua templada a fría para sellar brillo",
      ],
    };
  }

  // 5. Corte / Despunte / Barba
  if (/corte|despunte|barba|fade|fleco|capas/.test(texto)) {
    return {
      categoria: "corte",
      diasRecomendados: 35, // 5 semanas
      tituloTratamiento: "Mantenimiento de Forma & Puntas",
      motivoExplicativo:
        "Mantiene la estructura definida del corte y previene la apertura de puntas florecidas.",
      rutinaCuidadoCasa: [
        "Crema para peinar ligera según textura natural",
        "Cepillado delicado de puntas a raíz",
      ],
    };
  }

  // 6. General
  return {
    categoria: "general",
    diasRecomendados: 30,
    tituloTratamiento: "Cita de Mantenimiento Personalizado",
    motivoExplicativo:
      "Para consentir tu estilo y mantener los resultados radiantes de tu sesión.",
    rutinaCuidadoCasa: [
      "Higiene suave e hidratación regular",
      "Protección térmica ante herramientas de calor",
    ],
  };
}

/**
 * Calcula la predicción de retención inteligente, estado del ciclo,
 * mensaje de WhatsApp pre-redactado y enlaces de reserva en línea.
 */
export function calcularRetencionSugerida(params: {
  fechaServicio: Date | string;
  servicioNombre?: string | null;
  formula?: string | null;
  tipoFicha?: string | null;
  clienteNombre?: string | null;
  salonNombre?: string | null;
  telefonoCliente?: string | null;
  slugReserva?: string | null;
  now?: Date;
}): RetencionCalculada {
  const regla = determinarReglaRetencion({
    servicioNombre: params.servicioNombre,
    formula: params.formula,
    tipoFicha: params.tipoFicha,
  });

  const fechaBase = typeof params.fechaServicio === "string" ? new Date(params.fechaServicio) : params.fechaServicio;
  const now = params.now ?? new Date();

  const fechaSugerida = new Date(fechaBase.getTime() + regla.diasRecomendados * 86_400_000);
  const diasRestantes = Math.round((fechaSugerida.getTime() - now.getTime()) / 86_400_000);

  let estadoCiclo: EstadoCicloRetencion = "a_tiempo";
  if (diasRestantes <= 7 && diasRestantes >= -7) {
    estadoCiclo = "ventana_optima";
  } else if (diasRestantes < -7) {
    estadoCiclo = "vencido";
  }

  const formatoFecha = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
  }).format(fechaSugerida);

  const cliente = params.clienteNombre?.trim() ? params.clienteNombre.split(" ")[0] : "Hola";
  const salon = params.salonNombre?.trim() ?? "nuestro salón";
  const servicio = params.servicioNombre?.trim() ?? "tu servicio";

  const linkReserva = params.slugReserva ? `https://melena.app/reservar/${params.slugReserva}` : undefined;

  const semanas = Math.round(regla.diasRecomendados / 7);
  const mensajeWhatsApp = [
    `¡Hola ${cliente}! Te saludamos de ${salon} ✨`,
    `Ya casi se cumplen ${semanas} semanas de tu ${servicio}. Para conservar tu cabello radiante y con el acabado perfecto, te recomendamos tu ${regla.tituloTratamiento} alrededor del ${formatoFecha}.`,
    linkReserva ? `Puedes elegir tu día y horario aquí: ${linkReserva}` : "Escríbenos por aquí para coordinar tu horario ideal. ¡Será un gusto atenderte!",
  ].join("\n\n");

  let whatsappUrl: string | undefined;
  if (params.telefonoCliente) {
    const digitos = params.telefonoCliente.replace(/\D/g, "");
    if (digitos.length >= 8) {
      whatsappUrl = `https://wa.me/${digitos}?text=${encodeURIComponent(mensajeWhatsApp)}`;
    }
  }

  return {
    categoria: regla.categoria,
    diasRecomendados: regla.diasRecomendados,
    fechaSugerida,
    fechaSugeridaIso: fechaSugerida.toISOString().slice(0, 10),
    diasRestantes,
    estadoCiclo,
    tituloTratamiento: regla.tituloTratamiento,
    motivoExplicativo: regla.motivoExplicativo,
    rutinaCuidadoCasa: regla.rutinaCuidadoCasa,
    mensajeWhatsApp,
    whatsappUrl,
    linkReserva,
  };
}
