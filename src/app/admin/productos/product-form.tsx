"use client";

import { useActionState } from "react";

import { FormTabs } from "@/components/form-tabs";
import { Button } from "@/components/ui/button";
import { saveProduct, type ProductActionState } from "@/app/admin/productos/actions";

type ProductData = {
  id?: string;
  organizacionId: string;
  categoriaId?: string | null;
  unidadMedidaId?: string | null;
  sku: string;
  codigoBarras?: string | null;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  costo: string;
  precioVenta: string;
  stockMinimo: string;
  visiblePos: boolean;
};

type Option = { id: string; nombre: string };

export function ProductForm({
  organizationId,
  categories,
  units,
  initial,
}: {
  organizationId: string;
  categories: Option[];
  units: Option[];
  initial?: ProductData;
}) {
  const [state, formAction, pending] = useActionState<ProductActionState, FormData>(saveProduct, {});
  const value = (key: keyof ProductData) => initial?.[key] ?? "";
  const tipo = (initial?.tipo ?? "producto") as "producto" | "insumo" | "ambos";

  const general = (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-medium">SKU *</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("sku"))} name="sku" placeholder="SHAMPOO-001" required />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Código de barras</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("codigoBarras"))} name="codigoBarras" placeholder="7501234567890" />
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="text-sm font-medium">Nombre *</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("nombre"))} name="nombre" placeholder="Shampoo reparador 300ml" required />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Categoría</span>
        <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("categoriaId"))} name="categoriaId">
          <option value="">Sin categoría</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Unidad de medida</span>
        <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("unidadMedidaId"))} name="unidadMedidaId">
          <option value="">Sin unidad</option>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.nombre}</option>)}
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Tipo *</span>
        <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={tipo} name="tipo">
          <option value="producto">Producto (se vende)</option>
          <option value="insumo">Insumo (se consume)</option>
          <option value="ambos">Ambos (se vende y se consume)</option>
        </select>
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="text-sm font-medium">Descripción</span>
        <textarea className="min-h-24 w-full rounded-xl border border-[#ded8d2] bg-white px-3 py-2 text-sm" defaultValue={String(value("descripcion"))} name="descripcion" />
      </label>
    </div>
  );

  const precios = (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-medium">Costo (MXN)</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("costo") || "0")} min="0" name="costo" placeholder="0.00" required step="0.01" type="number" />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Precio de venta (MXN)</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("precioVenta") || "0")} min="0" name="precioVenta" placeholder="0.00" required step="0.01" type="number" />
      </label>
      <label className="flex items-center gap-3 rounded-xl border border-[#eee8e3] p-3 text-sm sm:col-span-2">
        <input defaultChecked={initial ? initial.visiblePos : true} name="visiblePos" type="checkbox" value="true" /> Visible en POS
      </label>
      <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55] sm:col-span-2">
        El margen se calcula automáticamente como precio de venta menos costo.
      </p>
    </div>
  );

  const inventario = (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-medium">Stock mínimo</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(value("stockMinimo") || "0")} min="0" name="stockMinimo" placeholder="0" required step="0.001" type="number" />
      </label>
      <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55] sm:col-span-2">
        El stock por sucursal y los movimientos de inventario se gestionarán desde el módulo de inventario.
      </p>
    </div>
  );

  const futuro = (
    <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55]">
      Proveedores, sucursales e historial se habilitarán al conectar inventario y compras.
    </p>
  );

  return (
    <form action={formAction} className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar producto" : "Nuevo producto o insumo"}</h2>
      <p className="mt-1 text-sm text-[#625b55]">Un producto puede venderse, consumirse como insumo o ambas cosas.</p>
      <div className="mt-5">
        <FormTabs
          tabs={[
            { id: "general", label: "Información general", content: general },
            { id: "precios", label: "Precios", content: precios },
            { id: "inventario", label: "Inventario", content: inventario },
            { id: "futuro", label: "Proveedores e historial", content: futuro },
          ]}
        />
      </div>
      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a8443a]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#347052]" role="status">Producto guardado correctamente.</p> : null}
      <Button className="mt-6 rounded-xl bg-[#8a5140] text-white hover:bg-[#704032]" disabled={pending} type="submit">{pending ? "Guardando..." : "Guardar producto"}</Button>
    </form>
  );
}
