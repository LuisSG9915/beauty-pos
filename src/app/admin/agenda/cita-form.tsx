"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useActionState } from "react";

import { saveCita, type CitaActionState } from "@/app/admin/agenda/actions";
import { FormTabs } from "@/components/form-tabs";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/format";
import { getZonedParts } from "@/modules/agenda";

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

function toBranchDateTimeInput(value: string, timeZone: string) {
  if (!value) return "";
  if (!/(z|[+-]\d{2}:?\d{2})$/i.test(value)) return value.slice(0, 16);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = getZonedParts(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parts.dayKey}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function CitaForm({
  organizationId,
  sucursal,
  clientes,
  staff,
  servicios,
  currency = "MXN",
  timeZone,
  initial,
  onSuccess,
}: {
  organizationId: string;
  sucursal: { id: string; nombre: string; clave: string };
  clientes: Array<{ id: string; nombre: string; telefono: string | null }>;
  staff: Array<{ id: string; nombre: string }>;
  servicios: Array<{ id: string; nombre: string; precioBase: string; duracionMinutos: number }>;
  currency?: string;
  timeZone: string;
  initial?: CitaData;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState<CitaActionState, FormData>(saveCita, {});
  const [seleccionados, setSeleccionados] = useState<Set<string>>(() => new Set(initial?.servicioIds ?? []));
  const [inicio, setInicio] = useState(() => toBranchDateTimeInput(initial?.fechaHora ?? "", timeZone));
  const [duracionManual, setDuracionManual] = useState<number>(initial?.duracionMinutos ?? 60);
  const [usuarioId, setUsuarioId] = useState(initial?.usuarioId ?? "");

  const handledState = useRef<CitaActionState | null>(null);
  useEffect(() => {
    if (!state.success || handledState.current === state) return;
    handledState.current = state;
    toast.success(state.message ?? "Cita guardada correctamente.");
    onSuccess?.();
    router.refresh();
  }, [onSuccess, router, state, toast]);

  const resumen = useMemo(() => {
    const seleccionadosLista = servicios.filter((servicio) => seleccionados.has(servicio.id));
    const totalDuracion = seleccionadosLista.reduce((sum, servicio) => sum + servicio.duracionMinutos, 0);
    const totalPrecio = seleccionadosLista.reduce((sum, servicio) => sum + Number(servicio.precioBase), 0);
    let fin: string | null = null;
    if (inicio) {
      const start = new Date(inicio);
      if (!Number.isNaN(start.getTime())) {
        start.setMinutes(start.getMinutes() + (seleccionadosLista.length > 0 ? totalDuracion : duracionManual));
        fin = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
      }
    }
    return { seleccionadosLista, totalDuracion, totalPrecio, fin };
  }, [duracionManual, inicio, seleccionados, servicios]);

  const duracionEfectiva = seleccionados.size > 0 ? Math.max(resumen.totalDuracion, 5) : duracionManual;

  const toggleServicio = (id: string) => {
    setSeleccionados((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const general = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel>Sucursal</FieldLabel>
        <Input readOnly value={`${sucursal.nombre} · ${sucursal.clave}`} />
        <FieldDescription>Las citas se crean dentro de la sucursal seleccionada.</FieldDescription>
      </Field>
      <Combobox
        defaultValue={initial?.clienteId ?? null}
        items={clientes.map((cliente) => ({
          value: cliente.id,
          label: cliente.nombre,
          description: cliente.telefono ?? undefined,
          keywords: [cliente.telefono ?? ""],
        }))}
        label="Cliente"
        name="clienteId"
        placeholder="Buscar cliente o dejar walk-in"
      />
      <Field>
        <FieldLabel required>Fecha y hora</FieldLabel>
        <Input
          name="fechaHora"
          onChange={(event) => setInicio(event.target.value)}
          required
          type="datetime-local"
          value={inicio}
        />
        <FieldDescription>Hora local de la sucursal ({timeZone}).</FieldDescription>
      </Field>
      <Field>
        <FieldLabel required>
          Duración (minutos){seleccionados.size > 0 ? " · calculada" : ""}
        </FieldLabel>
        <input name="duracionMinutos" type="hidden" value={duracionEfectiva} />
        <Input
          disabled={seleccionados.size > 0}
          max={1440}
          min={5}
          onChange={(event) => setDuracionManual(Math.max(5, Number(event.target.value) || 5))}
          required
          type="number"
          value={duracionEfectiva}
        />
        <FieldDescription>
          Al elegir servicios, la duración se suma automáticamente.
        </FieldDescription>
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel>Profesional asignado</FieldLabel>
        <Select
          name="usuarioId"
          onChange={(event) => setUsuarioId(event.target.value)}
          value={usuarioId}
        >
          <option value="">Sin asignar</option>
          {staff.map((profesional) => (
            <option key={profesional.id} value={profesional.id}>
              {profesional.nombre}
            </option>
          ))}
        </Select>
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel>Notas</FieldLabel>
        <Textarea
          defaultValue={initial?.notas ?? ""}
          name="notas"
          placeholder="Preferencias del cliente, alergias, recordatorios…"
        />
      </Field>
    </div>
  );

  const serviciosTab = (
    <div className="space-y-3">
      <p className="text-sm text-[#625b55]">
        Selecciona los servicios de la cita; el total y duración se recalculan.
      </p>
      {servicios.length === 0 ? (
        <p className="rounded-xl bg-[#f1eeea] p-4 text-sm text-[#625b55]">
          No hay servicios activos. Crea servicios primero.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {servicios.map((servicio) => (
            <label
              className="flex min-h-11 items-center gap-3 rounded-xl border border-[#eee8e3] p-3 text-sm transition-colors hover:border-[#c9a899]"
              key={servicio.id}
            >
              <input
                checked={seleccionados.has(servicio.id)}
                className="size-4 accent-[#8a5140]"
                name="servicioIds"
                onChange={() => toggleServicio(servicio.id)}
                type="checkbox"
                value={servicio.id}
              />
              <span className="flex-1 font-medium">{servicio.nombre}</span>
              <span className="text-xs tabular-nums text-[#625b55]">
                {formatCurrency(servicio.precioBase, { currency })} · {servicio.duracionMinutos} min
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="rounded-xl border border-[#e3d9d1] bg-[#faf6f3] p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">Resumen</h4>
        <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-[#625b55]">Inicio</p>
            <p className="font-semibold tabular-nums">{inicio ? `${inicio.slice(11)} h` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[#625b55]">Fin estimado</p>
            <p className="font-semibold tabular-nums">{resumen.fin ? `${resumen.fin} h` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[#625b55]">Total</p>
            <p className="font-semibold tabular-nums">{formatCurrency(resumen.totalPrecio, { currency })}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <form action={formAction} className="space-y-5">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursal.id} />
      <FormTabs
        tabs={[
          { id: "general", label: "Datos de la cita", content: general },
          { id: "servicios", label: `Servicios (${seleccionados.size})`, content: serviciosTab },
        ]}
      />
      <ActionFeedback state={state} successMessage="Cita guardada correctamente." />
      <div className="flex justify-end">
        <Button className="rounded-xl" disabled={pending} type="submit">
          {pending ? "Guardando..." : initial?.id ? "Guardar cambios" : "Crear cita"}
        </Button>
      </div>
    </form>
  );
}
