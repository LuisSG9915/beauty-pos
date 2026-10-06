import { describe, expect, it } from "vitest";

import {
  calcularFilaReabasto,
  calcularReabastecimiento,
  construirEntradaResumen,
  filtrarPuntosResumen,
  hash8,
  motivoFilaReabasto,
  normalizarDiasObjetivo,
  numerosEnTexto,
  numerosPermitidos,
  puntoFielALosDatos,
  textoBuenaCompra,
  textoCapitalDetenido,
  type EntradaReabasto,
} from "./reabastecimiento";

/** Entrada base: la fila 1 de la tabla obligatoria del plan. */
const entradaBase: EntradaReabasto = {
  productoId: "p1",
  nombre: "Shampoo reparador",
  sku: "SHA-01",
  tipo: "producto",
  stock: 10,
  stockMinimo: 2,
  costo: 130,
  precioVenta: 250,
  creadoHaceDias: 400,
  salidas30: 30,
  salidas90: 60,
  enCamino: 0,
};

const fila = (cambios: Partial<EntradaReabasto>, dias = 14) =>
  calcularFilaReabasto({ ...entradaBase, ...cambios }, dias);

describe("calcularFilaReabasto — casos obligatorios del plan", () => {
  it("caso 1: v30=1, v90=0.6667, v=0.8667, cobertura≈11.54, sugerido 5, pronto, subiendo", () => {
    const resultado = fila({});
    expect(resultado.v30).toBeCloseTo(1, 4);
    expect(resultado.v90).toBeCloseTo(0.6667, 4);
    expect(resultado.v).toBeCloseTo(0.8667, 4);
    expect(resultado.cobertura).toBeCloseTo(11.54, 2);
    expect(resultado.sugerido).toBe(5);
    expect(resultado.prioridad).toBe("pronto");
    expect(resultado.tendencia).toBe("subiendo"); // v30/v90 = 1.5 > 1.25
  });

  it("caso 2: igual que 1 con enCamino 5 → sugerido 0, prioridad pronto", () => {
    const resultado = fila({ enCamino: 5 });
    expect(resultado.sugerido).toBe(0);
    expect(resultado.prioridad).toBe("pronto");
  });

  it("caso 3: stock 0, min 0, s30 3, s90 9 → v 0.1, sugerido 2, agotado", () => {
    const resultado = fila({ stock: 0, stockMinimo: 0, salidas30: 3, salidas90: 9 });
    expect(resultado.v).toBeCloseTo(0.1, 4);
    expect(resultado.sugerido).toBe(2); // ceil(1.4)
    expect(resultado.prioridad).toBe("agotado");
    expect(resultado.cobertura).toBe(0);
  });

  it("caso 4: stock 4, min 5, sin ventas → v 0, cobertura null, sugerido 1, minimo, sin_ventas", () => {
    const resultado = fila({ stock: 4, stockMinimo: 5, salidas30: 0, salidas90: 0 });
    expect(resultado.v).toBe(0);
    expect(resultado.cobertura).toBeNull();
    expect(resultado.sugerido).toBe(1);
    expect(resultado.prioridad).toBe("minimo");
    expect(resultado.tendencia).toBe("sin_ventas");
  });

  it("caso 5: creado 10 d, s30 10, s90 10, stock 20 → dias 10/10, v 1, cobertura 20, ok, estable", () => {
    const resultado = fila({ creadoHaceDias: 10, salidas30: 10, salidas90: 10, stock: 20, stockMinimo: 0 });
    expect(resultado.v30).toBeCloseTo(1, 4);
    expect(resultado.v90).toBeCloseTo(1, 4);
    expect(resultado.v).toBeCloseTo(1, 4);
    expect(resultado.cobertura).toBeCloseTo(20, 4);
    expect(resultado.sugerido).toBe(0);
    expect(resultado.prioridad).toBe("ok");
    expect(resultado.tendencia).toBe("estable");
  });

  it("caso 6: creado 3 d, s30 7, s90 7 → piso de 7 días, v 1", () => {
    const resultado = fila({ creadoHaceDias: 3, salidas30: 7, salidas90: 7 });
    expect(resultado.v30).toBeCloseTo(1, 4);
    expect(resultado.v90).toBeCloseTo(1, 4);
    expect(resultado.v).toBeCloseTo(1, 4);
  });

  it("caso 9: N fuera de rango se acota a 7 / 60", () => {
    const bajo = calcularFilaReabasto(entradaBase, 3);
    const alto = calcularFilaReabasto(entradaBase, 90);
    // sugerido = ceil(v·N + min − stock − enCamino) con N ya acotado.
    expect(bajo.sugerido).toBe(Math.max(0, Math.ceil(0.8667 * 7 + 2 - 10)));
    expect(alto.sugerido).toBe(Math.ceil((0.6 + 0.4 * (60 / 90)) * 60 + 2 - 10));
    expect(bajo.sugerido).not.toBe(fila({}).sugerido);
    expect(normalizarDiasObjetivo(3)).toBe(7);
    expect(normalizarDiasObjetivo(90)).toBe(60);
  });
});

