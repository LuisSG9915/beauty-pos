"use client";

import { useEffect, useMemo, useState, useActionState } from "react";

import { FormTabs } from "@/components/form-tabs";
import { Button } from "@/components/ui/button";
import { saveCita, type CitaActionState } from "@/app/admin/agenda/actions";

type CitaData = {
  id?: string;
  organizacionId: string;
  sucursalId: string;
  clienteId?: string | null;
  usuarioId?: string | null;
  fechaHora: string;
  duracionMinutos: number;
  notas?: string | null;
  servicioIds?: string[];
};

export function CitaForm({
  organizationId,
  sucursales,
  clientes,
  staff,
  servicios,
  initial,
  onSuccess,
}: {
  organizationId: string;
  sucursales: Array<{ id: string; nombre: string; clave: string }>;
  clientes: Array<{ id: string; nombre: string; telefono: string | null }>;
  staff: Array<{ id: string; nombre: string }>;
  servicios: Array<{ id: string; nombre: string; precioBase: string; duracionMinutos: number }>;
  initial?: CitaData;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState<CitaActionState, FormData>(saveCita, {});
  const [seleccionados, setSeleccionados] = useState<Set<string>>(() => new Set(initial?.servicioIds ?? []));
  const [inicio, setInicio] = useState(initial ? toLocalInput(initial.fechaHora) : "");
  const [duracionManual, setDuracionManual] = useState<number | null>(initial?.duracionMinutos ?? null);

  useEffect(() => {
    if (state.success) onSuccess?.();
  }, [state.success, onSuccess]);

  function toLocalInput(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const toggleServicio = (id: string) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resumen = useMemo(() => {
    const sel = servicios.filter((s) => seleccionados.has(s.id));
    const totalDuracion = sel.reduce((sum, s) => sum + s.duracionMinutos, 0);
    const totalPrecio = sel.reduce((sum, s) => sum + parseFloat(s.precioBase), 0);
    let fin: string | null = null;
    if (inicio) {
      const d = new Date(inicio);
      if (!isNaN(d.getTime())) {
        d.setMinutes(d.getMinutes() + (sel.length > 0 ? totalDuracion : (duracionManual ?? 60)));
        fin = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    }
    return { sel, totalDuracion, totalPrecio, fin };
  }, [seleccionados, servicios, inicio, duracionManual]);

  const duracionEfectiva = seleccionados.size > 0 ? resumen.totalDuracion : (duracionManual ?? 60);

  const general = (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-2">
        <span className="text-sm font-medium">Sucursal *</span>
        <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={initial?.sucursalId ?? ""} name="sucursalId" required>
          <option value="">Selecciona sucursal...</option>
          {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre} ({s.clave})</option>)}
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Cliente</span>
        <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(initial?.clienteId ?? "")} name="clienteId">
          <option value="">Sin cliente (walk-in)</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ""}</option>)}
        </select>
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Fecha y hora *</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" name="fechaHora" onChange={(e) => setInicio(e.target.value)} required type="datetime-local" value={inicio} />
      </label>
      <label className="space-y-2">
        <span className="text-sm font-medium">Duración (minutos){seleccionados.size > 0 ? " (auto por servicios)" : ""}</span>
        <input className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm disabled:bg-[#f1eeea]" disabled={seleccionados.size > 0} max={1440} min={5} name="duracionMinutos" onChange={(e) => setDuracionManual(Number(e.target.value))} required type="number" value={duracionEfectiva} />
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="text-sm font-medium">Profesional asignado</span>
        <select className="h-10 w-full rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" defaultValue={String(initial?.usuarioId ?? "")} name="usuarioId">
          <option value="">Sin asignar</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </label>
      <label className="space-y-2 sm:col-span-2">
        <span className="text-sm font-medium">Notas</span>
        <textarea className="min-h-20 w-full rounded-xl border border-[#ded8d2] bg-white px-3 py-2 text-sm" defaultValue={String(initial?.notas ?? "")} name="notas" placeholder="Preferencias del cliente, recordatorios..." />
      </label>
    </div>
  );

  const serviciosTab = (
    <div className="space-y-3">
      <p className="text-sm text-[#625b55]">Selecciona los servicios que se realizarán en esta cita.</p>
      {servicios.length === 0 ? (
        <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55]">No hay servicios activos. Crea servicios primero.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {servicios.map((s) => (
            <label className="flex items-center gap-3 rounded-xl border border-[#eee8e3] p-3 text-sm" key={s.id}>
              <input checked={seleccionados.has(s.id)} name="servicioIds" onChange={() => toggleServicio(s.id)} type="checkbox" value={s.id} />
              <span className="flex-1">{s.nombre}</span>
              <span className="text-xs tabular-nums text-[#625b55]">${s.precioBase} · {s.duracionMinutos}min</span>
            </label>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-[#e3d9d1] bg-[#faf6f3] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">Resumen</h4>
        <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <div><p className="text-xs text-[#625b55]">Inicio</p><p className="font-semibold tabular-nums">{inicio ? `${inicio.slice(11)} h` : "—"}</p></div>
          <div><p className="text-xs text-[#625b55]">Fin estimado</p><p className="font-semibold tabular-nums">{resumen.fin ? `${resumen.fin} h` : "—"}</p></div>
          <div><p className="text-xs text-[#625b55]">Total</p><p className="font-semibold tabular-nums">${resumen.totalPrecio.toFixed(2)}</p></div>
        </div>
        {resumen.sel.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-[#625b55]">
            {resumen.sel.map((s) => <li key={s.id}>{s.nombre} — ${s.precioBase} · {s.duracionMinutos}min</li>)}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <form action={formAction} className="rounded-2xl border border-[#ded8d2] bg-white p-6 shadow-sm">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar cita" : "Nueva cita"}</h2>
      <p className="mt-1 text-sm text-[#625b55]">Agenda la cita con los servicios elegidos. Al llegar el cliente, la cita pasa a venta en proceso.</p>
      <div className="mt-5">
        <FormTabs tabs={[{ id: "general", label: "Datos de la cita", content: general }, { id: "servicios", label: `Servicios (${seleccionados.size})`, content: serviciosTab }]} />
      </div>
      {state.error ? <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a8443a]" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-4 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#347052]" role="status">Cita guardada correctamente.</p> : null}
      <Button className="mt-6 rounded-xl bg-[#8a5140] text-white hover:bg-[#704032]" disabled={pending} type="submit">{pending ? "Guardando..." : "Guardar cita"}</Button>
    </form>
  );
}
