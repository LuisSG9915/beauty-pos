import { describe, expect, it } from "vitest";

import {
  completarLineaTicket,
  emparejarLineaProducto,
  errorCancelacionCompra,
  errorEdicionCompra,
  errorRecepcionCompra,
  errorResolucionCompra,
  estadoTrasRecibir,
  normalizarFechaTicket,
  procesarTicketIa,
  puntajeJaccard,
  resolverProveedorId,
  tokensDescripcion,
  type ProductoCatalogo,
} from "./rules";

const productos: ProductoCatalogo[] = [
  { id: "p1", nombre: "Shampoo reparador 400ml", sku: "SHA-400", codigoBarras: "7501234567890" },
  { id: "p2", nombre: "Acondicionador reparador 400ml", sku: "ACO-400", codigoBarras: null },
  { id: "p3", nombre: "Tinte rubio ceniza", sku: "TIN-RC", codigoBarras: null },
];

describe("tokensDescripcion", () => {
  it("normaliza minúsculas, sin acentos, une número+unidad y quita tokens de 1 letra", () => {
    expect(tokensDescripcion("Shampoo Reparación 400 ml")).toEqual(
      new Set(["shampoo", "reparacion", "400ml"]),
    );
    // "1 x" se une como número+unidad ("1x") antes del filtro de 1 carácter.
    expect(tokensDescripcion("A 1 x")).toEqual(new Set(["1x"]));
    expect(tokensDescripcion("A B C")).toEqual(new Set());
  });
});

