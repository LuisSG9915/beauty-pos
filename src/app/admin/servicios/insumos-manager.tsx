"use client";

import { useState } from "react";

import { addServicioInsumo, removeServicioInsumo } from "@/app/admin/servicios/insumos-actions";

type Insumo = { id: string; productoId: string; productoNombre: string; productoSku: string; cantidad: string; unidadNombre: string | null };

export function InsumosManager({ organizationId, servicioId, insumos, disponibles }: { organizationId: string; servicioId: string; insumos: Insumo[]; disponibles: Array<{ id: string; sku: string; nombre: string; unidadNombre: string | null }> }) {
  const [selectedProducto, setSelectedProducto] = useState("");
  const [cantidad, setCantidad] = useState("1");

  return (
    <div className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <h3 className="font-semibold">Insumos que consume este servicio</h3>
      <p className="mt-1 text-sm text-[#625b55]">Cada vez que se preste el servicio, se descontará esta cantidad del inventario.</p>

      {insumos.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#eee8e3] text-xs uppercase tracking-wide text-[#625b55]">
              <tr>
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4">Producto</th>
                <th className="py-2 pr-4">Cantidad</th>
                <th className="py-2 pr-4">Unidad</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {insumos.map((insumo) => (
                <tr className="border-b border-[#f1eeea]" key={insumo.id}>
                  <td className="py-3 pr-4 font-mono text-xs">{insumo.productoSku}</td>
                  <td className="py-3 pr-4 font-medium">{insumo.productoNombre}</td>
                  <td className="py-3 pr-4 tabular-nums">{insumo.cantidad}</td>
                  <td className="py-3 pr-4 text-xs text-[#625b55]">{insumo.unidadNombre ?? "—"}</td>
                  <td className="py-3">
                    <form action={removeServicioInsumo}>
                      <input name="organizacionId" type="hidden" value={organizationId} />
                      <input name="insumoRelId" type="hidden" value={insumo.id} />
                      <button className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#a8443a]" type="submit">Quitar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {insumos.length === 0 && (
        <p className="mt-4 rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55]">Este servicio todavía no tiene insumos asignados.</p>
      )}

      {disponibles.length > 0 && (
        <form action={addServicioInsumo} className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-[#eee8e3] p-4">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="servicioId" type="hidden" value={servicioId} />
          <label className="flex-1 space-y-1">
            <span className="text-xs font-medium text-[#625b55]">Agregar insumo</span>
            <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" name="productoId" value={selectedProducto} onChange={(e) => setSelectedProducto(e.target.value)}>
              <option value="">Selecciona un producto...</option>
              {disponibles.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-[#625b55]">Cantidad</span>
            <input className="h-10 w-28 rounded-xl border border-[#ded8d2] px-3 text-sm" min="0" name="cantidad" step="0.001" type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </label>
          <button className="rounded-xl bg-[#8a5140] px-4 py-2.5 text-sm font-medium text-white" disabled={!selectedProducto} type="submit">Agregar</button>
        </form>
      )}

      {disponibles.length === 0 && (
        <p className="mt-4 text-xs text-[#986b16]">No hay productos marcados como insumo. Crea productos con tipo &quot;Insumo&quot; o &quot;Ambos&quot; en el catálogo de productos.</p>
      )}
    </div>
  );
}
