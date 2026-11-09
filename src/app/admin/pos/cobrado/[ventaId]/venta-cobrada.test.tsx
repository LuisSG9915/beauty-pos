import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { VentaCobrada } from "./venta-cobrada";

const VENTA_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

function propsBase(overrides: Partial<Parameters<typeof VentaCobrada>[0]> = {}) {
  return {
    negocioNombre: "Estética Prueba E2E",
    ventaId: VENTA_ID,
    clienteNombre: "María López",
    clienteTelefono: "8112345678",
    fecha: "2026-02-10T18:30:00Z",
    lineasServicios: [
      { id: "l1", nombre: "Corte", precio: "350.00", cantidad: 1 },
    ],
    lineasProductos: [],
    lineasPaquetes: [],
    lineasMembresias: [],
    subtotal: "350.00",
    descuento: "0",
    propina: "0",
    total: "350.00",
    pagos: [
      {
        id: "p1",
        nombre: "Efectivo",
        monto: "500.00",
        recibido: "500.00",
        cambio: "150.00",
      },
    ],
    currency: "MXN",
    organizationId: "652c172c-bf32-4b9c-90d1-006eded7ff56",
    sucursalId: "e9fbed18-2299-4105-98fd-f2f70ac664ca",
    ...overrides,
  };
}

function hrefDe(html: string, actionId: string): string | null {
  const marca = `data-action-id="${actionId}"`;
  const inicio = html.indexOf(marca);
  if (inicio === -1) return null;
  const tagInicio = html.lastIndexOf("<a", inicio);
  const tagFin = html.indexOf(">", inicio);
  if (tagInicio === -1 || tagFin === -1) return null;
  const tag = html.slice(tagInicio, tagFin);
  const match = /href="([^"]*)"/.exec(tag);
  return match ? match[1] : null;
}

describe("VentaCobrada", () => {
  it("muestra el encabezado 'Venta cobrada', el total y las formas de pago", () => {
    const html = renderToStaticMarkup(<VentaCobrada {...propsBase()} />);
    expect(html).toContain("Venta cobrada");
    expect(html).toContain("$350.00");
    expect(html).toContain("Efectivo");
    expect(html).toContain("María López");
  });

  it("muestra 'Cambio a entregar' solo cuando hay cambio", () => {
    const conCambio = renderToStaticMarkup(<VentaCobrada {...propsBase()} />);
    expect(conCambio).toContain("Cambio a entregar");
    expect(conCambio).toContain("$150.00");

    const sinCambio = renderToStaticMarkup(
      <VentaCobrada
        {...propsBase({
          pagos: [
            { id: "p1", nombre: "Efectivo", monto: "350.00", recibido: "350.00", cambio: "0" },
          ],
        })}
      />,
    );
    expect(sinCambio).not.toContain("Cambio a entregar");
  });

  it("el enlace de WhatsApp no lleva rutas internas ni identificadores", () => {
    const html = renderToStaticMarkup(<VentaCobrada {...propsBase()} />);
    const href = hrefDe(html, "pos.cobrado.whatsapp");
    expect(href).toBeTruthy();
    const decodificado = decodeURIComponent(href!);
    expect(decodificado).toContain("wa.me");
    expect(decodificado).not.toContain("/admin/");
    expect(decodificado).not.toContain(VENTA_ID);
    expect(decodificado).not.toContain(VENTA_ID.slice(0, 8));
    expect(decodificado).toContain("8112345678");
  });

  it("'Nueva venta' apunta a /admin/pos con nueva=1", () => {
    const html = renderToStaticMarkup(<VentaCobrada {...propsBase()} />);
    const href = hrefDe(html, "pos.cobrado.nueva_venta");
    expect(href).toBeTruthy();
    const url = new URL(href!.replace(/&amp;/g, "&"), "https://melena.app");
    expect(url.pathname).toBe("/admin/pos");
    expect(url.searchParams.get("nueva")).toBe("1");
    expect(url.searchParams.get("organizationId")).toBe(
      "652c172c-bf32-4b9c-90d1-006eded7ff56",
    );
    expect(url.searchParams.get("sucursalId")).toBe(
      "e9fbed18-2299-4105-98fd-f2f70ac664ca",
    );
  });

  it("expone acciones accesibles: imprimir, WhatsApp, ver venta y nueva venta", () => {
    const html = renderToStaticMarkup(<VentaCobrada {...propsBase()} />);
    for (const id of [
      "pos.cobrado.imprimir",
      "pos.cobrado.whatsapp",
      "pos.cobrado.ver_venta",
      "pos.cobrado.nueva_venta",
    ]) {
      expect(html).toContain(`data-action-id="${id}"`);
    }
    expect(html).toContain("Imprimir ticket");
    expect(html).toContain("Ver venta");
    expect(html).toContain("Nueva venta");
  });
});
