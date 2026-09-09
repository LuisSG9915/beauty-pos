"use client";

import { useEffect, useMemo, useState } from "react";

import { CitaForm } from "@/app/admin/agenda/cita-form";
import { moveCita } from "@/app/admin/agenda/actions";

export type AgendaCita = {
  id: string;
  fechaHora: string;
  duracionMinutos: number;
  estado: string;
  notas: string | null;
  totalEstimado: string;
  clienteId: string | null;
  clienteNombre: string;
  sucursalId: string | null;
  usuarioId: string | null;
  servicios: Array<{ id: string; nombre: string; precio: string }>;
};

const START_HOUR = 8;
const END_HOUR = 21;
const HOUR_PX = 66;
const PX_PER_MIN = HOUR_PX / 60;

const ESTADO_STYLE: Record<string, string> = {
  pendiente: "border-[#d8d2cb] bg-[#f1eeea] text-[#625b55]",
  confirmada: "border-[#b8cfe0] bg-[#eef4fa] text-[#3a5a7a]",
  en_proceso: "border-[#e3c8a0] bg-[#fdf3e8] text-[#986b16]",
  completada: "border-[#b5d4bd] bg-[#eaf5ed] text-[#347052]",
  cancelada: "border-[#e3b8b0] bg-[#fdf1ee] text-[#a8443a]",
  no_asistio: "border-[#d0c8bc] bg-[#f3efe8] text-[#8a7b72]",
};