describe("calcularReabastecimiento — buena compra y capital detenido", () => {
  it("caso 7: precio 250, costo 130, v≈0.2667 → margen 120, utilidad ≈ 960", () => {
    // v = 0.2667: creado 400 d → dias30=30, dias90=90; s30=8, s90=24.
    const resultado = calcularReabastecimiento(
      [{ ...entradaBase, salidas30: 8, salidas90: 24, stock: 100, enCamino: 0 }],
      14,
    );
    expect(resultado.filas[0].v).toBeCloseTo(0.2667, 4);
    const buena = resultado.buenaCompra[0];
    expect(buena).toBeDefined();
    expect(buena.margenUnitario).toBeCloseTo(120, 4);
    expect(buena.utilidadMensual).toBeCloseTo(960, 0);
    expect(buena.margenPct).toBeCloseTo(0.48, 4);
  });

  it("caso 8: costo ≥ precio queda excluido de buena compra", () => {
    const resultado = calcularReabastecimiento(
      [
        { ...entradaBase, productoId: "sin-margen", costo: 250, precioVenta: 250 },
        { ...entradaBase, productoId: "costo-mayor", costo: 300, precioVenta: 250 },
      ],
      14,
    );
    expect(resultado.buenaCompra).toHaveLength(0);
  });

  it("excluye de buena compra insumos, sin precio o sin ventas", () => {
    const resultado = calcularReabastecimiento(
      [
        { ...entradaBase, productoId: "insumo", tipo: "insumo" },
        { ...entradaBase, productoId: "sin-precio", precioVenta: 0 },
        { ...entradaBase, productoId: "sin-ventas", salidas30: 0, salidas90: 0 },
      ],
      14,
    );
    expect(resultado.buenaCompra).toHaveLength(0);
  });

  it("ambos sí entra en buena compra", () => {
    const resultado = calcularReabastecimiento(
      [{ ...entradaBase, tipo: "ambos" }],
      14,
    );
    expect(resultado.buenaCompra).toHaveLength(1);
  });

  it("detenida: solo salidas90 = 0 con stock > 0, orden capital desc, tope 10", () => {
    const entradas: EntradaReabasto[] = Array.from({ length: 12 }, (_, i) => ({
      ...entradaBase,
      productoId: `det-${i}`,
      nombre: `Detenido ${String(i).padStart(2, "0")}`,
      stock: i + 1,
      costo: 10,
      salidas30: 0,
      salidas90: 0,
    }));
    entradas.push({ ...entradaBase, productoId: "sin-stock", stock: 0, salidas30: 0, salidas90: 0 });
    const resultado = calcularReabastecimiento(entradas, 14);
    expect(resultado.detenida).toHaveLength(10);
    expect(resultado.detenida[0].productoId).toBe("det-11"); // stock 12 × 10 = 120
    expect(resultado.detenida.map((d) => d.productoId)).not.toContain("sin-stock");
  });

  it("sugerencias: orden agotado → urgente → pronto → minimo y cobertura asc", () => {
    const resultado = calcularReabastecimiento(
      [
        { ...entradaBase, productoId: "minimo", nombre: "Minimo", stock: 4, stockMinimo: 5, salidas30: 0, salidas90: 0 },
        { ...entradaBase, productoId: "agotado", nombre: "Agotado", stock: 0, salidas30: 9, salidas90: 18 },
        { ...entradaBase, productoId: "pronto", nombre: "Pronto" }, // cobertura ~11.5
        { ...entradaBase, productoId: "urgente", nombre: "Urgente", stock: 3, stockMinimo: 0, salidas30: 30, salidas90: 60 }, // cobertura ~3.46
      ],
      14,
    );
    expect(resultado.sugerencias.map((f) => f.prioridad)).toEqual([
      "agotado",
      "urgente",
      "pronto",
      "minimo",
    ]);
    // La fila "ok" no entra en la lista.
    const ok = calcularReabastecimiento([{ ...entradaBase, stock: 1000 }], 14);
    expect(ok.sugerencias).toHaveLength(0);
  });

  it("kpis: cuenta agotados y urgentes de la lista y suma el costo sugerido", () => {
    const resultado = calcularReabastecimiento(
      [
        { ...entradaBase, productoId: "agotado", stock: 0, costo: 50, salidas30: 9, salidas90: 18 },
        { ...entradaBase, productoId: "urgente", stock: 3, stockMinimo: 0, costo: 10 },
      ],
      14,
    );
    expect(resultado.kpis.agotados).toBe(1);
    expect(resultado.kpis.urgentes).toBe(1);
    // agotado: v = 0.6·0.3 + 0.4·0.2 = 0.26 → sugerido ceil(0.26·14 + 2) = 6 → 300;
    // urgente: v = 0.8667 → sugerido ceil(0.8667·14 − 3) = 10 → 100.
    expect(resultado.kpis.costoTotalSugerido).toBe(400);
  });
});

