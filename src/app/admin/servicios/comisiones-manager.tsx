"use client";

import { addComision, removeComision } from "@/app/admin/servicios/comisiones-actions";

type Comision = { id: string; tipo: string; valor: string; rolNombre: string | null };

export function ComisionesManager({ organizationId, servicioId, comisiones, roles }: { organizationId: string; servicioId: string; comisiones: Comision[]; roles: Array<{ id: string; nombre: string }> }) {
  return (
    <div className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <h3 className="font-semibold">Comisiones</h3>
      <p className="mt-1 text-sm text-[#625b55]">Configura cuánto gana el personal por prestar este servicio. Si no seleccionas un rol, aplica a todos.</p>

      {comisiones.length > 0 && (
        <div className="mt-4 space-y-2">
          {comisiones.map((c) => (
            <div className="flex items-center justify-between rounded-xl border border-[#eee8e3] px-4 py-3" key={c.id}>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-[#f2e3dc] px-2.5 py-1 text-xs font-medium text-[#8a5140]">{c.tipo === "porcentaje" ? `${c.valor}%` : `$${c.valor}`}</span>
                <span className="text-sm text-[#2d2926]">{c.rolNombre ?? "Todos los roles"}</span>
              </div>
              <form action={removeComision}>
                <input name="organizacionId" type="hidden" value={organizationId} />
                <input name="comisionId" type="hidden" value={c.id} />
                <button className="rounded-lg border border-[#ded8d2] px-2.5 py-1 text-xs text-[#a8443a]" type="submit">Quitar</button>
              </form>
            </div>
          ))}
        </div>
      )}

      {comisiones.length === 0 && (
        <p className="mt-4 rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55]">Este servicio todavía no tiene comisiones configuradas.</p>
      )}

      <form action={addComision} className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-[#eee8e3] p-4">
        <input name="organizacionId" type="hidden" value={organizationId} />
        <input name="servicioId" type="hidden" value={servicioId} />
        <label className="space-y-1">
          <span className="text-xs font-medium text-[#625b55]">Rol (opcional)</span>
          <select className="h-10 w-44 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" name="rolId">
            <option value="">Todos</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-[#625b55]">Tipo</span>
          <select className="h-10 w-36 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue="porcentaje" name="tipo">
            <option value="porcentaje">Porcentaje</option>
            <option value="monto_fijo">Monto fijo</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-[#625b55]">Valor</span>
          <input className="h-10 w-28 rounded-xl border border-[#ded8d2] px-3 text-sm" min="0" name="valor" placeholder="10" required step="0.001" type="number" />
        </label>
        <button className="rounded-xl bg-[#8a5140] px-4 py-2.5 text-sm font-medium text-white" type="submit">Agregar</button>
      </form>
    </div>
  );
}
