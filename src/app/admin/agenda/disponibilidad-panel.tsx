"use client";

import { CalendarClock, Plus, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  saveBloqueoAgenda,
  saveHorarioSucursal,
  saveRecurso,
  toggleBloqueoAgenda,
  toggleHorarioSucursal,
  toggleRecurso,
  updateCapacidadSinAsignar,
  updateRecordatoriosConfig,
  updateReservasConfig,
  type CitaMutationResult,
} from "@/app/admin/agenda/actions";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatTime } from "@/lib/format";
import { RECURSO_TIPOS } from "@/db/schema/operations";
import { BLOQUEO_TIPOS } from "@/modules/agenda";
import type { AvisoReciente } from "@/modules/notificaciones/service";
import { cn } from "@/lib/utils";

export type HorarioConfig = {
  id: string;
  diaSemana: number;
  iniciaMinutos: number;
  terminaMinutos: number;
  activo: boolean;
};

export type BloqueoConfig = {
  id: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  iniciaAt: string;
  terminaAt: string;
  tipo: string;
  motivo: string | null;
  activo: boolean;
};

const ETIQUETA_AVISO: Record<string, string> = {
  confirmacion: "Confirmación",
  solicitud: "Solicitud recibida",
  recordatorio: "Recordatorio",
  cambio: "Cambio de horario",
  cancelacion: "Cancelación",
};

const ETIQUETA_ESTADO_AVISO: Record<string, string> = {
  pendiente: "Programado",
  enviando: "Enviando",
  enviado: "Aceptado",
  fallido: "Fallido",
  omitido: "Omitido",
};

const TONO_ESTADO_AVISO: Record<string, "success" | "warning" | "info" | "destructive" | "neutral"> = {
  pendiente: "info",
  enviando: "info",
  enviado: "success",
  fallido: "destructive",
  omitido: "neutral",
};

export type RecursoConfig = {
  id: string;
  nombre: string;
  tipo: string;
  capacidad: number;
  activo: boolean;
};

const DIAS = [
  { dia: 1, nombre: "Lunes" },
  { dia: 2, nombre: "Martes" },
  { dia: 3, nombre: "Miércoles" },
  { dia: 4, nombre: "Jueves" },
  { dia: 5, nombre: "Viernes" },
  { dia: 6, nombre: "Sábado" },
  { dia: 0, nombre: "Domingo" },
];

const BLOQUEO_LABEL: Record<string, string> = {
  descanso: "Descanso",
  cierre: "Cierre",
  personal: "Personal",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
};

const BLOQUEO_TIPO_LABEL: Record<(typeof BLOQUEO_TIPOS)[number], string> = {
  descanso: "Descanso",
  cierre: "Cierre de sucursal",
  personal: "Tiempo personal",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
};

const RECURSO_TIPO_LABEL: Record<(typeof RECURSO_TIPOS)[number], string> = {
  cabina: "Cabina",
  silla: "Silla",
  equipo: "Equipo",
  otro: "Otro",
};

