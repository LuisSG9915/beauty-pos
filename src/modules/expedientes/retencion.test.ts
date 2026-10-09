import { describe, expect, it } from "vitest";

import {
  calcularRetencionSugerida,
  determinarReglaRetencion,
} from "./retencion";

describe("determinarReglaRetencion", () => {
  it("clasifica decoloraciones y balayage con ciclo de 4 semanas", () => {
    const regla = determinarReglaRetencion({
      servicioNombre: "Balayage Vainilla + Matiz",
      formula: "Decolorante 30g + 60ml 20vol",
    });
    expect(regla.categoria).toBe("color_decoloracion");
    expect(regla.diasRecomendados).toBe(28);
    expect(regla.tituloTratamiento).toContain("Matiz");
    expect(regla.rutinaCuidadoCasa.length).toBeGreaterThanOrEqual(3);
  });

  it("clasifica tintes y cobertura de canas con ciclo de 25 días", () => {
    const regla = determinarReglaRetencion({
      servicioNombre: "Tinte Global y Retoque Raíz",
      tipoFicha: "color",
    });
    expect(regla.categoria).toBe("color_global");
    expect(regla.diasRecomendados).toBe(25);
    expect(regla.tituloTratamiento).toContain("Retoque");
  });

  it("clasifica keratinas y alisados con ciclo de 90 días", () => {
    const regla = determinarReglaRetencion({
      servicioNombre: "Keratina Brasileña Antifrizz",
    });
    expect(regla.categoria).toBe("alisado_keratina");
    expect(regla.diasRecomendados).toBe(90);
  });

  it("clasifica tratamientos de hidratación y reconstrucción con ciclo de 21 días", () => {
    const regla = determinarReglaRetencion({
      servicioNombre: "Hidratación Profunda Olaplex",
      tipoFicha: "tratamiento",
    });
    expect(regla.categoria).toBe("tratamiento");
    expect(regla.diasRecomendados).toBe(21);
  });

  it("clasifica cortes con ciclo de 35 días", () => {
    const regla = determinarReglaRetencion({
      servicioNombre: "Corte de Dama y Despunte",
    });
    expect(regla.categoria).toBe("corte");
    expect(regla.diasRecomendados).toBe(35);
  });
});

describe("calcularRetencionSugerida", () => {
  it("calcula fecha futura y estado 'a_tiempo'", () => {
    const fechaServicio = new Date("2026-10-01T10:00:00Z");
    const now = new Date("2026-10-05T10:00:00Z"); // 4 días después
    const resultado = calcularRetencionSugerida({
      fechaServicio,
      servicioNombre: "Balayage Rubio Miel",
      clienteNombre: "Sofía Martínez",
      salonNombre: "Studio Melena",
      telefonoCliente: "+52 1 55 1234 5678",
      slugReserva: "studio-melena",
      now,
    });

    expect(resultado.diasRecomendados).toBe(28);
    // 28 días desde 2026-10-01 = 2026-10-29
    expect(resultado.fechaSugeridaIso).toBe("2026-10-29");
    expect(resultado.diasRestantes).toBe(24);
    expect(resultado.estadoCiclo).toBe("a_tiempo");
    expect(resultado.whatsappUrl).toBeDefined();
    expect(resultado.whatsappUrl).toContain("wa.me/5215512345678");
    expect(resultado.mensajeWhatsApp).toContain("Sofía");
    expect(resultado.mensajeWhatsApp).toContain("Studio Melena");
    expect(resultado.linkReserva).toBe("https://melena.app/reservar/studio-melena");
  });

  it("detecta 'ventana_optima' cuando faltan pocos días", () => {
    const fechaServicio = new Date("2026-09-10T10:00:00Z");
    const now = new Date("2026-10-06T10:00:00Z"); // 26 días después (faltan 2 días para 28)
    const resultado = calcularRetencionSugerida({
      fechaServicio,
      servicioNombre: "Balayage",
      now,
    });

    expect(resultado.diasRestantes).toBe(2);
    expect(resultado.estadoCiclo).toBe("ventana_optima");
  });

  it("detecta 'vencido' cuando pasó la fecha recomendada", () => {
    const fechaServicio = new Date("2026-08-01T10:00:00Z");
    const now = new Date("2026-10-08T10:00:00Z"); // más de 60 días
    const resultado = calcularRetencionSugerida({
      fechaServicio,
      servicioNombre: "Tinte",
      now,
    });

    expect(resultado.diasRestantes).toBeLessThan(-7);
    expect(resultado.estadoCiclo).toBe("vencido");
  });
});
