"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useActionState } from "react";

import { saveCita, type CitaActionState } from "@/app/admin/agenda/actions";
import { Button } from "@/components/ui/button";
import { RemoteCombobox } from "@/components/ui/remote-combobox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { getZonedParts } from "@/modules/agenda";

type CitaData = {
  id?: string;
  organizacionId: string;
  sucursalId: string;
  clienteId?: string | null;
  /** Nombre/teléfono del cliente actual para mostrarlo sin una búsqueda previa. */
  clienteNombre?: string | null;
  clienteTelefono?: string | null;
  usuarioId?: string | null;
  fechaHora: string;
  duracionMinutos: number;
  notas?: string | null;
  /** Versión leída al abrir el formulario (concurrencia optimista). */
  version?: number;
  servicioIds?: string[];
  recursoIds?: string[];
};

function formatSugerencia(iso: string, timeZone: string) {
  return `${formatDate(iso, { timeZone })} · ${formatTime(iso, { timeZone })}`;
}

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
  staff,
  servicios,
  recursos = [],
  currency = "MXN",
  timeZone,
  initial,
  onSuccess,
}: {
  organizationId: string;
  sucursal: { id: string; nombre: string; clave: string };
  staff: Array<{ id: string; nombre: string }>;
  servicios: Array<{ id: string; nombre: string; precioBase: string; duracionMinutos: number }>;
  recursos?: Array<{ id: string; nombre: string; tipo: string; capacidad: number }>;
  currency?: string;
  timeZone: string;
  initial?: CitaData;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, formAction, pending] = useActionState<CitaActionState, FormData>(saveCita, {});
  const [seleccionados, setSeleccionados] = useState<Set<string>>(() => new Set(initial?.servicioIds ?? []));
  const [recursosSel, setRecursosSel] = useState<Set<string>>(() => new Set(initial?.recursoIds ?? []));
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

  const toggleRecurso = (id: string) => {
    setRecursosSel((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <form action={formAction} className="space-y-5">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursal.id} />
      <input name="duracionMinutos" type="hidden" value={duracionEfectiva} />
      {initial?.version !== undefined ? (
        <input name="version" type="hidden" value={initial.version} />
      ) : null}

      {/* Flujo lineal sin pestañas: cliente → servicios → cuándo/quién →
          extras plegados. Una sola acción primaria al final. */}
      <RemoteCombobox
        initialItem={
          initial?.clienteId
            ? {
                value: initial.clienteId,
                label: initial.clienteNombre ?? "Cliente",
                description: initial.clienteTelefono ?? undefined,
              }
            : null
        }
        label="Cliente"
        name="clienteId"
        placeholder="Buscar cliente o dejar walk-in"
        searchUrl={`/api/clientes?organizationId=${organizationId}`}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Servicios de la cita</p>
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
        {recursos.length > 0 ? (
          <details className="rounded-xl border border-[#eee8e3] bg-[#faf9f7] px-4 py-3" open={Boolean(initial?.recursoIds?.length)}>
            <summary className="cursor-pointer list-none text-sm font-medium text-[#625b55] hover:text-[#8a5140]">
              Apartar cabina, silla o equipo (opcional)
            </summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {recursos.map((recurso) => (
                <label
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-[#eee8e3] bg-white p-3 text-sm transition-colors hover:border-[#c9a899]"
                  key={recurso.id}
                >
                  <input
                    checked={recursosSel.has(recurso.id)}
                    className="size-4 accent-[#8a5140]"
                    name="recursoIds"
                    onChange={() => toggleRecurso(recurso.id)}
                    type="checkbox"
                    value={recurso.id}
                  />
                  <span className="flex-1 font-medium">{recurso.nombre}</span>
                  <span className="text-[10px] uppercase tracking-wide text-[#6e6159]">{recurso.tipo}</span>
                </label>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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
        {seleccionados.size === 0 ? (
          <Field>
            <FieldLabel required>Duración (minutos)</FieldLabel>
            <Input
              max={1440}
              min={5}
              onChange={(event) => setDuracionManual(Math.max(5, Number(event.target.value) || 5))}
              required
              type="number"
              value={duracionEfectiva}
            />
          </Field>
        ) : null}
        <Field className={seleccionados.size === 0 ? "sm:col-span-2" : undefined}>
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
      </div>

      <details className="rounded-xl border border-[#eee8e3] bg-[#faf9f7] px-4 py-3" open={Boolean(initial?.notas)}>
        <summary className="cursor-pointer list-none text-sm font-medium text-[#625b55] hover:text-[#8a5140]">
          Agregar nota (opcional)
        </summary>
        <Textarea
          className="mt-3"
          defaultValue={initial?.notas ?? ""}
          name="notas"
          placeholder="Preferencias del cliente, alergias, recordatorios…"
        />
      </details>

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

      <ActionFeedback state={state} successMessage="Cita guardada correctamente." />
      {state.sugerencias && state.sugerencias.length > 0 ? (
        <div className="rounded-xl border border-[#e3d9d1] bg-[#faf6f3] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
            Horarios libres sugeridos
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.sugerencias.map((iso) => (
              <button
                className="rounded-lg border border-[#e3d9d1] bg-white px-3 py-1.5 text-xs font-medium text-[#403a35] transition-colors hover:border-[#8a5140] hover:bg-[#f2e3dc]"
                key={iso}
                onClick={() => setInicio(toBranchDateTimeInput(iso, timeZone))}
                type="button"
              >
                {formatSugerencia(iso, timeZone)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#6e6159]">
            Elige una sugerencia para rellenar fecha y hora, luego guarda de nuevo.
          </p>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button className="rounded-xl" data-action-clave="1" data-action-id="agenda.cita.guardar" disabled={pending} type="submit">
          {pending ? "Guardando..." : initial?.id ? "Guardar cambios" : "Crear cita"}
        </Button>
      </div>
    </form>
  );
}
