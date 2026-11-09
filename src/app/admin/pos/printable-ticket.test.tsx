import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ComprobanteImprimible, type PrintableTicketProps } from "./printable-ticket";

const VENTA_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function propsBase(overrides: Partial<PrintableTicketProps> = {}): PrintableTicketProps {
  return {
    negocioNombre: "Estética Prueba E2E",
    ventaId: VENTA_ID,
    folio: 42,
    clienteNombre: "María López",
    fecha: "2026-02-10T18:30:00Z",
    lineasServicios: [{ id: "l1", nombre: "Corte", precio: "350.00", cantidad: 1 }],
    lineasProductos: [],
    subtotal: "350.00",
    total: "350.00",
    pagos: [],
    currency: "MXN",
    ...overrides,
  };
}

describe("ComprobanteImprimible", () => {
  it("muestra el folio consecutivo y nunca un fragmento del id", () => {
    const html = renderToStaticMarkup(<ComprobanteImprimible {...propsBase()} />);
    expect(html).toContain("Folio 0042");
    expect(html).not.toContain(VENTA_ID.slice(0, 8).toUpperCase());
    expect(html).not.toContain(VENTA_ID.slice(0, 8));
  });

  it("sin folio muestra 'Folio —'", () => {
    const html = renderToStaticMarkup(
      <ComprobanteImprimible {...propsBase({ folio: null })} />,
    );
    expect(html).toContain("Folio —");
  });
});