describe("puntajeJaccard", () => {
  it("calcula |∩|/|∪| y devuelve 0 con conjuntos vacíos", () => {
    expect(puntajeJaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(puntajeJaccard(new Set(["a", "b"]), new Set(["a", "c"]))).toBeCloseTo(1 / 3);
    expect(puntajeJaccard(new Set(), new Set(["a"]))).toBe(0);
  });
});

describe("completarLineaTicket", () => {
  it("deriva costoUnitario = importe / cantidad (2 decimales)", () => {
    expect(
      completarLineaTicket({ descripcion: "Tinte", cantidad: 3, costoUnitario: null, importe: 100 }),
    ).toMatchObject({ costoUnitario: 33.33, importe: 100 });
  });

  it("deriva importe = costoUnitario × cantidad", () => {
    expect(
      completarLineaTicket({ descripcion: "Tinte", cantidad: 2, costoUnitario: 45.5, importe: null }),
    ).toMatchObject({ costoUnitario: 45.5, importe: 91 });
  });

  it("conserva ambos cuando ya vienen completos", () => {
    expect(
      completarLineaTicket({ descripcion: "Tinte", cantidad: 1, costoUnitario: 50, importe: 48 }),
    ).toMatchObject({ costoUnitario: 50, importe: 48 });
  });

  it("descarta la línea cuando faltan ambos importes o la descripción/cantidad", () => {
    expect(
      completarLineaTicket({ descripcion: "Algo", cantidad: 1, costoUnitario: null, importe: null }),
    ).toBeNull();
    expect(
      completarLineaTicket({ descripcion: "   ", cantidad: 1, costoUnitario: 10, importe: 10 }),
    ).toBeNull();
    expect(
      completarLineaTicket({ descripcion: "Algo", cantidad: 0, costoUnitario: 10, importe: 10 }),
    ).toBeNull();
  });
});

describe("normalizarFechaTicket", () => {
  it("acepta fechas válidas no futuras y rechaza inválidas o futuras", () => {
    expect(normalizarFechaTicket("2025-01-15", "2025-01-20")).toBe("2025-01-15");
    expect(normalizarFechaTicket("2025-01-20", "2025-01-20")).toBe("2025-01-20");
    expect(normalizarFechaTicket("2025-01-21", "2025-01-20")).toBeNull();
    expect(normalizarFechaTicket("2025-02-30", "2025-03-01")).toBeNull();
    expect(normalizarFechaTicket("ayer", "2025-01-20")).toBeNull();
    expect(normalizarFechaTicket(null, "2025-01-20")).toBeNull();
  });
});

describe("resolverProveedorId", () => {
  const proveedores = [
    { id: "prov-1", nombre: "Depil Center" },
    { id: "prov-2", nombre: "Distribuidora López" },
  ];

  it("empareja por nombre normalizado y devuelve null sin coincidencia", () => {
    expect(resolverProveedorId("Depil  CENTER", proveedores)).toBe("prov-1");
    expect(resolverProveedorId("Otro proveedor", proveedores)).toBeNull();
    expect(resolverProveedorId(null, proveedores)).toBeNull();
  });
});

describe("emparejarLineaProducto", () => {
  it("match exacto por código de barras o sku gana sin puntaje", () => {
    const porBarras = emparejarLineaProducto(
      { descripcion: "cualquier texto", codigo: "7501234567890" },
      productos,
    );
    expect(porBarras.productoId).toBe("p1");
    expect(porBarras.candidatos[0]?.productoId).toBe("p1");

    const porSku = emparejarLineaProducto(
      { descripcion: "tinte cualquiera", codigo: "TIN-RC" },
      productos,
    );
    expect(porSku.productoId).toBe("p3");
  });

  it("auto-empareja por Jaccard sobre el umbral con ventaja clara", () => {
    const { productoId, candidatos } = emparejarLineaProducto(
      { descripcion: "tinte rubio ceniza 90g", codigo: null },
      productos,
    );
    expect(productoId).toBe("p3");
    expect(candidatos.length).toBeGreaterThan(0);
    expect(candidatos.length).toBeLessThanOrEqual(3);
    expect(candidatos[0]?.productoId).toBe("p3");
  });

  it("sin ventaja suficiente sobre el segundo no auto-empareja (empate)", () => {
    // "reparador 400ml" empata shampoo y acondicionador → no hay ganador claro.
    const { productoId } = emparejarLineaProducto(
      { descripcion: "reparador 400ml", codigo: null },
      productos,
    );
    expect(productoId).toBeNull();
  });

  it("devuelve hasta 3 candidatos aunque no auto-empareje", () => {
    const { candidatos } = emparejarLineaProducto(
      { descripcion: "algo sin match", codigo: null },
      productos,
    );
    expect(candidatos).toHaveLength(3);
    expect(candidatos.every((c) => c.puntaje === 0)).toBe(true);
  });
});

describe("procesarTicketIa", () => {
  it("post-procesa la salida: descarta líneas sin importes y añade a dudas", () => {
    const resultado = procesarTicketIa(
      {
        proveedor: "Depil Center",
        folio: "A-123",
        fecha: "2025-01-10",
        total: 200,
        lineas: [
          { descripcion: "Shampoo reparador 400ml", cantidad: 2, costoUnitario: 100, importe: 200, codigo: null },
          { descripcion: "Renglón ilegible", cantidad: 1, costoUnitario: null, importe: null, codigo: null },
        ],
        dudas: ["total borroso"],
      },
      {
        proveedores: [{ id: "prov-1", nombre: "Depil Center" }],
        productos,
        hoy: "2025-01-20",
      },
    );
    expect(resultado.proveedorId).toBe("prov-1");
    expect(resultado.proveedorTexto).toBeNull();
    expect(resultado.folio).toBe("A-123");
    expect(resultado.fechaCompra).toBe("2025-01-10");
    expect(resultado.lineas).toHaveLength(1);
    expect(resultado.lineas[0]?.productoId).toBe("p1");
    expect(resultado.dudas).toEqual(["total borroso", expect.stringContaining("Renglón ilegible")]);
  });

  it("deja proveedorTexto cuando no hay match y cae la fecha a hoy si es futura", () => {
    const resultado = procesarTicketIa(
      {
        proveedor: "Proveedor Nuevo SA",
        folio: null,
        fecha: "2030-01-01",
        total: null,
        lineas: [],
        dudas: [],
      },
      { proveedores: [], productos, hoy: "2025-01-20" },
    );
    expect(resultado.proveedorId).toBeNull();
    expect(resultado.proveedorTexto).toBe("Proveedor Nuevo SA");
    expect(resultado.fechaCompra).toBe("2025-01-20");
  });
});

describe("estadoTrasRecibir", () => {
  it("todo cuadra → verificada", () => {
    const { estado, notaTotal } = estadoTrasRecibir({
      lineas: [
        { cantidad: 2, cantidadRecibida: 2 },
        { cantidad: 1, cantidadRecibida: 1 },
      ],
      totalTicket: 300,
      totalCalculado: 300,
    });
    expect(estado).toBe("verificada");
    expect(notaTotal).toBeNull();
  });

  it("una diferencia de cantidad o nota por línea → con_observacion", () => {
    expect(
      estadoTrasRecibir({
        lineas: [{ cantidad: 3, cantidadRecibida: 2 }],
      }).estado,
    ).toBe("con_observacion");
    expect(
      estadoTrasRecibir({
        lineas: [{ cantidad: 3, cantidadRecibida: 3, observacion: "vino abierto" }],
      }).estado,
    ).toBe("con_observacion");
    expect(
      estadoTrasRecibir({
        lineas: [{ cantidad: 1, cantidadRecibida: 1 }],
        observacionesCompra: "faltó una caja",
      }).estado,
    ).toBe("con_observacion");
  });

  it("diferencia de total > $1 → con_observacion con texto", () => {
    const { estado, notaTotal } = estadoTrasRecibir({
      lineas: [{ cantidad: 1, cantidadRecibida: 1 }],
      totalTicket: 350,
      totalCalculado: 300,
    });
    expect(estado).toBe("con_observacion");
    expect(notaTotal).toContain("no coincide");
    expect(notaTotal).toContain("$350.00");
    expect(notaTotal).toContain("$300.00");

    // Diferencia dentro del peso de tolerancia no marca observación.
    expect(
      estadoTrasRecibir({
        lineas: [{ cantidad: 1, cantidadRecibida: 1 }],
        totalTicket: 300.5,
        totalCalculado: 300,
      }).estado,
    ).toBe("verificada");
  });
});

describe("guards del ciclo de vida", () => {
  it("recibir solo desde por_verificar; el reintento tras recibir se rechaza", () => {
    // Simula dos llamadas a recibirCompra: la primera pasa el guard, la
    // segunda ya ve `verificada` y se rechaza sin tocar stock (idempotencia).
    const estadoInicial = "por_verificar";
    expect(errorRecepcionCompra(estadoInicial)).toBeNull();
    const { estado } = estadoTrasRecibir({ lineas: [{ cantidad: 1, cantidadRecibida: 1 }] });
    expect(errorRecepcionCompra(estado)).toBe("La compra ya fue recibida.");
    expect(errorRecepcionCompra("con_observacion")).toBe("La compra ya fue recibida.");
    expect(errorRecepcionCompra("cancelada")).toBe("La compra está cancelada.");
    expect(errorRecepcionCompra("borrador")).toBeTruthy();
  });

  it("edición solo en borrador/por_verificar", () => {
    expect(errorEdicionCompra("borrador")).toBeNull();
    expect(errorEdicionCompra("por_verificar")).toBeNull();
    expect(errorEdicionCompra("verificada")).toBeTruthy();
    expect(errorEdicionCompra("con_observacion")).toBeTruthy();
    expect(errorEdicionCompra("cancelada")).toBeTruthy();
  });

  it("resolver solo desde con_observacion y cancelar salvo estados finales", () => {
    expect(errorResolucionCompra("con_observacion")).toBeNull();
    expect(errorResolucionCompra("por_verificar")).toBeTruthy();
    expect(errorResolucionCompra("verificada")).toBeTruthy();

    expect(errorCancelacionCompra("borrador")).toBeNull();
    expect(errorCancelacionCompra("por_verificar")).toBeNull();
    expect(errorCancelacionCompra("con_observacion")).toBeNull();
    expect(errorCancelacionCompra("verificada")).toBeTruthy();
    expect(errorCancelacionCompra("cancelada")).toBeTruthy();
  });
});