function minutosATexto(minutos: number) {
  const hh = String(Math.floor(minutos / 60)).padStart(2, "0");
  const mm = String(minutos % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function textoAMinutos(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Panel de configuración operativa de la agenda: turnos de atención por día,
 * bloqueos (descansos/cierres) y capacidad del carril "sin asignar". Todo se
 * guarda por server action con auditoría y refresco del board.
 */
export function DisponibilidadPanel({
  organizationId,
  organizacionSlug,
  sucursalId,
  horarios,
  bloqueos,
  recursos,
  staff,
  capacidadSinAsignar,
  reservasOnline,
  reservasAutoConfirmar,
  reservasCancelacionHoras,
  reservasAnticipacionMinutos,
  reservasHorizonteDias,
  recordatoriosActivos,
  recordatoriosHorasAntes,
  permiteReservasOnline,
  permiteAutoConfirmar,
  permiteRecordatorios,
  avisos,
  timeZone,
}: {
  organizationId: string;
  /** Slug público de la organización para construir el enlace de reservas. */
  organizacionSlug: string;
  sucursalId: string;
  horarios: HorarioConfig[];
  bloqueos: BloqueoConfig[];
  recursos: RecursoConfig[];
  staff: Array<{ id: string; nombre: string }>;
  capacidadSinAsignar: number;
  reservasOnline: boolean;
  reservasAutoConfirmar: boolean;
  /** Política pública de la sucursal: corte de cambios, anticipación y horizonte. */
  reservasCancelacionHoras: number;
  reservasAnticipacionMinutos: number;
  reservasHorizonteDias: number;
  recordatoriosActivos: boolean;
  recordatoriosHorasAntes: number;
  /** Capacidades del plan vigente: la UI deshabilita lo que el plan no incluye. */
  permiteReservasOnline: boolean;
  permiteAutoConfirmar: boolean;
  permiteRecordatorios: boolean;
  /** Últimos avisos de cita encolados/enviados (bitácora operativa). */
  avisos: AvisoReciente[];
  timeZone: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [capacidad, setCapacidad] = useState(String(capacidadSinAsignar));
  const [reservas, setReservas] = useState(reservasOnline);
  const [autoConfirmar, setAutoConfirmar] = useState(reservasAutoConfirmar);
  const [cancelacionHoras, setCancelacionHoras] = useState(String(reservasCancelacionHoras));
  const [anticipacionMinutos, setAnticipacionMinutos] = useState(String(reservasAnticipacionMinutos));
  const [horizonteDias, setHorizonteDias] = useState(String(reservasHorizonteDias));
  const [recordatorios, setRecordatorios] = useState(recordatoriosActivos);
  const [horasAntes, setHorasAntes] = useState(String(recordatoriosHorasAntes));
  const [bloqueoTipo, setBloqueoTipo] = useState<(typeof BLOQUEO_TIPOS)[number]>("personal");
  const [bloqueoUsuario, setBloqueoUsuario] = useState("");

  const run = (action: Promise<CitaMutationResult>, fallback: string) => {
    startTransition(async () => {
      try {
        const result = await action;
        if (result.success) {
          toast.success(result.message ?? "Cambio aplicado.");
          router.refresh();
        } else {
          toast.error(result.error ?? fallback);
        }
      } catch (error) {
        console.error(error);
        toast.error(fallback);
      }
    });
  };

  const guardarTurno = (diaSemana: number, inicio: string, fin: string) => {
    const iniciaMinutos = textoAMinutos(inicio);
    const terminaMinutos = textoAMinutos(fin);
    if (iniciaMinutos === null || terminaMinutos === null) {
      toast.error("Indica horas válidas (HH:MM).");
      return;
    }
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("sucursalId", sucursalId);
    data.set("diaSemana", String(diaSemana));
    data.set("iniciaMinutos", String(iniciaMinutos));
    data.set("terminaMinutos", String(terminaMinutos));
    run(saveHorarioSucursal(data), "No se pudo guardar el horario.");
  };

  const alternarTurno = (horario: HorarioConfig) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("id", horario.id);
    data.set("activo", String(horario.activo));
    run(toggleHorarioSucursal(data), "No se pudo actualizar el horario.");
  };

  const guardarBloqueo = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("organizacionId", organizationId);
    data.set("sucursalId", sucursalId);
    run(
      saveBloqueoAgenda(data).then((result) => {
        if (result.success) form.reset();
        return result;
      }),
      "No se pudo crear el bloqueo.",
    );
  };

  const alternarBloqueo = (bloqueo: BloqueoConfig) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("id", bloqueo.id);
    data.set("activo", String(bloqueo.activo));
    run(toggleBloqueoAgenda(data), "No se pudo actualizar el bloqueo.");
  };

  const guardarRecurso = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("organizacionId", organizationId);
    data.set("sucursalId", sucursalId);
    run(
      saveRecurso(data).then((result) => {
        if (result.success) form.reset();
        return result;
      }),
      "No se pudo registrar el recurso.",
    );
  };

  const alternarRecurso = (recurso: RecursoConfig) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("id", recurso.id);
    data.set("activo", String(recurso.activo));
    run(toggleRecurso(data), "No se pudo actualizar el recurso.");
  };

  const guardarCapacidad = () => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("sucursalId", sucursalId);
    data.set("capacidadSinAsignar", capacidad);
    run(updateCapacidadSinAsignar(data), "No se pudo actualizar la capacidad.");
  };

  const guardarReservas = () => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("sucursalId", sucursalId);
    data.set("reservasOnline", String(reservas));
    data.set("reservasAutoConfirmar", String(autoConfirmar));
    data.set("reservasCancelacionHoras", cancelacionHoras);
    data.set("reservasAnticipacionMinutos", anticipacionMinutos);
    data.set("reservasHorizonteDias", horizonteDias);
    run(updateReservasConfig(data), "No se pudo actualizar las reservas en línea.");
  };

  const guardarRecordatorios = () => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("recordatoriosActivos", String(recordatorios));
    data.set("recordatoriosHorasAntes", horasAntes);
    run(updateRecordatoriosConfig(data), "No se pudo actualizar los recordatorios.");
  };

  const bloqueosOrdenados = [...bloqueos].sort(
    (a, b) => Number(b.activo) - Number(a.activo) || a.iniciaAt.localeCompare(b.iniciaAt),
  );

  return (
    <details className="group rounded-2xl border border-[#eadfd8] bg-white shadow-sm">
      <summary className="flex cursor-pointer items-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold text-[#403a35] select-none hover:bg-[#faf9f7]">
        <Settings2 aria-hidden="true" className="size-4 text-[#8a5140]" />
        Disponibilidad de la sucursal
        <span className="text-xs font-normal text-[#81746c]">
          horarios, bloqueos y citas sin asignar
        </span>
        <span className="ml-auto text-xs text-[#8a5140] group-open:hidden">Configurar</span>
        <span className="ml-auto hidden text-xs text-[#8a5140] group-open:inline">Cerrar</span>
      </summary>

      <div className="grid gap-6 border-t border-[#eee8e3] px-5 py-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ------------------------- Horario semanal ------------------------- */}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
            Horario de atención
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {DIAS.map(({ dia, nombre }) => {
              const turnos = horarios.filter((horario) => horario.diaSemana === dia);
              return (
                <div className="rounded-xl border border-[#eee8e3] bg-[#faf9f7] p-3" key={dia}>
                  <p className="text-xs font-semibold text-[#625b55]">{nombre}</p>
                  <div className="mt-2 space-y-1.5">
                    {turnos.length === 0 ? (
                      <p className="text-[11px] text-[#a89f97]">Cerrado</p>
                    ) : (
                      turnos.map((turno) => (
                        <button
                          aria-label={
                            turno.activo
                              ? `Desactivar turno ${minutosATexto(turno.iniciaMinutos)}–${minutosATexto(turno.terminaMinutos)}`
                              : `Reactivar turno ${minutosATexto(turno.iniciaMinutos)}–${minutosATexto(turno.terminaMinutos)}`
                          }
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2 py-1 text-xs tabular-nums transition-colors",
                            turno.activo
                              ? "bg-white text-[#403a35] hover:bg-[#fdf1ee]"
                              : "bg-[#f1eeea] text-[#a89f97] line-through hover:bg-[#eaf5ed]",
                          )}
                          disabled={pending}
                          key={turno.id}
                          onClick={() => alternarTurno(turno)}
                          title={turno.activo ? "Clic para desactivar" : "Clic para reactivar"}
                          type="button"
                        >
                          {minutosATexto(turno.iniciaMinutos)}–{minutosATexto(turno.terminaMinutos)}
                          <span className="text-[10px]">{turno.activo ? "activo" : "inactivo"}</span>
                        </button>
                      ))
                    )}
                  </div>
                  <TurnoForm disabled={pending} onAdd={(inicio, fin) => guardarTurno(dia, inicio, fin)} />
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[#81746c]">
            Para huecos intermedios (comida, limpieza) registra dos turnos por día, p. ej. 09:00–14:00 y 16:00–20:00.
          </p>
        </section>

        <div className="space-y-6">
          {/* --------------------- Capacidad sin asignar --------------------- */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
              Citas sin profesional asignado
            </h3>
            <div className="flex items-end gap-2">
              <Field className="w-32">
                <FieldLabel>Capacidad</FieldLabel>
                <Input
                  min={1}
                  max={50}
                  onChange={(event) => setCapacidad(event.target.value)}
                  type="number"
                  value={capacidad}
                />
              </Field>
              <Button
                className="rounded-xl"
                disabled={pending || capacidad === String(capacidadSinAsignar)}
                onClick={guardarCapacidad}
                type="button"
                variant="outline"
              >
                Guardar
              </Button>
            </div>
            <p className="text-xs leading-5 text-[#81746c]">
              Cuántas citas sin asignar pueden coexistir en el mismo horario. 1 = solo una a la vez;
              súbelo si recepción agenda varias y asigna profesional al llegar.
            </p>
          </section>

          {/* ---------------------- Reservas en línea ---------------------- */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
              Reservas en línea
            </h3>
            <label className="flex items-start gap-2 text-sm text-[#403a35]">
              <input
                checked={reservas}
                className="mt-0.5 size-4 accent-[#8a5140] disabled:opacity-50"
                disabled={!permiteReservasOnline}
                onChange={(event) => setReservas(event.target.checked)}
                type="checkbox"
              />
              <span>
                Permitir que clientes reserven desde el portal público.
                <span className="block text-xs text-[#81746c]">
                  Las reservas web usan el carril «sin asignar» y aparecen en la agenda.
                </span>
                {!permiteReservasOnline ? (
                  <span className="block text-xs font-medium text-[#a76348]">
                    No está incluido en tu plan actual.
                  </span>
                ) : null}
              </span>
            </label>
            {reservas ? (
              <>
                <label className="flex items-start gap-2 pl-6 text-sm text-[#403a35]">
                  <input
                    checked={autoConfirmar}
                    className="mt-0.5 size-4 accent-[#8a5140] disabled:opacity-50"
                    disabled={!permiteAutoConfirmar}
                    onChange={(event) => setAutoConfirmar(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    Confirmar automáticamente.
                    <span className="block text-xs text-[#81746c]">
                      Si lo desactivas, cada reserva queda pendiente hasta que el equipo la confirme.
                    </span>
                    {!permiteAutoConfirmar ? (
                      <span className="block text-xs font-medium text-[#a76348]">
                        Disponible en el plan Crecimiento.
                      </span>
                    ) : null}
                  </span>
                </label>
                <div className="grid gap-3 pl-6 sm:grid-cols-3">
                  <label className="text-xs font-medium text-[#625b55]">
                    Anticipación mínima (min)
                    <input
                      className="mt-1 w-full rounded-lg border border-[#e5d9d0] px-3 py-2 text-sm disabled:opacity-50"
                      min={0}
                      onChange={(event) => setAnticipacionMinutos(event.target.value)}
                      type="number"
                      value={anticipacionMinutos}
                    />
                    <span className="mt-0.5 block font-normal text-[#81746c]">
                      Reservas con al menos esta anticipación.
                    </span>
                  </label>
                  <label className="text-xs font-medium text-[#625b55]">
                    Horizonte (días)
                    <input
                      className="mt-1 w-full rounded-lg border border-[#e5d9d0] px-3 py-2 text-sm disabled:opacity-50"
                      min={1}
                      onChange={(event) => setHorizonteDias(event.target.value)}
                      type="number"
                      value={horizonteDias}
                    />
                    <span className="mt-0.5 block font-normal text-[#81746c]">
                      Qué tan adelante pueden reservar.
                    </span>
                  </label>
                  <label className="text-xs font-medium text-[#625b55]">
                    Corte de cambios (h)
                    <input
                      className="mt-1 w-full rounded-lg border border-[#e5d9d0] px-3 py-2 text-sm disabled:opacity-50"
                      min={0}
                      onChange={(event) => setCancelacionHoras(event.target.value)}
                      type="number"
                      value={cancelacionHoras}
                    />
                    <span className="mt-0.5 block font-normal text-[#81746c]">
                      Cancelar/reagendar en línea hasta antes de la cita.
                    </span>
                  </label>
                </div>
                <p className="break-all rounded-lg bg-[#f4f1ee] px-3 py-2 text-xs text-[#625b55]">
                  Enlace para tus clientes:{" "}
                  <span className="font-medium text-[#8a5140]">/reservar/{organizacionSlug}</span>
                </p>
              </>
            ) : null}
            <Button
              className="rounded-xl"
              disabled={
                pending ||
                (reservas === reservasOnline &&
                  (autoConfirmar === reservasAutoConfirmar || !reservas) &&
                  cancelacionHoras === String(reservasCancelacionHoras) &&
                  anticipacionMinutos === String(reservasAnticipacionMinutos) &&
                  horizonteDias === String(reservasHorizonteDias))
              }
              onClick={guardarReservas}
              type="button"
              variant="outline"
            >
              Guardar reservas
            </Button>
          </section>

          {/* --------------------- Recordatorios por correo --------------------- */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
              Recordatorios por correo
            </h3>
            <label className="flex items-start gap-2 text-sm text-[#403a35]">
              <input
                checked={recordatorios}
                className="mt-0.5 size-4 accent-[#8a5140] disabled:opacity-50"
                disabled={!permiteRecordatorios}
                onChange={(event) => setRecordatorios(event.target.checked)}
                type="checkbox"
              />
              <span>
                Enviar recordatorio automático a clientes con correo.
                <span className="block text-xs text-[#81746c]">
                  Aplica a toda la organización; solo citas pendientes o confirmadas.
                </span>
                {!permiteRecordatorios ? (
                  <span className="block text-xs font-medium text-[#a76348]">
                    Disponible en el plan Crecimiento.
                  </span>
                ) : null}
              </span>
            </label>
            {recordatorios ? (
              <div className="flex items-end gap-2 pl-6">
                <Field className="w-36">
                  <FieldLabel>Horas antes</FieldLabel>
                  <Input
                    min={1}
                    max={168}
                    onChange={(event) => setHorasAntes(event.target.value)}
                    type="number"
                    value={horasAntes}
                  />
                </Field>
                <p className="pb-2 text-xs text-[#81746c]">24 = un día antes de la cita.</p>
              </div>
            ) : null}
            <Button
              className="rounded-xl"
              disabled={
                pending ||
                (recordatorios === recordatoriosActivos &&
                  horasAntes === String(recordatoriosHorasAntes))
              }
              onClick={guardarRecordatorios}
              type="button"
              variant="outline"
            >
              Guardar recordatorios
            </Button>
          </section>

          {/* --------------------- Últimos avisos de cita --------------------- */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
              Últimos avisos de cita
            </h3>
            {avisos.length === 0 ? (
              <p className="text-xs text-[#81746c]">
                Aún no hay avisos. Las confirmaciones, cambios, cancelaciones y recordatorios por correo aparecen aquí.
              </p>
            ) : (
              <ul className="divide-y divide-[#eee8e3] rounded-xl border border-[#eee8e3]">
                {avisos.map((aviso) => (
                  <li className="flex items-center justify-between gap-3 px-3 py-2" key={aviso.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#403a35]">
                        {ETIQUETA_AVISO[aviso.tipo] ?? aviso.tipo} · {aviso.correoDestino}
                      </p>
                      <p className="text-xs text-[#81746c]">
                        {aviso.citaFechaHora
                          ? `Cita: ${formatDate(aviso.citaFechaHora, { timeZone })} ${formatTime(aviso.citaFechaHora, { timeZone })}`
                          : `Programado: ${formatDate(aviso.programadoPara, { timeZone })} ${formatTime(aviso.programadoPara, { timeZone })}`}
                        {aviso.error ? ` · ${aviso.error}` : ""}
                      </p>
                    </div>
                    <StatusBadge tone={TONO_ESTADO_AVISO[aviso.estado] ?? "neutral"}>
                      {ETIQUETA_ESTADO_AVISO[aviso.estado] ?? aviso.estado}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-[#81746c]">
              «Aceptado» significa que el proveedor de correo recibió el envío; no garantiza que el cliente lo haya leído.
            </p>
          </section>

          {/* ---------------------------- Bloqueos ---------------------------- */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
              Bloqueos de agenda
            </h3>
            <form className="grid gap-2 rounded-xl border border-[#eee8e3] bg-[#faf9f7] p-3" onSubmit={guardarBloqueo}>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field>
                  <FieldLabel required>Tipo</FieldLabel>
                  <Select
                    name="tipo"
                    onChange={(event) => setBloqueoTipo(event.target.value as typeof bloqueoTipo)}
                    value={bloqueoTipo}
                  >
                    {BLOQUEO_TIPOS.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {BLOQUEO_TIPO_LABEL[tipo]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Profesional</FieldLabel>
                  <Select name="usuarioId" onChange={(event) => setBloqueoUsuario(event.target.value)} value={bloqueoUsuario}>
                    <option value="">Toda la sucursal</option>
                    {staff.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <FieldLabel required>Inicio</FieldLabel>
                  <Input name="iniciaAt" required type="datetime-local" />
                </Field>
                <Field>
                  <FieldLabel required>Fin</FieldLabel>
                  <Input name="terminaAt" required type="datetime-local" />
                </Field>
              </div>
              <Field>
                <FieldLabel>Motivo</FieldLabel>
                <Input name="motivo" placeholder="Vacaciones, comida, junta…" />
              </Field>
              <div className="flex justify-end">
                <Button className="rounded-xl" disabled={pending} size="sm" type="submit" variant="outline">
                  <Plus aria-hidden="true" /> Agregar bloqueo
                </Button>
              </div>
              <p className="text-[11px] text-[#a89f97]">
                Las horas se interpretan en {timeZone}. Un bloqueo de toda la sucursal impide cualquier cita en ese rango.
              </p>
            </form>

            {bloqueosOrdenados.length === 0 ? (
              <p className="rounded-xl bg-[#f8f7f5] px-4 py-3 text-xs text-[#81746c]">Sin bloqueos registrados.</p>
            ) : (
              <ul className="space-y-1.5">
                {bloqueosOrdenados.slice(0, 12).map((bloqueo) => (
                  <li
                    className={cn(
                      "flex items-center gap-3 rounded-xl border border-[#eee8e3] px-3 py-2 text-xs",
                      !bloqueo.activo && "opacity-55",
                    )}
                    key={bloqueo.id}
                  >
                    <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-[#8a5140]" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#403a35]">
                        {formatDate(bloqueo.iniciaAt, { timeZone })} ·{" "}
                        {formatTime(bloqueo.iniciaAt, { timeZone })}–{formatTime(bloqueo.terminaAt, { timeZone })}
                      </p>
                      <p className="truncate text-[#81746c]">
                        {BLOQUEO_LABEL[bloqueo.tipo] ?? bloqueo.tipo} ·{" "}
                        {bloqueo.usuarioId ? (bloqueo.usuarioNombre ?? "Profesional") : "Toda la sucursal"}
                        {bloqueo.motivo ? ` · ${bloqueo.motivo}` : ""}
                      </p>
                    </div>
                    {!bloqueo.activo ? <StatusBadge tone="neutral">inactivo</StatusBadge> : null}
                    <Button
                      disabled={pending}
                      onClick={() => alternarBloqueo(bloqueo)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {bloqueo.activo ? "Desactivar" : "Reactivar"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------------------------- Recursos ---------------------------- */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
              Recursos (cabinas, sillas, equipo)
            </h3>
            <form className="grid gap-2 rounded-xl border border-[#eee8e3] bg-[#faf9f7] p-3" onSubmit={guardarRecurso}>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field className="sm:col-span-2">
                  <FieldLabel required>Nombre</FieldLabel>
                  <Input name="nombre" placeholder="Cabina 1, Silla de manicura…" required />
                </Field>
                <Field>
                  <FieldLabel required>Tipo</FieldLabel>
                  <Select defaultValue="cabina" name="tipo">
                    {RECURSO_TIPOS.map((tipo: (typeof RECURSO_TIPOS)[number]) => (
                      <option key={tipo} value={tipo}>
                        {RECURSO_TIPO_LABEL[tipo]}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Field>
                  <FieldLabel required>Capacidad</FieldLabel>
                  <Input defaultValue={1} max={100} min={1} name="capacidad" required type="number" />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>Notas</FieldLabel>
                  <Input name="notas" placeholder="Ubicación, restricciones de uso…" />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button className="rounded-xl" disabled={pending} size="sm" type="submit" variant="outline">
                  <Plus aria-hidden="true" /> Agregar recurso
                </Button>
              </div>
              <p className="text-[11px] text-[#a89f97]">
                Capacidad mayor a 1 registra recursos compartibles (p. ej. 2 sillas iguales). Las citas
                que reserven el recurso no podrán traslaparse más allá de su capacidad.
              </p>
            </form>

            {recursos.length === 0 ? (
              <p className="rounded-xl bg-[#f8f7f5] px-4 py-3 text-xs text-[#81746c]">Sin recursos registrados.</p>
            ) : (
              <ul className="space-y-1.5">
                {recursos.map((recurso) => (
                  <li
                    className={cn(
                      "flex items-center gap-3 rounded-xl border border-[#eee8e3] px-3 py-2 text-xs",
                      !recurso.activo && "opacity-55",
                    )}
                    key={recurso.id}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#403a35]">{recurso.nombre}</p>
                      <p className="truncate text-[#81746c]">
                        {RECURSO_TIPO_LABEL[recurso.tipo as (typeof RECURSO_TIPOS)[number]] ?? recurso.tipo}
                        {recurso.capacidad > 1 ? ` · capacidad ${recurso.capacidad}` : ""}
                      </p>
                    </div>
                    {!recurso.activo ? <StatusBadge tone="neutral">inactivo</StatusBadge> : null}
                    <Button
                      disabled={pending}
                      onClick={() => alternarRecurso(recurso)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {recurso.activo ? "Desactivar" : "Reactivar"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </details>
  );
}

/** Mini-formulario por día para agregar un turno (HH:MM – HH:MM). */
function TurnoForm({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (inicio: string, fin: string) => void;
}) {
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <Input
        aria-label="Inicio del turno"
        className="h-8 px-1.5 text-xs"
        onChange={(event) => setInicio(event.target.value)}
        type="time"
        value={inicio}
      />
      <Input
        aria-label="Fin del turno"
        className="h-8 px-1.5 text-xs"
        onChange={(event) => setFin(event.target.value)}
        type="time"
        value={fin}
      />
      <Button
        aria-label="Agregar turno"
        className="h-8 shrink-0 rounded-lg px-2"
        disabled={disabled || !inicio || !fin}
        onClick={() => {
          onAdd(inicio, fin);
          setInicio("");
          setFin("");
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}
