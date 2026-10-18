"use client";

import { Check, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useActionState } from "react";

import { saveCita, type CitaActionState } from "@/app/admin/agenda/actions";
import type { AgendaBloqueo, AgendaCita, AgendaHorario } from "@/app/admin/agenda/agenda-types";
import { MediaThumb } from "@/components/media-thumb";
import { Button } from "@/components/ui/button";
import type { ComboboxItem } from "@/components/ui/combobox";
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
import { cn } from "@/lib/utils";
import {
  getZonedParts,
  intervalsOverlap,
  isCitaEditable,
  localDateTimeToUtc,
} from "@/modules/agenda";

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
  horarios = [],
  bloqueos = [],
  citas = [],
  clientes = [],
  currency = "MXN",
  timeZone,
  initial,
  onSuccess,
}: {
  organizationId: string;
  sucursal: { id: string; nombre: string; clave: string };
  staff: Array<{ id: string; nombre: string }>;
  servicios: Array<{ id: string; nombre: string; precioBase: string; duracionMinutos: number; imagenClaveR2?: string | null }>;
  recursos?: Array<{ id: string; nombre: string; tipo: string; capacidad: number }>;
  horarios?: AgendaHorario[];
  bloqueos?: AgendaBloqueo[];
  citas?: AgendaCita[];
  clientes?: Array<{ id: string; nombre: string; telefono?: string | null }>;
  currency?: string;
  timeZone: string;
  initial?: CitaData;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const defaultItems = useMemo(
    () =>
      clientes?.map((c) => ({
        value: c.id,
        label: c.nombre,
        description: c.telefono ?? undefined,
      })),
    [clientes],
  );
  const [state, formAction, pending] = useActionState<CitaActionState, FormData>(saveCita, {});
  const [clienteId, setClienteId] = useState(initial?.clienteId ?? "");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(() => new Set(initial?.servicioIds ?? []));
  const [recursosSel, setRecursosSel] = useState<Set<string>>(() => new Set(initial?.recursoIds ?? []));
  const [inicio, setInicio] = useState(() => toBranchDateTimeInput(initial?.fechaHora ?? "", timeZone));
  const [duracionManual, setDuracionManual] = useState<number>(initial?.duracionMinutos ?? 60);
  const [usuarioId, setUsuarioId] = useState(initial?.usuarioId ?? "");

  // Alta rápida de clientes sin perder selección previa de la cita
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const [nuevasNotas, setNuevasNotas] = useState("");
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [clienteSeleccionadoItem, setClienteSeleccionadoItem] = useState<ComboboxItem | null>(null);

  async function handleCrearClienteRapido() {
    const nombreLimpio = nuevoNombre.trim();
    if (!nombreLimpio || nombreLimpio.length < 2) {
      toast.error("Ingresa el nombre del cliente (mínimo 2 letras).");
      return;
    }
    setGuardandoCliente(true);
    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          nombreCompleto: nombreLimpio,
          telefono: nuevoTelefono.trim() || undefined,
          notasOperativas: nuevasNotas.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { item?: ComboboxItem; error?: string };
      if (!res.ok || !data.item) {
        toast.error(data.error ?? "No se pudo registrar el cliente.");
        return;
      }
      setClienteId(data.item.value);
      setClienteSeleccionadoItem(data.item);
      setMostrarNuevoCliente(false);
      setNuevoNombre("");
      setNuevoTelefono("");
      setNuevasNotas("");
      toast.success(`Cliente «${data.item.label}» registrado y seleccionado.`);
    } catch {
      toast.error("No se pudo conectar para registrar el cliente.");
    } finally {
      setGuardandoCliente(false);
    }
  }

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

  // Análisis de disponibilidad y sugerencia inteligente de estilistas
  const analisisStaff = useMemo(() => {
    if (!inicio || staff.length === 0) {
      return {
        lista: staff.map((s) => ({
          id: s.id,
          nombre: s.nombre,
          disponible: true,
          motivo: "Elige fecha y hora para verificar",
          esHabitual: false,
          minutosOcupadosHoy: 0,
        })),
        sugerido: null,
      };
    }

    const candidatoInicio = localDateTimeToUtc(inicio, timeZone);
    if (!candidatoInicio || Number.isNaN(candidatoInicio.getTime())) {
      return { lista: [], sugerido: null };
    }

    const candidatoFin = new Date(candidatoInicio.getTime() + duracionEfectiva * 60 * 1000);
    const partes = getZonedParts(candidatoInicio, timeZone);
    const diaSemana = partes.diaSemana;
    const iniciaMinutos = partes.minutosDelDia;
    const terminaMinutos = iniciaMinutos + duracionEfectiva;

    // Verificar si la sucursal abre en ese turno
    const turnosHoy = (horarios ?? []).filter((h) => h.diaSemana === diaSemana);
    const dentroDeHorarioSucursal =
      turnosHoy.length === 0 ||
      turnosHoy.some((t) => iniciaMinutos >= t.iniciaMinutos && terminaMinutos <= t.terminaMinutos);

    // Conteo de citas previas del cliente para saber su estilista habitual
    const citasClientePorStaff = new Map<string, number>();
    if (clienteId && citas) {
      for (const c of citas) {
        if (c.clienteId === clienteId && c.usuarioId) {
          citasClientePorStaff.set(c.usuarioId, (citasClientePorStaff.get(c.usuarioId) ?? 0) + 1);
        }
      }
    }

    const intervaloCandidato = {
      iniciaAtMs: candidatoInicio.getTime(),
      terminaAtMs: candidatoFin.getTime(),
    };

    const evaluados = staff.map((profesional) => {
      if (!dentroDeHorarioSucursal) {
        return {
          id: profesional.id,
          nombre: profesional.nombre,
          disponible: false,
          motivo: "Fuera de horario de atención",
          esHabitual: (citasClientePorStaff.get(profesional.id) ?? 0) > 0,
          minutosOcupadosHoy: 0,
        };
      }

      // 1. Bloqueos de este profesional o generales de la sucursal
      const tieneBloqueo = (bloqueos ?? []).some((b) => {
        if (b.usuarioId !== null && b.usuarioId !== profesional.id) return false;
        const bInicio = new Date(b.iniciaAt).getTime();
        const bFin = new Date(b.terminaAt).getTime();
        return intervalsOverlap(intervaloCandidato, { iniciaAtMs: bInicio, terminaAtMs: bFin });
      });

      if (tieneBloqueo) {
        return {
          id: profesional.id,
          nombre: profesional.nombre,
          disponible: false,
          motivo: "En descanso o bloqueo",
          esHabitual: (citasClientePorStaff.get(profesional.id) ?? 0) > 0,
          minutosOcupadosHoy: 0,
        };
      }

      // 2. Traslape con otras citas activas
      const citasProfesional = (citas ?? []).filter(
        (c) => c.usuarioId === profesional.id && c.id !== initial?.id && isCitaEditable(c.estado),
      );

      const traslape = citasProfesional.some((c) => {
        const cStart = new Date(c.fechaHora).getTime();
        const cEnd = cStart + c.duracionMinutos * 60 * 1000;
        return intervalsOverlap(intervaloCandidato, { iniciaAtMs: cStart, terminaAtMs: cEnd });
      });

      const minutosOcupadosHoy = citasProfesional.reduce((acc, c) => acc + c.duracionMinutos, 0);
      const vecesAtendido = citasClientePorStaff.get(profesional.id) ?? 0;

      if (traslape) {
        return {
          id: profesional.id,
          nombre: profesional.nombre,
          disponible: false,
          motivo: "Ocupado con otra cita",
          esHabitual: vecesAtendido > 0,
          minutosOcupadosHoy,
        };
      }

      return {
        id: profesional.id,
        nombre: profesional.nombre,
        disponible: true,
        motivo: `Disponible (${duracionEfectiva} min libres)`,
        esHabitual: vecesAtendido > 0,
        minutosOcupadosHoy,
      };
    });

    const disponibles = evaluados.filter((e) => e.disponible);
    let sugerido: ((typeof evaluados)[number] & { explicacion: string }) | null = null;

    if (disponibles.length > 0) {
      // Prioridad 1: Estilista habitual del cliente si está disponible
      const habitual = disponibles.find((d) => d.esHabitual);
      if (habitual) {
        sugerido = {
          ...habitual,
          explicacion: `Profesional habitual del cliente · Disponible para los ${duracionEfectiva} min`,
        };
      } else {
        // Prioridad 2: El estilista disponible con menor carga hoy
        const ordenados = [...disponibles].sort((a, b) => a.minutosOcupadosHoy - b.minutosOcupadosHoy);
        const mejor = ordenados[0]!;
        sugerido = {
          ...mejor,
          explicacion: `Disponible para el tiempo estimado (${duracionEfectiva} min libres)`,
        };
      }
    }

    return { lista: evaluados, sugerido };
  }, [bloqueos, citas, clienteId, duracionEfectiva, horarios, initial?.id, inicio, staff, timeZone]);

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
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            Cliente
          </label>
          <button
            className="flex items-center gap-1 text-op-xs font-semibold text-primary transition-colors hover:underline"
            onClick={() => setMostrarNuevoCliente((v) => !v)}
            type="button"
          >
            {mostrarNuevoCliente ? "Cancelar registro" : "+ Nuevo cliente"}
          </button>
        </div>

        {mostrarNuevoCliente ? (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 anim-entrada">
            <div className="flex items-center justify-between">
              <p className="text-op-xs font-semibold text-foreground">Alta rápida de cliente</p>
              <span className="text-op-xs text-muted-foreground">Sin salir de la cita</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Field>
                <FieldLabel required>Nombre completo</FieldLabel>
                <Input
                  autoFocus
                  onChange={(e) => setNuevoNombre(e.target.value)}
                  placeholder="ej. Mariana Solís"
                  value={nuevoNombre}
                />
              </Field>
              <Field>
                <FieldLabel>Teléfono</FieldLabel>
                <Input
                  onChange={(e) => setNuevoTelefono(e.target.value)}
                  placeholder="ej. 55 1234 5678"
                  type="tel"
                  value={nuevoTelefono}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel>Notas para el servicio (opcional)</FieldLabel>
              <Input
                onChange={(e) => setNuevasNotas(e.target.value)}
                placeholder="ej. Tinte sin amoniaco, piel sensible"
                value={nuevasNotas}
              />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                onClick={() => setMostrarNuevoCliente(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancelar
              </Button>
              <Button
                disabled={guardandoCliente || nuevoNombre.trim().length < 2}
                onClick={handleCrearClienteRapido}
                size="sm"
                type="button"
              >
                {guardandoCliente ? "Guardando…" : "Guardar y seleccionar"}
              </Button>
            </div>
          </div>
        ) : null}

        <RemoteCombobox
          defaultItems={defaultItems}
          initialItem={
            initial?.clienteId
              ? {
                  value: initial.clienteId,
                  label: initial.clienteNombre ?? "Cliente",
                  description: initial.clienteTelefono ?? undefined,
                }
              : null
          }
          name="clienteId"
          onValueChange={(val, item) => {
            setClienteId(val ?? "");
            setClienteSeleccionadoItem(item);
          }}
          placeholder="Buscar cliente o dejar sin registrar"
          searchUrl={`/api/clientes?organizationId=${organizationId}`}
          selectedItem={clienteSeleccionadoItem}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Servicios de la cita</p>
        {servicios.length === 0 ? (
          <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
            No hay servicios activos. Crea servicios primero.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {servicios.map((servicio) => (
              <label
                className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-3 text-sm transition-colors hover:border-accent-foreground/30"
                key={servicio.id}
              >
                <input
                  checked={seleccionados.has(servicio.id)}
                  className="size-4 accent-primary"
                  name="servicioIds"
                  onChange={() => toggleServicio(servicio.id)}
                  type="checkbox"
                  value={servicio.id}
                />
                <MediaThumb claveR2={servicio.imagenClaveR2} nombre={servicio.nombre} />
                <span className="flex-1 font-medium">{servicio.nombre}</span>
                <span className="text-op-xs tabular-nums text-muted-foreground">
                  {formatCurrency(servicio.precioBase, { currency })} · {servicio.duracionMinutos} min
                </span>
              </label>
            ))}
          </div>
        )}
        {recursos.length > 0 ? (
          <details className="rounded-xl border border-border bg-muted/60 px-4 py-3" open={Boolean(initial?.recursoIds?.length)}>
            <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
              Apartar cabina, silla o equipo (opcional)
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {recursos.map((recurso) => (
                <label
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:border-accent-foreground/30"
                  key={recurso.id}
                >
                  <input
                    checked={recursosSel.has(recurso.id)}
                    className="size-4 accent-primary"
                    name="recursoIds"
                    onChange={() => toggleRecurso(recurso.id)}
                    type="checkbox"
                    value={recurso.id}
                  />
                  <span className="flex-1 font-medium">{recurso.nombre}</span>
                  <span className="text-op-xs uppercase tracking-wide text-muted-foreground">{recurso.tipo}</span>
                </label>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Fecha y hora</FieldLabel>
          <Input
            name="fechaHora"
            onChange={(event) => setInicio(event.target.value)}
            required
            type="datetime-local"
            value={inicio}
          />
          <FieldDescription>Hora local de la sucursal.</FieldDescription>
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
        {/* Tarjeta de Estilista Sugerido si hay recomendación inteligente */}
        {analisisStaff.sugerido ? (
          <div className="sm:col-span-2 rounded-xl border border-primary/25 bg-primary/8 p-3 shadow-sm transition-all">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-op-xs font-bold uppercase tracking-wider text-primary">
                      Profesional sugerido:
                    </span>
                    <span className="font-semibold text-foreground text-sm">
                      {analisisStaff.sugerido.nombre}
                    </span>
                    {analisisStaff.sugerido.esHabitual ? (
                      <span className="rounded bg-primary/20 px-1.5 py-0.5 text-op-xs font-semibold text-primary">
                        Habitual
                      </span>
                    ) : null}
                  </div>
                  <p className="text-op-xs text-muted-foreground truncate">
                    {analisisStaff.sugerido.explicacion}
                  </p>
                </div>
              </div>
              {usuarioId !== analisisStaff.sugerido.id ? (
                <Button
                  className="h-8 rounded-lg text-op-xs font-semibold"
                  onClick={() => setUsuarioId(analisisStaff.sugerido!.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Asignar a {analisisStaff.sugerido.nombre.split(" ")[0]}
                </Button>
              ) : (
                <span className="inline-flex items-center gap-1 text-op-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-md">
                  <Check className="size-3.5" aria-hidden="true" /> Asignado
                </span>
              )}
            </div>
          </div>
        ) : null}

        <Field className="sm:col-span-2">
          <FieldLabel>Profesional asignado</FieldLabel>
          <Select
            name="usuarioId"
            onChange={(event) => setUsuarioId(event.target.value)}
            value={usuarioId}
          >
            <option value="">Sin asignar</option>
            {analisisStaff.lista.length > 0
              ? analisisStaff.lista.map((profesional) => (
                  <option key={profesional.id} value={profesional.id}>
                    {profesional.nombre} — {profesional.disponible ? `Disponible (${duracionEfectiva} min)` : profesional.motivo}
                  </option>
                ))
              : staff.map((profesional) => (
                  <option key={profesional.id} value={profesional.id}>
                    {profesional.nombre}
                  </option>
                ))}
          </Select>

          {/* Botonera interactiva rápida de estilistas con estado en vivo */}
          {staff.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setUsuarioId("")}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-op-xs font-medium transition-colors",
                  usuarioId === ""
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                Sin asignar
              </button>
              {analisisStaff.lista.length > 0
                ? analisisStaff.lista.map((est) => (
                    <button
                      type="button"
                      key={est.id}
                      onClick={() => setUsuarioId(est.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-op-xs font-medium transition-colors",
                        usuarioId === est.id
                          ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      )}
                      title={est.motivo}
                    >
                      <span
                        className={cn(
                          "size-2 rounded-full shrink-0",
                          est.disponible ? "bg-emerald-500" : "bg-amber-500/80"
                        )}
                        aria-hidden="true"
                      />
                      <span>{est.nombre}</span>
                      {est.esHabitual ? (
                        <span className="text-op-xs text-primary font-bold">★ Habitual</span>
                      ) : null}
                    </button>
                  ))
                : staff.map((profesional) => (
                    <button
                      type="button"
                      key={profesional.id}
                      onClick={() => setUsuarioId(profesional.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-op-xs font-medium transition-colors",
                        usuarioId === profesional.id
                          ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary/30"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      )}
                    >
                      <span>{profesional.nombre}</span>
                    </button>
                  ))}
            </div>
          ) : null}
        </Field>
      </div>

      <details className="rounded-xl border border-border bg-muted/60 px-4 py-3" open={Boolean(initial?.notas)}>
        <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
          Agregar nota (opcional)
        </summary>
        <Textarea
          className="mt-3"
          defaultValue={initial?.notas ?? ""}
          name="notas"
          placeholder="Preferencias del cliente, alergias, recordatorios…"
        />
      </details>

      <div className="rounded-xl border border-border bg-muted/60 p-4">
        <h4 className="text-op-xs font-semibold uppercase tracking-wide text-primary">Resumen</h4>
        <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-op-xs text-muted-foreground">Inicio</p>
            <p className="font-semibold tabular-nums">{inicio ? `${inicio.slice(11)} h` : "—"}</p>
          </div>
          <div>
            <p className="text-op-xs text-muted-foreground">Fin estimado</p>
            <p className="font-semibold tabular-nums">{resumen.fin ? `${resumen.fin} h` : "—"}</p>
          </div>
          <div>
            <p className="text-op-xs text-muted-foreground">Total</p>
            <p className="font-semibold tabular-nums">{formatCurrency(resumen.totalPrecio, { currency })}</p>
          </div>
        </div>
      </div>

      <ActionFeedback state={state} successMessage="Cita guardada correctamente." />
      {state.sugerencias && state.sugerencias.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/60 p-3">
          <p className="text-op-xs font-semibold uppercase tracking-wide text-primary">
            Horarios libres sugeridos
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.sugerencias.map((iso) => (
              <button
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-op-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-accent/70"
                key={iso}
                onClick={() => setInicio(toBranchDateTimeInput(iso, timeZone))}
                type="button"
              >
                {formatSugerencia(iso, timeZone)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-op-xs text-muted-foreground">
            Elige una sugerencia para rellenar fecha y hora, luego guarda de nuevo.
          </p>
        </div>
      ) : null}
      <div className="flex justify-end">
        <Button className="rounded-xl" data-action-clave="1" size="lg" data-action-id="agenda.cita.guardar" disabled={pending} type="submit">
          {pending ? "Guardando..." : initial?.id ? "Guardar cambios" : "Crear cita"}
        </Button>
      </div>
    </form>
  );
}
