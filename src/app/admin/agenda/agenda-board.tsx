"use client";

import { CalendarPlus, Clock3, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
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
import { categoryTone } from "@/lib/category-color";
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
  servicios: Array<{ id: string; nombre: string; categoriaId: string | null; precio: string }>;
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
const HOUR_PX = 76;
const PX_PER_MIN = HOUR_PX / 60;
const COLUMN_HEADER_PX = 46;

// Estado como badge compacto (datos funcionales, no paleta estructural).
// Los tonos semánticos translúcidos se leen sobre cualquier tinte de categoría.
const ESTADO_CHIP: Record<string, string> = {
  pendiente: "bg-muted/80 text-muted-foreground",
  confirmada: "bg-info/15 text-info",
  en_proceso: "bg-warning/15 text-warning",
  completada: "bg-success/15 text-success",
  cancelada: "bg-destructive/15 text-destructive",
  no_asistio: "bg-muted/80 text-muted-foreground",
};

const ESTADO_ATENUADO = new Set(["cancelada", "no_asistio"]);

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

function iniciales(nombre: string) {
  return (
    nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "·"
  );
}

/** Citas que se traslapan en una columna reciben carriles horizontales. */
function layoutCitas(citas: AgendaCita[], timeZone: string) {
  const items = citas
    .map((cita) => {
      const inicioMin = getZonedParts(new Date(cita.fechaHora), timeZone).minutosDelDia;
      return { cita, inicioMin, finMin: inicioMin + cita.duracionMinutos };
    })
    .sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin);
  const layout = new Map<string, { lane: number; lanes: number }>();
  let cluster: typeof items = [];
  let clusterFin = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const ocupados: number[] = [];
    for (const item of cluster) {
      let lane = 0;
      for (;;) {
        const libre = !cluster.some(
          (otro) =>
            otro !== item &&
            layout.get(otro.cita.id)?.lane === lane &&
            otro.inicioMin < item.finMin &&
            otro.finMin > item.inicioMin,
        );
        if (libre) break;
        lane += 1;
      }
      ocupados.push(lane);
      layout.set(item.cita.id, { lane, lanes: 0 });
    }
    const lanes = Math.max(...ocupados, 0) + 1;
    for (const item of cluster) {
      const pos = layout.get(item.cita.id);
      if (pos) layout.set(item.cita.id, { ...pos, lanes });
    }
    cluster = [];
    clusterFin = -Infinity;
  };

  for (const item of items) {
    if (cluster.length > 0 && item.inicioMin >= clusterFin) flush();
    cluster.push(item);
    clusterFin = Math.max(clusterFin, item.finMin);
  }
  flush();
  return layout;
}

