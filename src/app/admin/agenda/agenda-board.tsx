"use client";

import { CalendarPlus, Clock3 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from "react";

import {
  moveCita,
  rescheduleCita,
  toggleCitaActiva,
  updateCitaEstado,
  type CitaMutationResult,
} from "@/app/admin/agenda/actions";
import { CheckoutSheet } from "@/app/admin/agenda/checkout-sheet";
import { CitaForm } from "@/app/admin/agenda/cita-form";
import {
  CitaSidePanel,
  CitaStatusBadge,
  ESTADO_LABEL,
} from "@/app/admin/agenda/cita-side-panel";
import { iniciarVentaDeCita } from "@/app/admin/pos/actions";
import { AdminCard } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel, Input, Select } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";
import {
  dayBoundsUtc,
  getZonedParts,
  localDateTimeToUtc,
} from "@/modules/agenda";

export type AgendaCita = {
  id: string;
  fechaHora: string;
  duracionMinutos: number;
  estado: string;
  notas: string | null;
  totalEstimado: string;
  clienteId: string | null;
  clienteNombre: string;
  clienteTelefono: string | null;
  clienteNotas: string | null;
  sucursalId: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  /** Concurrencia optimista: se envía en cada mutación. */
  version: number;
  ventaId: string | null;
  servicios: Array<{ id: string; nombre: string; precio: string }>;
  recursos: Array<{ id: string; nombre: string }>;
};

export type AgendaRecurso = {
  id: string;
  nombre: string;
  tipo: string;
  capacidad: number;
};

export type AgendaHorario = {
  diaSemana: number;
  iniciaMinutos: number;
  terminaMinutos: number;
};

export type AgendaBloqueo = {
  id: string;
  usuarioId: string | null;
  iniciaAt: string;
  terminaAt: string;
  tipo: string;
  motivo: string | null;
};

type AgendaVista = "dia" | "semana" | "lista";
type MoveMode = "mover" | "reagendar";

const FALLBACK_START = 8 * 60;
const FALLBACK_END = 21 * 60;
const HOUR_PX = 80;
const PX_PER_MIN = HOUR_PX / 60;

// Fondo/texto de la tarjeta; el estado además pinta la franja border-l-4.
const ESTADO_STYLE: Record<string, string> = {
  pendiente: "bg-[#f1eeea] text-[#625b55]",
  confirmada: "bg-[#eef4fa] text-[#3a5a7a]",
  en_proceso: "bg-[#fdf3e8] text-[#986b16]",
  completada: "bg-[#eaf5ed] text-[#347052]",
  cancelada: "bg-[#fdf1ee] text-[#a8443a]",
  no_asistio: "bg-[#f3efe8] text-[#8a7b72]",
};

const ESTADO_STRIPE: Record<string, string> = {
  pendiente: "border-l-[#b4aaa0]",
  confirmada: "border-l-[#7fa8cc]",
  en_proceso: "border-l-[#dfa94e]",
  completada: "border-l-[#58a374]",
  cancelada: "border-l-[#c96a58]",
  no_asistio: "border-l-[#9a8d82]",
};

const BLOQUEO_LABEL: Record<string, string> = {
  descanso: "Descanso",
  cierre: "Cierre",
  personal: "Personal",
  mantenimiento: "Mantenimiento",
  otro: "Otro",
};

