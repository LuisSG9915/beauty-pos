"use client";

import { useState } from "react";

import { addServicioInsumo, removeServicioInsumo } from "@/app/admin/servicios/insumos-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";

type Insumo = { id: string; productoId: string; productoNombre: string; productoSku: string; cantidad: string; unidadNombre: string | null };

export function InsumosManager({ organizationId, servicioId, insumos, disponibles }: { organizationId: string; servicioId: string; insumos: Insumo[]; disponibles: Array<{ id: string; sku: string; nombre: string; unidadNombre: string | null }> }) {
  const [selectedProducto, setSelectedProducto] = useState("");
  const [cantidad, setCantidad] = useState("1");

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="font-semibold">Insumos que consume este servicio</h3>
      <p className="mt-1 text-sm text-muted-foreground">Cada vez que se cobre el servicio, se descontará esta cantidad del inventario.</p>

      {insumos.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Clave</th>
                <th className="py-2 pr-4 font-medium">Producto</th>
                <th className="py-2 pr-4 font-medium">Cantidad</th>
                <th className="py-2 pr-4 font-medium">Unidad</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {insumos.map((insumo) => (
                <tr className="border-b border-border" key={insumo.id}>
                  <td className="py-3 pr-4 font-mono text-xs">{insumo.productoSku}</td>
                  <td className="py-3 pr-4 font-medium">{insumo.productoNombre}</td>
                  <td className="py-3 pr-4 tabular-nums">{insumo.cantidad}</td>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{insumo.unidadNombre ?? "—"}</td>
                  <td className="py-3">
                    <form action={removeServicioInsumo}>
                      <input name="organizacionId" type="hidden" value={organizationId} />
                      <input name="insumoRelId" type="hidden" value={insumo.id} />
                      <button className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs text-destructive hover:bg-destructive/10" type="submit">Quitar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">Este servicio todavía no tiene insumos asignados.</p>
      )}

      {disponibles.length > 0 ? (
        <form action={addServicioInsumo} className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="servicioId" type="hidden" value={servicioId} />
          <Field className="flex-1">
            <FieldLabel>Agregar insumo</FieldLabel>
            <Select name="productoId" onChange={(e) => setSelectedProducto(e.target.value)} required value={selectedProducto}>
              <option disabled value="">
                Selecciona un producto…
              </option>
              {disponibles.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>
              ))}
            </Select>
          </Field>
          <Field className="w-28">
            <FieldLabel required>Cantidad</FieldLabel>
            <Input min="0" name="cantidad" onChange={(e) => setCantidad(e.target.value)} required step="0.001" type="number" value={cantidad} />
          </Field>
          <Button className="rounded-xl" disabled={!selectedProducto} type="submit">Agregar</Button>
        </form>
      ) : (
        <p className="mt-4 text-xs font-medium text-warning">No hay productos marcados como insumo. Crea productos con tipo &quot;Insumo&quot; o &quot;Ambos&quot; en el catálogo de productos.</p>
      )}
    </div>
  );
}