describe("normalizarDiasObjetivo", () => {
  it("acota al rango 7–60 y usa 14 por defecto", () => {
    expect(normalizarDiasObjetivo(3)).toBe(7);
    expect(normalizarDiasObjetivo(90)).toBe(60);
    expect(normalizarDiasObjetivo(14)).toBe(14);
    expect(normalizarDiasObjetivo(undefined)).toBe(14);
    expect(normalizarDiasObjetivo(Number.NaN)).toBe(14);
    expect(normalizarDiasObjetivo("30")).toBe(30);
    expect(normalizarDiasObjetivo("no-numero")).toBe(14);
  });
});

describe("textos deterministas", () => {
  const fmt = (v: number) => `$${v.toFixed(2)}`;

  it("motivoFilaReabasto describe cada prioridad", () => {
    expect(motivoFilaReabasto(fila({ stock: 0 }), 14)).toContain("existencias");
    expect(motivoFilaReabasto(fila({}), 14)).toContain("14");
    const minimo = fila({ stock: 4, stockMinimo: 5, salidas30: 0, salidas90: 0 });
    expect(motivoFilaReabasto(minimo, 14)).toContain("mínimo");
  });

  it("textoBuenaCompra sigue el formato del plan", () => {
    const resultado = calcularReabastecimiento([entradaBase], 14);
    const texto = textoBuenaCompra(resultado.buenaCompra[0], fmt);
    expect(texto).toMatch(/^Se vende ~\d+ al mes y deja \$\d+\.\d{2} por pieza \(≈ \$\d+\.\d{2} al mes\)\.$/);
  });

  it("textoCapitalDetenido sigue el formato del plan", () => {
    const texto = textoCapitalDetenido(
      { productoId: "x", nombre: "X", sku: null, stock: 4, costo: 10, capital: 40 },
      fmt,
    );
    expect(texto).toBe("Sin ventas en 90 días; tienes $40.00 detenidos.");
  });
});

describe("resumen IA: entrada acotada y validación de números", () => {
  it("construirEntradaResumen limita a 10/5/5 filas", () => {
    const entradas: EntradaReabasto[] = Array.from({ length: 15 }, (_, i) => ({
      ...entradaBase,
      productoId: `p${i}`,
      nombre: `Producto ${i}`,
      stock: 0,
      salidas30: 9,
      salidas90: 18,
    }));
    const resultado = calcularReabastecimiento(entradas, 14);
    const entrada = construirEntradaResumen(resultado, { moneda: "MXN" });
    expect(entrada.dias).toBe(14);
    expect(entrada.moneda).toBe("MXN");
    expect(entrada.comprar).toHaveLength(10);
    expect(entrada.buenaCompra.length).toBeLessThanOrEqual(5);
    expect(entrada.detenida.length).toBeLessThanOrEqual(5);
  });

  it("numerosEnTexto entiende miles con coma y decimales con punto", () => {
    expect(numerosEnTexto("deja $1,234.50 y vende 12.5")).toEqual([1234.5, 12.5]);
    expect(numerosEnTexto("sin números")).toEqual([]);
  });

  it("puntoFielALosDatos acepta números de la entrada y sus redondeos", () => {
    const permitidos = numerosPermitidos({ vendePorDia: 0.87, sugerido: 5 });
    expect(puntoFielALosDatos("Se vende ~0.9 al día; pide 5.", permitidos)).toBe(true);
    expect(puntoFielALosDatos("Compra 40 piezas.", permitidos)).toBe(false);
  });

  it("puntoFielALosDatos acepta números dentro de nombres de producto", () => {
    // "Tinte 9.1" puede citarse en el resumen aunque 9.1 no sea una métrica.
    const permitidos = numerosPermitidos({ comprar: [{ nombre: "Tinte 9.1" }] });
    expect(puntoFielALosDatos("Compra primero Tinte 9.1.", permitidos)).toBe(true);
    expect(puntoFielALosDatos("Compra 9.1 piezas de más.", permitidos)).toBe(true);
    expect(puntoFielALosDatos("Compra 42 piezas.", permitidos)).toBe(false);
  });

  it("filtrarPuntosResumen descarta números inventados", () => {
    const entrada = construirEntradaResumen(
      calcularReabastecimiento([entradaBase], 14),
      { moneda: "MXN" },
    );
    const puntos = filtrarPuntosResumen(
      [
        `Pide ${entrada.comprar[0].sugerido} piezas primero.`,
        "Compra 999 piezas ya mismo.",
        "Revisa la mercancía detenida.",
      ],
      entrada,
    );
    expect(puntos).toHaveLength(2);
    expect(puntos.join(" ")).not.toContain("999");
  });
});

describe("hash8", () => {
  it("es determinista, estable y devuelve 8 hex", () => {
    expect(hash8('{"a":1}')).toBe(hash8('{"a":1}'));
    expect(hash8('{"a":1}')).toMatch(/^[0-9a-f]{8}$/);
    expect(hash8('{"a":1}')).not.toBe(hash8('{"a":2}'));
  });
});