/** Breakpoint `xl` de Tailwind (80rem) como media query para el split-view. */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function dateTimeInputValue(iso: string, timeZone: string) {
  const parts = getZonedParts(new Date(iso), timeZone);
  return `${parts.dayKey}T${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function citaInterval(cita: AgendaCita) {
  const iniciaAtMs = new Date(cita.fechaHora).getTime();
  return { iniciaAtMs, terminaAtMs: iniciaAtMs + cita.duracionMinutos * 60_000 };
}

function CitaCard({
  cita,
  currency,
  timeZone,
  draggable = false,
  onClick,
  onDragEnd,
  onDragStart,
  className,
  style,
}: {
  cita: AgendaCita;
  currency: string;
  timeZone: string;
  draggable?: boolean;
  onClick?: () => void;
  onDragEnd?: () => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const servicios = cita.servicios.map((servicio) => servicio.nombre).join(", ");
  return (
    <button
      aria-label={`${ESTADO_LABEL[cita.estado] ?? cita.estado}, ${formatTime(cita.fechaHora, { timeZone })}, ${cita.clienteNombre}`}
      className={cn(
        "w-full overflow-hidden rounded-xl border border-[#eadfd8] border-l-4 p-2 text-left shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:z-10",
        draggable && "cursor-grab active:cursor-grabbing",
        ESTADO_STYLE[cita.estado] ?? ESTADO_STYLE.pendiente,
        ESTADO_STRIPE[cita.estado] ?? ESTADO_STRIPE.pendiente,
        className,
      )}
      draggable={draggable}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      style={style}
      type="button"
    >
      <span className="flex items-center justify-between gap-2 text-[13px] font-semibold">
        <span className="truncate">
          {formatTime(cita.fechaHora, { timeZone })} · {cita.clienteNombre}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-xs opacity-80">
        {servicios || "Sin servicios"}
      </span>
      <span className="mt-0.5 block text-xs tabular-nums opacity-70">
        {formatCurrency(cita.totalEstimado, { currency })}
      </span>
    </button>
  );
}

function MoveCitaDialog({
  cita,
  mode,
  pending,
  staff,
  timeZone,
  onClose,
  onSubmit,
}: {
  cita: AgendaCita | null;
  mode: MoveMode | null;
  pending: boolean;
  staff: Array<{ id: string; nombre: string }>;
  timeZone: string;
  onClose: () => void;
  onSubmit: (fechaHora: string, usuarioId: string | null) => Promise<CitaMutationResult>;
}) {
  const initial = cita ? dateTimeInputValue(cita.fechaHora, timeZone) : "";
  const [fecha, setFecha] = useState(initial.slice(0, 10));
  const [hora, setHora] = useState(initial.slice(11, 16));
  const [usuarioId, setUsuarioId] = useState(cita?.usuarioId ?? "");
  const [sugerencias, setSugerencias] = useState<string[]>([]);

  if (!cita || !mode) return null;

  const aplicarSugerencia = (iso: string) => {
    const local = dateTimeInputValue(iso, timeZone);
    setFecha(local.slice(0, 10));
    setHora(local.slice(11, 16));
    setSugerencias([]);
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="w-[min(92vw,28rem)]">
        <DialogHeader>
          <DialogTitle>{mode === "mover" ? "Mover cita" : "Reagendar cita"}</DialogTitle>
          <DialogDescription>
            {mode === "mover"
              ? "Elige la nueva fecha, hora y profesional sin arrastrar la tarjeta."
              : "La cita volverá a estado pendiente en el nuevo horario."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await onSubmit(`${fecha}T${hora}`, usuarioId || null);
            if (result.success) {
              onClose();
            } else {
              setSugerencias(result.sugerencias ?? []);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel required>Fecha</FieldLabel>
              <Input onChange={(event) => setFecha(event.target.value)} required type="date" value={fecha} />
            </Field>
            <Field>
              <FieldLabel required>Hora</FieldLabel>
              <Input onChange={(event) => setHora(event.target.value)} required type="time" value={hora} />
            </Field>
          </div>
          <Field>
            <FieldLabel>Profesional</FieldLabel>
            <Select onChange={(event) => setUsuarioId(event.target.value)} value={usuarioId}>
              <option value="">Sin asignar</option>
              {staff.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </Select>
          </Field>
          {sugerencias.length > 0 ? (
            <div className="rounded-xl border border-[#e3d9d1] bg-[#faf6f3] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
                Horarios libres sugeridos
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sugerencias.map((iso) => (
                  <button
                    className="rounded-lg border border-[#e3d9d1] bg-white px-3 py-1.5 text-xs font-medium text-[#403a35] transition-colors hover:border-[#8a5140] hover:bg-[#f2e3dc]"
                    key={iso}
                    onClick={() => aplicarSugerencia(iso)}
                    type="button"
                  >
                    {formatDate(iso, { timeZone })} · {formatTime(iso, { timeZone })}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-[#81746c]">
                Elige una sugerencia para rellenar fecha y hora, luego confirma.
              </p>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button disabled={pending} onClick={onClose} type="button" variant="outline">
              Cancelar
            </Button>
            <Button disabled={pending || !fecha || !hora} type="submit">
              {pending ? "Guardando..." : mode === "mover" ? "Mover cita" : "Reagendar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AgendaBoard({
  organizationId,
  sucursal,
  fecha,
  vista,
  weekDays,
  staff,
  clientes,
  servicios,
  recursos,
  citas,
  horarios,
  bloqueos,
  timeZone,
  currency,
}: {
  organizationId: string;
  sucursal: { id: string; nombre: string; clave: string };
  fecha: string;
  vista: AgendaVista;
  weekDays: string[];
  staff: Array<{ id: string; nombre: string }>;
  clientes: Array<{ id: string; nombre: string; telefono: string | null }>;
  servicios: Array<{ id: string; nombre: string; precioBase: string; duracionMinutos: number }>;
  recursos: AgendaRecurso[];
  citas: AgendaCita[];
  horarios: AgendaHorario[];
  bloqueos: AgendaBloqueo[];
  timeZone: string;
  currency: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentHref = `${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AgendaCita | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createInitial, setCreateInitial] = useState<{ fechaHora: string; usuarioId: string | null } | null>(null);
  const [moveTarget, setMoveTarget] = useState<AgendaCita | null>(null);
  const [moveMode, setMoveMode] = useState<MoveMode | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [checkoutVentaId, setCheckoutVentaId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isXl = useMediaQuery("(min-width: 80rem)");

  // La cita seleccionada se deriva por id desde `citas`: al refrescarse el
  // board (router.refresh / revalidatePath tras una action) el panel siempre
  // muestra el objeto actualizado, y si la cita desaparece el panel se cierra.
  const selected = selectedId ? (citas.find((cita) => cita.id === selectedId) ?? null) : null;
  // Split-view: en vista día con viewport xl el panel va inline junto al grid.
  const panelInline = vista === "dia" && isXl;

  const dayParts = getZonedParts(localDateTimeToUtc(`${fecha}T12:00`, timeZone) ?? new Date(), timeZone);
  const turnosDia = horarios.filter((horario) => horario.diaSemana === dayParts.diaSemana);
  const startMin = turnosDia.length > 0 ? Math.floor(Math.min(...turnosDia.map((h) => h.iniciaMinutos)) / 60) * 60 : FALLBACK_START;
  const endMin = turnosDia.length > 0 ? Math.ceil(Math.max(...turnosDia.map((h) => h.terminaMinutos)) / 60) * 60 : FALLBACK_END;
  const hours = Array.from({ length: Math.max(1, (endMin - startMin) / 60) }, (_, index) => startMin / 60 + index);
  const dayBounds = dayBoundsUtc(fecha, timeZone);

  const columns = useMemo(() => [{ id: "", nombre: "Sin asignar" }, ...staff], [staff]);
  const citasPorColumna = useMemo(() => {
    const map = new Map<string, AgendaCita[]>();
    for (const column of columns) map.set(column.id, []);
    for (const cita of citas) {
      const key = cita.usuarioId ?? "";
      const list = map.get(key) ?? [];
      list.push(cita);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
    return map;
  }, [citas, columns]);

  const runMutation = (
    action: Promise<CitaMutationResult>,
    opts: { keepSelected?: boolean } = {},
  ) =>
    new Promise<CitaMutationResult>((resolve) => {
      startTransition(async () => {
        try {
          const result = await action;
          if (result.success) {
            toast.success(result.message ?? "Cambio aplicado.");
            if (!opts.keepSelected) setSelectedId(null);
          } else {
            toast.error(result.error ?? "No se pudo aplicar el cambio.");
          }
          resolve(result);
        } catch (error) {
          console.error(error);
          toast.error("No se pudo aplicar el cambio.");
          resolve({ success: false, error: "No se pudo aplicar el cambio." });
        }
      });
    });

  const estadoFormData = (cita: AgendaCita, estado: string) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    data.set("estado", estado);
    data.set("version", String(cita.version));
    return data;
  };

  const submitMove = (cita: AgendaCita, mode: MoveMode) => (fechaHora: string, usuarioId: string | null) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    data.set("fechaHora", fechaHora);
    data.set("usuarioId", usuarioId ?? "");
    data.set("version", String(cita.version));
    return runMutation(mode === "mover" ? moveCita(data) : rescheduleCita(data));
  };

  const dropEnColumna = (event: DragEvent<HTMLDivElement>, usuarioId: string) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || dragId;
    const cita = citas.find((item) => item.id === id);
    if (!cita) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rawMinutes = startMin + (event.clientY - rect.top) / PX_PER_MIN;
    const minutes = Math.min(Math.max(Math.round(rawMinutes / 15) * 15, startMin), endMin - 15);
    const fechaHora = `${fecha}T${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    data.set("fechaHora", fechaHora);
    data.set("usuarioId", usuarioId);
    data.set("version", String(cita.version));
    void runMutation(moveCita(data));
    setDragId(null);
    setDropTarget(null);
  };

  const openMove = (cita: AgendaCita, mode: MoveMode) => {
    setSelectedId(null);
    setMoveTarget(cita);
    setMoveMode(mode);
  };

  // Cobro inline: reutiliza la venta ligada a la cita o la crea sin redirect.
  const cobrarCita = (cita: AgendaCita) => {
    if (cita.ventaId) {
      setCheckoutVentaId(cita.ventaId);
      return;
    }
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    startTransition(async () => {
      try {
        const result = await iniciarVentaDeCita({}, data);
        if (result.success && result.data?.ventaId) {
          setCheckoutVentaId(result.data.ventaId);
        } else {
          toast.error(result.error ?? "No se pudo abrir la venta.");
        }
      } catch (error) {
        console.error(error);
        toast.error("No se pudo abrir la venta.");
      }
    });
  };

  // Clic en un hueco vacío de la columna → "Nueva cita" con slot precargado.
  const clickEnHueco = (event: MouseEvent<HTMLDivElement>, usuarioId: string) => {
    // Solo clics directos en el fondo (tarjetas y bloqueos quedan excluidos).
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const rawMinutes = startMin + (event.clientY - rect.top) / PX_PER_MIN;
    const minutes = Math.min(Math.max(Math.round(rawMinutes / 15) * 15, startMin), endMin - 15);
    setCreateInitial({
      fechaHora: `${fecha}T${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`,
      usuarioId: usuarioId || null,
    });
    setEditing(null);
    setCreateOpen(true);
  };

  const dayGrid = (
    // Scroll interno en ambos ejes: permite que los encabezados de columna
    // queden sticky (top-0) al desplazarse verticalmente por el día.
    <div className="max-h-[calc(100dvh-10rem)] overflow-auto rounded-2xl border border-[#eadfd8] bg-white p-4 shadow-sm">
      <div className="flex min-w-[760px] gap-2">
        <div className="w-16 shrink-0 pt-10">
          {hours.map((hour) => (
            <div className="relative" key={hour} style={{ height: HOUR_PX }}>
              <span className="absolute -top-2 right-2 text-[10px] font-medium text-[#a89f97]">
                {pad2(hour)}:00
              </span>
            </div>
          ))}
        </div>
        {columns.map((column) => {
          const columnCitas = citasPorColumna.get(column.id) ?? [];
          const columnBloqueos = bloqueos.filter(
            (bloqueo) => bloqueo.usuarioId === null || bloqueo.usuarioId === column.id,
          );
          return (
            <section
              aria-label={column.nombre || "Sin asignar"}
              className={cn("min-w-[164px] flex-1 rounded-xl transition-colors", dropTarget === column.id && "bg-[#f2e3dc]")}
              key={column.id || "sin-asignar"}
            >
              <h3 className="sticky top-0 z-10 mb-2 rounded-xl bg-[#f1eeea] px-3 py-2 text-center text-xs font-semibold text-[#625b55]">
                {column.nombre}
              </h3>
              <div
                className="relative cursor-cell rounded-xl border border-[#eee8e3] bg-[#faf9f7]"
                onClick={(event) => clickEnHueco(event, column.id)}
                onDragLeave={() => setDropTarget((target) => (target === column.id ? null : target))}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropTarget(column.id);
                }}
                onDrop={(event) => dropEnColumna(event, column.id)}
                style={{ height: (endMin - startMin) * PX_PER_MIN }}
                title="Clic para nueva cita"
              >
                {hours.map((hour) => (
                  <div className="pointer-events-none absolute w-full border-t border-[#eee8e3]" key={hour} style={{ top: (hour * 60 - startMin) * PX_PER_MIN }} />
                ))}
                {hours.map((hour) =>
                  // Guías tenues cada 15 min para facilitar el clic en huecos.
                  [15, 30, 45].map((offset) => (
                    <div
                      className="pointer-events-none absolute w-full border-t border-dashed border-[#f4eeea]"
                      key={`${hour}-${offset}`}
                      style={{ top: (hour * 60 + offset - startMin) * PX_PER_MIN }}
                    />
                  )),
                )}
                {turnosDia.length === 0 ? (
                  <div className="absolute inset-0 z-0 rounded-xl bg-[#f1eeea]/70 p-3 text-center text-xs font-medium text-[#8a7b72]">
                    Sin horario configurado
                  </div>
                ) : null}
                {columnBloqueos.map((bloqueo) => {
                  if (!dayBounds) return null;
                  const inicia = new Date(bloqueo.iniciaAt).getTime();
                  const termina = new Date(bloqueo.terminaAt).getTime();
                  const dayStart = dayBounds.iniciaAt.getTime() + startMin * 60_000;
                  const dayEnd = dayBounds.iniciaAt.getTime() + endMin * 60_000;
                  if (termina <= dayStart || inicia >= dayEnd) return null;
                  const top = (Math.max(inicia, dayStart) - dayStart) / 60_000 * PX_PER_MIN;
                  const height = Math.max((Math.min(termina, dayEnd) - Math.max(inicia, dayStart)) / 60_000 * PX_PER_MIN, 24);
                  return (
                    <div
                      className="absolute inset-x-1 z-[1] rounded-lg border border-dashed border-[#c9a899] bg-[#f2e3dc]/80 px-2 py-1 text-[10px] font-medium text-[#7b4c3d]"
                      key={bloqueo.id}
                      style={{ top, height }}
                      title={bloqueo.motivo ?? BLOQUEO_LABEL[bloqueo.tipo] ?? "Bloqueo"}
                    >
                      {BLOQUEO_LABEL[bloqueo.tipo] ?? "Bloqueo"}
                    </div>
                  );
                })}
                {columnCitas.map((cita) => {
                  const interval = citaInterval(cita);
                  const top = (getZonedParts(new Date(cita.fechaHora), timeZone).minutosDelDia - startMin) * PX_PER_MIN;
                  const height = Math.max((interval.terminaAtMs - interval.iniciaAtMs) / 60_000 * PX_PER_MIN, 34);
                  return (
                    <CitaCard
                      cita={cita}
                      className="absolute inset-x-1 z-[2]"
                      currency={currency}
                      draggable
                      key={cita.id}
                      onClick={() => setSelectedId(cita.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setDropTarget(null);
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", cita.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragId(cita.id);
                      }}
                      style={{ top, height }}
                      timeZone={timeZone}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );

  const weekGrid = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
      {weekDays.map((day) => {
        const dayCitas = citas.filter((cita) => getZonedParts(new Date(cita.fechaHora), timeZone).dayKey === day);
        const isSelected = day === fecha;
        return (
          <section className={cn("min-h-48 rounded-2xl border bg-white p-3 shadow-sm", isSelected ? "border-[#8a5140]" : "border-[#eadfd8]")} key={day}>
            <Link
              className="flex items-center justify-between rounded-lg px-1 pb-2 text-sm font-semibold text-[#403a35] hover:text-[#8a5140]"
              href={buildAdminHref("/agenda", { params: searchParams, preserve: ["sucursalId", "q"], extra: { fecha: day, vista: "dia" } })}
            >
              {formatDate(`${day}T12:00:00Z`, { timeZone: "UTC" })}
              <span className="rounded-full bg-[#f1eeea] px-2 py-0.5 text-[10px] tabular-nums text-[#625b55]">{dayCitas.length}</span>
            </Link>
            <div className="space-y-2">
              {dayCitas.map((cita) => (
                <CitaCard
                  cita={cita}
                  currency={currency}
                  key={cita.id}
                  onClick={() => setSelectedId(cita.id)}
                  timeZone={timeZone}
                />
              ))}
              {dayCitas.length === 0 ? <p className="rounded-lg bg-[#f8f7f5] px-3 py-4 text-center text-xs text-[#81746c]">Sin citas</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );

  const listView = (
    <AdminCard className="overflow-hidden p-0 sm:p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-[#f8f7f5] text-xs uppercase tracking-wide text-[#81746c]">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha y hora</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Profesional</th>
              <th className="px-4 py-3 font-medium">Servicios</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eee8e3]">
            {citas.map((cita) => (
              <tr className="hover:bg-[#faf9f7]" key={cita.id}>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(cita.fechaHora, { timeZone })}
                  <span className="ml-2 text-xs text-[#81746c]">{formatTime(cita.fechaHora, { timeZone })}</span>
                </td>
                <td className="px-4 py-3 font-medium">{cita.clienteNombre}</td>
                <td className="px-4 py-3 text-xs text-[#625b55]">{cita.usuarioNombre ?? "Sin asignar"}</td>
                <td className="max-w-56 truncate px-4 py-3 text-xs text-[#625b55]">
                  {cita.servicios.map((servicio) => servicio.nombre).join(", ") || "Sin servicios"}
                  {cita.recursos.length > 0 ? (
                    <span className="block text-[10px] text-[#81746c]">{cita.recursos.map((r) => r.nombre).join(", ")}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3"><CitaStatusBadge estado={cita.estado} /></td>
                <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(cita.totalEstimado, { currency })}</td>
                <td className="px-4 py-3 text-right">
                  <Button onClick={() => setSelectedId(cita.id)} size="sm" type="button" variant="outline">
                    Ver
                  </Button>
                </td>
              </tr>
            ))}
            {citas.length === 0 ? (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-[#625b55]" colSpan={7}>
                  No hay citas que coincidan con el filtro.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminCard>
  );

  // Mismo contenido del panel para ambas presentaciones (inline xl / Sheet).
  const sidePanel = selected ? (
    <CitaSidePanel
      cita={selected}
      currency={currency}
      onCobrar={cobrarCita}
      onClose={() => setSelectedId(null)}
      onEdit={() => {
        setEditing(selected);
        setSelectedId(null);
      }}
      onMove={() => openMove(selected, "mover")}
      onReschedule={() => openMove(selected, "reagendar")}
      onToggleActiva={() => {
        const data = new FormData();
        data.set("organizacionId", organizationId);
        data.set("id", selected.id);
        data.set("activo", "true");
        data.set("version", String(selected.version));
        void runMutation(toggleCitaActiva(data));
      }}
      onToggleServicio={() => router.refresh()}
      onTransition={(cita, estado) =>
        void runMutation(updateCitaEstado(estadoFormData(cita, estado)), { keepSelected: true })
      }
      organizationId={organizationId}
      pending={pending}
      recursos={recursos}
      servicios={servicios}
      staff={staff}
      timeZone={timeZone}
    />
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#625b55]">
          <Clock3 aria-hidden="true" className="size-4" />
          <span>
            {turnosDia.length > 0
              ? `Horario ${turnosDia.map((turno) => `${pad2(Math.floor(turno.iniciaMinutos / 60))}:${pad2(turno.iniciaMinutos % 60)}–${pad2(Math.floor(turno.terminaMinutos / 60))}:${pad2(turno.terminaMinutos % 60)}`).join(" · ")}`
              : "Sin horario configurado para este día"}
          </span>
          {pending ? <span role="status">Aplicando cambio…</span> : null}
        </div>
        <Button className="rounded-xl" onClick={() => { setEditing(null); setCreateInitial(null); setCreateOpen(true); }} type="button">
          <CalendarPlus aria-hidden="true" /> Nueva cita
        </Button>
      </div>

      {vista === "dia" ? (
        <div className={cn(selected ? "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(340px,26rem)] xl:gap-4" : "")}>
          {dayGrid}
          {selected && panelInline ? (
            <aside className="sticky top-24 max-h-[calc(100dvh-8rem)] self-start overflow-y-auto rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm">
              {sidePanel}
            </aside>
          ) : null}
        </div>
      ) : vista === "semana" ? (
        weekGrid
      ) : (
        listView
      )}

      {/* En <xl (y siempre en semana/lista) el panel va como Sheet overlay. */}
      <Sheet
        onOpenChange={(open) => !open && setSelectedId(null)}
        open={Boolean(selected) && !panelInline}
      >
        <SheetContent hideCloseButton>
          <SheetTitle className="sr-only">
            {selected?.clienteNombre ?? "Detalle de cita"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Detalle y acciones de la cita seleccionada.
          </SheetDescription>
          {sidePanel}
        </SheetContent>
      </Sheet>

      <CheckoutSheet
        currency={currency}
        onCobrada={() => {
          setCheckoutVentaId(null);
          toast.success("Venta cobrada correctamente.");
          router.refresh();
        }}
        onClose={() => {
          setCheckoutVentaId(null);
          // El ticket pudo mutar la cita/venta (líneas, descuento, estado).
          router.refresh();
        }}
        organizationId={organizationId}
        returnTo={currentHref}
        ventaId={checkoutVentaId}
      />

      <MoveCitaDialog
        cita={moveTarget}
        key={`${moveTarget?.id ?? "none"}-${moveMode ?? "none"}`}
        mode={moveMode}
        onClose={() => {
          setMoveTarget(null);
          setMoveMode(null);
        }}
        onSubmit={moveTarget && moveMode ? submitMove(moveTarget, moveMode) : async () => ({ success: false })}
        pending={pending}
        staff={staff}
        timeZone={timeZone}
      />

      <Dialog
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateInitial(null);
        }}
        open={createOpen}
      >
        <DialogContent className="w-[min(92vw,48rem)]">
          <DialogHeader>
            <DialogTitle>Nueva cita</DialogTitle>
            <DialogDescription>
              Agenda en {sucursal.nombre}; la fecha se interpreta en {timeZone}.
            </DialogDescription>
          </DialogHeader>
          <CitaForm
            clientes={clientes}
            currency={currency}
            initial={{
              organizacionId: organizationId,
              sucursalId: sucursal.id,
              fechaHora: createInitial?.fechaHora ?? `${fecha}T10:00`,
              duracionMinutos: 60,
              usuarioId: createInitial?.usuarioId ?? null,
            }}
            key={`nueva-${createInitial?.fechaHora ?? "default"}-${createInitial?.usuarioId ?? ""}`}
            onSuccess={() => setCreateOpen(false)}
            organizationId={organizationId}
            recursos={recursos}
            servicios={servicios}
            staff={staff}
            sucursal={sucursal}
            timeZone={timeZone}
          />
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(open) => !open && setEditing(null)} open={Boolean(editing)}>
        <DialogContent className="w-[min(92vw,48rem)]">
          <DialogHeader>
            <DialogTitle>Editar cita</DialogTitle>
            <DialogDescription>
              Ajusta datos, horario y servicios. La disponibilidad se valida al guardar.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <CitaForm
              clientes={clientes}
              currency={currency}
              initial={{
                id: editing.id,
                organizacionId: organizationId,
                sucursalId: editing.sucursalId,
                clienteId: editing.clienteId,
                usuarioId: editing.usuarioId,
                fechaHora: editing.fechaHora,
                duracionMinutos: editing.duracionMinutos,
                notas: editing.notas,
                version: editing.version,
                servicioIds: editing.servicios.map((servicio) => servicio.id),
                recursoIds: editing.recursos.map((recurso) => recurso.id),
              }}
              key={editing.id}
              onSuccess={() => setEditing(null)}
              organizationId={organizationId}
              recursos={recursos}
              servicios={servicios}
              staff={staff}
              sucursal={sucursal}
              timeZone={timeZone}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