const HORAS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function fmtHora(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AgendaBoard({
  organizationId,
  fecha,
  staff,
  sucursales,
  clientes,
  servicios,
  citas,
}: {
  organizationId: string;
  fecha: string;
  staff: Array<{ id: string; nombre: string }>;
  sucursales: Array<{ id: string; nombre: string; clave: string }>;
  clientes: Array<{ id: string; nombre: string; telefono: string | null }>;
  servicios: Array<{ id: string; nombre: string; precioBase: string; duracionMinutos: number }>;
  citas: AgendaCita[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AgendaCita | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [fechaDestino, setFechaDestino] = useState("");

  const columns = useMemo(() => [{ id: "", nombre: "Sin asignar" }, ...staff], [staff]);

  const porColumna = useMemo(() => {
    const map = new Map<string, AgendaCita[]>();
    for (const col of columns) map.set(col.id, []);
    for (const cita of citas) {
      const key = cita.usuarioId ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(cita);
    }
    return map;
  }, [citas, columns]);

  useEffect(() => {
    if (dropTarget === "fecha" && dragId && fechaDestino) {
      const cita = citas.find((c) => c.id === dragId);
      if (!cita) return;
      const original = new Date(cita.fechaHora);
      const nueva = new Date(`${fechaDestino}T00:00:00`);
      nueva.setHours(original.getHours(), original.getMinutes(), 0, 0);
      const fd = new FormData();
      fd.set("organizacionId", organizationId);
      fd.set("citaId", cita.id);
      fd.set("fechaHora", nueva.toISOString());
      fd.set("usuarioId", cita.usuarioId ?? "");
      moveCita(fd);
      setDragId(null);
      setDropTarget(null);
      setFechaDestino("");
    }
  }, [fechaDestino, dropTarget, dragId, citas, organizationId]);

  const dropEnSlot = (usuarioId: string, minutes: number) => {
    if (!dragId) return;
    const base = new Date(`${fecha}T00:00:00`);
    base.setMinutes(minutes);
    const fd = new FormData();
    fd.set("organizacionId", organizationId);
    fd.set("citaId", dragId);
    fd.set("fechaHora", base.toISOString());
    fd.set("usuarioId", usuarioId);
    moveCita(fd);
    setDragId(null);
    setDropTarget(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[10px] text-[#625b55]">
          {Object.entries(ESTADO_STYLE).map(([k, cls]) => (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${cls}`} key={k}>
              <span className="size-1.5 rounded-full bg-current opacity-60" />
              {k === "en_proceso" ? "En proceso" : k === "no_asistio" ? "No asistió" : k.charAt(0).toUpperCase() + k.slice(1)}
            </span>
          ))}
        </div>
        <button className="rounded-xl bg-[#8a5140] px-4 py-2 text-sm font-medium text-white hover:bg-[#704032]" onClick={() => { setEditing(null); setModalOpen(true); }} type="button">+ Nueva cita</button>
      </div>

      <div
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed p-4 transition-colors ${dropTarget === "fecha" ? "border-[#8a5140] bg-[#f2e3dc]" : "border-[#ded8d2] bg-white"}`}
        onDragLeave={() => setDropTarget((t) => (t === "fecha" ? null : t))}
        onDragOver={(e) => { e.preventDefault(); setDropTarget("fecha"); }}
        onDrop={(e) => { e.preventDefault(); setDropTarget("fecha"); }}
      >
        <span className="text-sm font-medium text-[#625b55]">Cambio de fecha: arrastra una cita aquí y elige el nuevo día</span>
        {dropTarget === "fecha" && dragId && (
          <div className="flex flex-wrap items-center gap-2">
            <input className="h-9 rounded-xl border border-[#ded8d2] bg-white px-3 text-sm" onChange={(e) => setFechaDestino(e.target.value)} type="date" value={fechaDestino} />
            <span className="text-xs text-[#986b16]">Elige la fecha para mover la cita (misma hora).</span>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#ded8d2] bg-white p-4 shadow-sm">
        <div className="flex min-w-[760px] gap-2">
          <div className="w-14 shrink-0 pt-9">
            {HORAS.map((h) => (
              <div className="relative" key={h} style={{ height: HOUR_PX }}>
                <span className="absolute -top-1.5 right-2 text-[10px] text-[#a89f97]">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>
          {columns.map((col) => {
            const colCitas = (porColumna.get(col.id) ?? []).slice().sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
            return (
              <div
                className={`min-w-[150px] flex-1 rounded-xl transition-colors ${dropTarget === col.id ? "bg-[#f2e3dc]" : ""}`}
                key={col.id || "sin-asignar"}
                onDragLeave={() => setDropTarget((t) => (t === col.id ? null : t))}
                onDragOver={(e) => { e.preventDefault(); setDropTarget(col.id); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const minutes = Math.round(((e.clientY - rect.top) / PX_PER_MIN) / 15) * 15;
                  dropEnSlot(col.id, minutes);
                }}
              >
                <div className="mb-2 rounded-xl bg-[#f1eeea] px-3 py-2 text-center text-xs font-semibold text-[#625b55]">{col.nombre}</div>
                <div className="relative rounded-xl border border-[#eee8e3] bg-[#faf9f7]" style={{ height: HORAS.length * HOUR_PX }}>
                  {HORAS.map((h) => (
                    <div className="absolute w-full border-t border-[#eee8e3]" key={h} style={{ top: (h - START_HOUR) * HOUR_PX }} />
                  ))}
                  {dropTarget === col.id && dragId && (
                    <div className="pointer-events-none absolute inset-x-2 top-2 h-10 rounded-lg border-2 border-dashed border-[#c9a899] bg-[#f2e3dc]/50" />
                  )}
                  {colCitas.map((cita) => {
                    const start = new Date(cita.fechaHora);
                    const top = (start.getHours() * 60 + start.getMinutes() - START_HOUR * 60) * (HOUR_PX / 60);
                    const height = Math.max(cita.duracionMinutos * PX_PER_MIN, 30);
                    return (
                      <div
                        className={`absolute inset-x-1 cursor-grab overflow-hidden rounded-lg border p-1.5 shadow-sm ${ESTADO_STYLE[cita.estado] ?? ESTADO_STYLE.pendiente}`}
                        draggable
                        key={cita.id}
                        onClick={() => { setEditing(cita); setModalOpen(true); }}
                        onDragEnd={() => setDragId(null)}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", cita.id); e.dataTransfer.effectAllowed = "move"; setDragId(cita.id); }}
                        style={{ top, height, minHeight: 30 }}
                        title={`${fmtHora(new Date(cita.fechaHora))} · ${cita.clienteNombre} · ${cita.servicios.map((s) => s.nombre).join(", ")}`}
                      >
                        <p className="truncate text-[11px] font-semibold">{fmtHora(new Date(cita.fechaHora))} {cita.clienteNombre}</p>
                        {height > 45 && <p className="truncate text-[10px] opacity-80">{cita.servicios.map((s) => s.nombre).join(", ") || "Sin servicios"}</p>}
                        {height > 75 && <p className="text-[10px] opacity-70">${cita.totalEstimado}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? "Editar cita" : "Nueva cita"}</h2>
              <button className="rounded-lg px-2 text-2xl leading-none text-[#625b55] hover:text-[#2d2926]" onClick={() => setModalOpen(false)} type="button">×</button>
            </div>
            <CitaForm
              clientes={clientes}
              initial={editing ? {
                id: editing.id,
                organizacionId,
                sucursalId: editing.sucursalId ?? sucursales[0]?.id ?? "",
                clienteId: editing.clienteId,
                usuarioId: editing.usuarioId,
                fechaHora: editing.fechaHora,
                duracionMinutos: editing.duracionMinutos,
                notas: editing.notas,
                servicioIds: editing.servicios.map((s) => s.id),
              } : undefined}
              key={editing?.id ?? "nueva"}
              onSuccess={() => setModalOpen(false)}
              organizationId={organizationId}
              servicios={servicios}
              staff={staff}
              sucursales={sucursales}
            />
          </div>
        </div>
      )}
    </div>
  );
}