/** Minuto actual del día en la zona de la sucursal; null si no es hoy. */
function useMinutoActual(fecha: string, timeZone: string) {
  const [minuto, setMinuto] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const parts = getZonedParts(new Date(), timeZone);
      setMinuto(parts.dayKey === fecha ? parts.minutosDelDia : null);
    };
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [fecha, timeZone]);
  return minuto;
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
  const principal = cita.servicios[0];
  const tone = categoryTone(principal?.categoriaId ?? principal?.id ?? null);
  const compact = cita.duracionMinutos <= 35;
  const fin = formatTime(new Date(citaInterval(cita).terminaAtMs).toISOString(), { timeZone });
  const servicios = cita.servicios.map((servicio) => servicio.nombre).join(", ");
  return (
    <button
      aria-label={`${ESTADO_LABEL[cita.estado] ?? cita.estado}, ${formatTime(cita.fechaHora, { timeZone })}, ${cita.clienteNombre}`}
      className={cn(
        "w-full overflow-hidden rounded-lg border px-2 py-1.5 text-left shadow-sm transition-[box-shadow,transform] hover:z-10 hover:shadow-md focus-visible:z-20",
        draggable && "cursor-grab active:cursor-grabbing",
        tone.card,
        ESTADO_ATENUADO.has(cita.estado) && "opacity-70 saturate-[0.55]",
        className,
      )}
      draggable={draggable}
      onClick={onClick}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      style={style}
      type="button"
    >
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="min-w-0 text-[11px] font-semibold leading-4 tabular-nums">
          {formatTime(cita.fechaHora, { timeZone })}–{fin}
        </span>
        <span
          className={cn(
            "ml-auto shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide",
            ESTADO_CHIP[cita.estado] ?? ESTADO_CHIP.pendiente,
          )}
        >
          {ESTADO_LABEL[cita.estado] ?? cita.estado}
        </span>
      </span>
      <span className="block truncate text-[13px] font-semibold leading-4">{cita.clienteNombre}</span>
      {!compact && servicios ? (
        <span className="block truncate text-[11px] leading-4 opacity-85">{servicios}</span>
      ) : null}
      {!compact ? (
        <span className="block text-[11px] leading-4 tabular-nums opacity-85">
          {formatCurrency(cita.totalEstimado, { currency })}
        </span>
      ) : null}
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
            <div className="rounded-xl border border-border bg-muted/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Horarios libres sugeridos
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sugerencias.map((iso) => (
                  <button
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-accent/70"
                    key={iso}
                    onClick={() => aplicarSugerencia(iso)}
                    type="button"
                  >
                    {formatDate(iso, { timeZone })} · {formatTime(iso, { timeZone })}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
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
  servicios: Array<{ id: string; nombre: string; categoriaId: string | null; precioBase: string; duracionMinutos: number }>;
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
  // `?nueva=1` abre el formulario al llegar (acceso directo desde el inicio).
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("nueva") === "1");
  const [createInitial, setCreateInitial] = useState<{ fechaHora: string; usuarioId: string | null } | null>(null);
  const [moveTarget, setMoveTarget] = useState<AgendaCita | null>(null);
  const [moveMode, setMoveMode] = useState<MoveMode | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [checkoutVentaId, setCheckoutVentaId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isXl = useMediaQuery("(min-width: 80rem)");
  const isMd = useMediaQuery("(min-width: 48rem)");
  const minutoActual = useMinutoActual(fecha, timeZone);
  const [columnaMovilId, setColumnaMovilId] = useState<string | null>(null);

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

  // En pantallas < md se muestra un solo carril elegido con pestañas.
  const columnaMovil =
    columnaMovilId && columns.some((column) => column.id === columnaMovilId)
      ? columnaMovilId
      : (columns[0]?.id ?? "");
  const columnsVisibles = isMd ? columns : columns.filter((column) => column.id === columnaMovil);

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

  const fondoLineas = `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--border) ${HOUR_PX - 1}px, var(--border) ${HOUR_PX}px), repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX / 4 - 1}px, color-mix(in srgb, var(--border) 45%, transparent) ${HOUR_PX / 4 - 1}px, color-mix(in srgb, var(--border) 45%, transparent) ${HOUR_PX / 4}px)`;

  const dayGrid = (
    // Scroll interno en ambos ejes: permite que los encabezados de columna
    // queden sticky (top-0) al desplazarse verticalmente por el día.
    // tabIndex: la región scrollable debe ser alcanzable con teclado (WCAG).
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {columns.length > 1 ? (
        <div
          aria-label="Profesional visible"
          className="flex gap-2 overflow-x-auto border-b border-border bg-muted/50 p-2 md:hidden"
          role="tablist"
        >
          {columns.map((column) => {
            const activo = columnaMovil === column.id;
            const tone = categoryTone(column.id || "sin-asignar");
            const total = citasPorColumna.get(column.id)?.length ?? 0;
            return (
              <button
                aria-selected={activo}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-2.5 text-xs font-medium transition-colors",
                  activo ? "border-primary/40 bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground",
                )}
                key={column.id || "sin-asignar"}
                onClick={() => setColumnaMovilId(column.id)}
                role="tab"
                type="button"
              >
                <span className={cn("flex size-6 items-center justify-center rounded-full border text-[10px] font-semibold", tone.chip)}>
                  {column.id ? iniciales(column.nombre) : <UserRound aria-hidden="true" className="size-3.5" />}
                </span>
                <span className="max-w-24 truncate">{column.nombre}</span>
                <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] tabular-nums">{total}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        aria-label={`Citas del día por profesional en ${sucursal.nombre}`}
        className="max-h-[calc(100dvh-10rem)] overflow-auto"
        role="region"
        tabIndex={0}
      >
        <div className={cn("flex", isMd && "min-w-[760px]")}>
          <div
            className="sticky left-0 z-20 w-14 shrink-0 border-r border-border bg-card"
            style={{ paddingTop: COLUMN_HEADER_PX }}
          >
            {hours.map((hour) => (
              <div className="relative" key={hour} style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-2 text-[10px] font-medium text-muted-foreground">
                  {pad2(hour)}:00
                </span>
              </div>
            ))}
          </div>
          {columnsVisibles.map((column, index) => {
            const columnCitas = citasPorColumna.get(column.id) ?? [];
            const columnBloqueos = bloqueos.filter(
              (bloqueo) => bloqueo.usuarioId === null || bloqueo.usuarioId === column.id,
            );
            const layout = layoutCitas(columnCitas, timeZone);
            const tone = categoryTone(column.id || "sin-asignar");
            return (
              <section
                aria-label={column.nombre || "Sin asignar"}
                className={cn(
                  "min-w-0 flex-1 transition-colors md:min-w-[150px]",
                  index > 0 && "border-l border-border",
                  dropTarget === column.id && "bg-accent/50",
                )}
                key={column.id || "sin-asignar"}
              >
                <h3
                  className="sticky top-0 z-10 flex items-center justify-center gap-2 border-b border-border bg-card/95 px-2 backdrop-blur-sm"
                  style={{ height: COLUMN_HEADER_PX }}
                >
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold", tone.chip)}>
                    {column.id ? iniciales(column.nombre) : <UserRound aria-hidden="true" className="size-4" />}
                  </span>
                  <span className="truncate text-xs font-semibold text-foreground">{column.nombre}</span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {columnCitas.length}
                  </span>
                </h3>
                <div
                  className="relative cursor-cell bg-background"
                  onClick={(event) => clickEnHueco(event, column.id)}
                  onDragLeave={() => setDropTarget((target) => (target === column.id ? null : target))}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropTarget(column.id);
                  }}
                  onDrop={(event) => dropEnColumna(event, column.id)}
                  style={{ height: (endMin - startMin) * PX_PER_MIN, backgroundImage: fondoLineas }}
                  title="Clic para nueva cita"
                >
                  {turnosDia.length === 0 ? (
                    <div className="absolute inset-0 z-0 bg-muted/60 p-3 text-center text-xs font-medium text-muted-foreground">
                      Sin horario configurado
                    </div>
                  ) : null}
                  {minutoActual !== null && minutoActual >= startMin && minutoActual <= endMin ? (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 z-[3]"
                      style={{ top: (minutoActual - startMin) * PX_PER_MIN }}
                    >
                      <div className="border-t-2 border-primary" />
                      {index === 0 ? <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-primary" /> : null}
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
                        className="absolute inset-x-1 z-[1] rounded-lg border border-dashed border-muted-foreground/40 bg-muted/80 px-2 py-1 text-[10px] font-medium text-muted-foreground"
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
                    const pos = layout.get(cita.id) ?? { lane: 0, lanes: 1 };
                    return (
                      <CitaCard
                        cita={cita}
                        className="absolute z-[2]"
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
                        style={{
                          top,
                          height,
                          left: `calc(${(pos.lane * 100) / pos.lanes}% + 2px)`,
                          width: `calc(${100 / pos.lanes}% - 4px)`,
                        }}
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
    </div>
  );

  const weekGrid = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
      {weekDays.map((day) => {
        const dayCitas = citas.filter((cita) => getZonedParts(new Date(cita.fechaHora), timeZone).dayKey === day);
        const isSelected = day === fecha;
        return (
          <section className={cn("min-h-48 rounded-2xl border bg-card p-3 shadow-sm", isSelected ? "border-primary/60 ring-1 ring-primary/25" : "border-border")} key={day}>
            <Link
              className="flex items-center justify-between rounded-lg px-1 pb-2 text-sm font-semibold text-foreground hover:text-primary"
              href={buildAdminHref("/agenda", { params: searchParams, preserve: ["sucursalId", "q"], extra: { fecha: day, vista: "dia" } })}
            >
              {formatDate(`${day}T12:00:00Z`, { timeZone: "UTC" })}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">{dayCitas.length}</span>
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
              {dayCitas.length === 0 ? <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-xs text-muted-foreground">Sin citas</p> : null}
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
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
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
          <tbody className="divide-y divide-border">
            {citas.map((cita) => (
              <tr className="hover:bg-muted/50" key={cita.id}>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDate(cita.fechaHora, { timeZone })}
                  <span className="ml-2 text-xs text-muted-foreground">{formatTime(cita.fechaHora, { timeZone })}</span>
                </td>
                <td className="px-4 py-3 font-medium">{cita.clienteNombre}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{cita.usuarioNombre ?? "Sin asignar"}</td>
                <td className="max-w-56 truncate px-4 py-3 text-xs text-muted-foreground">
                  {cita.servicios.map((servicio) => servicio.nombre).join(", ") || "Sin servicios"}
                  {cita.recursos.length > 0 ? (
                    <span className="block text-[10px] text-muted-foreground/80">{cita.recursos.map((r) => r.nombre).join(", ")}</span>
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
                <td className="px-4 py-10 text-center text-sm text-muted-foreground" colSpan={7}>
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Clock3 aria-hidden="true" className="size-4" />
          <span>
            {turnosDia.length > 0
              ? `Horario ${turnosDia.map((turno) => `${pad2(Math.floor(turno.iniciaMinutos / 60))}:${pad2(turno.iniciaMinutos % 60)}–${pad2(Math.floor(turno.terminaMinutos / 60))}:${pad2(turno.terminaMinutos % 60)}`).join(" · ")}`
              : "Sin horario configurado para este día"}
          </span>
          {pending ? <span role="status">Aplicando cambio…</span> : null}
        </div>
        <Button className="rounded-xl" data-action-clave="1" data-action-id="agenda.cita.abrir_formulario" onClick={() => { setEditing(null); setCreateInitial(null); setCreateOpen(true); }} size="lg" type="button">
          <CalendarPlus aria-hidden="true" /> Nueva cita
        </Button>
      </div>

      {vista === "dia" ? (
        <div className={cn(selected ? "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(340px,26rem)] xl:gap-4" : "")}>
          {dayGrid}
          {selected && panelInline ? (
            <aside className="sticky top-24 max-h-[calc(100dvh-8rem)] self-start overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-sm">
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
              currency={currency}
              initial={{
                id: editing.id,
                organizacionId: organizationId,
                sucursalId: editing.sucursalId,
                clienteId: editing.clienteId,
                clienteNombre: editing.clienteNombre,
                clienteTelefono: editing.clienteTelefono,
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
