"use client";

import { CalendarPlus, Clock3 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  cambiarDuracionCita,
  moveCita,
  rescheduleCita,
  toggleCitaActiva,
  updateCitaEstado,
  type CitaMutationResult,
} from "@/app/admin/agenda/actions";
import { CheckoutSheet } from "@/app/admin/agenda/checkout-sheet";
import { CitaForm } from "@/app/admin/agenda/cita-form";
import { CitaSidePanel } from "@/app/admin/agenda/cita-side-panel";
import { iniciarVentaDeCita } from "@/app/admin/pos/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { buildAdminHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";
import { dayBoundsUtc, getZonedParts, localDateTimeToUtc } from "@/modules/agenda";
import {
  ESTADO_VISTA_DOT,
  ESTADO_VISTA_LABEL,
  ESTADOS_VISTA_ORDEN,
} from "@/modules/agenda/estados";

import type { SoltarDuracion, SoltarMover } from "./agenda-drag";
import { useMediaQuery, useMinutoActual } from "./agenda-hooks";
import type {
  AgendaBloqueo,
  AgendaCita,
  AgendaHorario,
  AgendaRecurso,
  AgendaVista,
  MoveMode,
} from "./agenda-types";
import {
  FALLBACK_END,
  FALLBACK_START,
} from "./agenda-types";
import { citaInterval, dateTimeInputValue, etiquetaMinuto, pad2 } from "./agenda-utils";
import { DayGrid } from "./day-grid";
import { ListView } from "./list-view";
import { MoveCitaDialog } from "./move-cita-dialog";
import { ResumenDia } from "./resumen-dia";
import { WeekGrid } from "./week-grid";

export type { AgendaBloqueo, AgendaCita, AgendaHorario, AgendaRecurso, AgendaVista };

/** Mutaciones de la rejilla que se aplican optimistas antes del servidor. */
type AccionBoard =
  | { tipo: "mover"; id: string; fechaHora: string; usuarioId: string | null }
  | { tipo: "duracion"; id: string; duracionMinutos: number };

const FECHA_LARGA = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Leyenda plegable: el color de la tarjeta dice en qué va la cita. */
function LeyendaEstados() {
  return (
    <details className="group relative">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted [&::-webkit-details-marker]:hidden">
        Colores
      </summary>
      <ul className="absolute right-0 top-full z-30 mt-1 w-52 space-y-1 rounded-xl border border-border bg-card p-2 shadow-lg">
        {ESTADOS_VISTA_ORDEN.map((vista) => (
          <li className="flex items-center gap-2 text-sm" key={vista}>
            <span className={cn("size-3.5 shrink-0 rounded-full", ESTADO_VISTA_DOT[vista])} />
            {ESTADO_VISTA_LABEL[vista]}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function AgendaBoard({
  organizationId,
  sucursal,
  fecha,
  hoy,
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
  /** Fecha de hoy (`YYYY-MM-DD`) en la zona de la sucursal. */
  hoy: string;
  vista: AgendaVista;
  weekDays: string[];
  staff: Array<{ id: string; nombre: string }>;
  servicios: Array<{ id: string; nombre: string; categoriaId: string | null; precioBase: string; duracionMinutos: number; imagenClaveR2?: string | null }>;
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
  const [moveInitial, setMoveInitial] = useState<{ fechaHora: string; usuarioId: string | null } | null>(null);
  const [checkoutVentaId, setCheckoutVentaId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isXl = useMediaQuery("(min-width: 80rem)");
  const isMd = useMediaQuery("(min-width: 48rem)");
  const minutoActual = useMinutoActual(fecha, timeZone);
  const [columnaMovilId, setColumnaMovilId] = useState<string | null>(null);
  const [ultimaCitaTocada, setUltimaCitaTocada] = useState<string | null>(null);
  const tocarTimer = useRef<number | null>(null);

  // Optimismo de la rejilla: la tarjeta salta al nuevo horario al instante y
  // vuelve sola si el servidor responde error (la transición termina sin
  // revalidar y React revierte al estado base).
  const [citasBoard, addOptimistic] = useOptimistic(citas, (estado, accion: AccionBoard) => {
    switch (accion.tipo) {
      case "mover":
        return estado.map((cita) =>
          cita.id === accion.id
            ? { ...cita, fechaHora: accion.fechaHora, usuarioId: accion.usuarioId }
            : cita,
        );
      case "duracion":
        return estado.map((cita) =>
          cita.id === accion.id ? { ...cita, duracionMinutos: accion.duracionMinutos } : cita,
        );
    }
  });

  // La cita seleccionada se deriva por id desde `citasBoard`: al refrescarse
  // el board (router.refresh / revalidatePath tras una action) el panel siempre
  // muestra el objeto actualizado, y si la cita desaparece el panel se cierra.
  const selected = selectedId ? (citasBoard.find((cita) => cita.id === selectedId) ?? null) : null;
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
    for (const cita of citasBoard) {
      const key = cita.usuarioId ?? "";
      const list = map.get(key) ?? [];
      list.push(cita);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
    return map;
  }, [citasBoard, columns]);

  // En pantallas < md se muestra un solo carril elegido con pestañas.
  const columnaMovil =
    columnaMovilId && columns.some((column) => column.id === columnaMovilId)
      ? columnaMovilId
      : (columns[0]?.id ?? "");
  const columnsVisibles = isMd ? columns : columns.filter((column) => column.id === columnaMovil);

  const fechaLargaRaw = FECHA_LARGA.format(new Date(`${fecha}T12:00:00Z`));
  const fechaLarga = fechaLargaRaw.charAt(0).toUpperCase() + fechaLargaRaw.slice(1);

  // Pulso de confirmación en la tarjeta recién movida/ajustada (700 ms).
  const tocar = useCallback((id: string) => {
    setUltimaCitaTocada(id);
    if (tocarTimer.current !== null) window.clearTimeout(tocarTimer.current);
    tocarTimer.current = window.setTimeout(() => setUltimaCitaTocada(null), 700);
  }, []);
  useEffect(
    () => () => {
      if (tocarTimer.current !== null) window.clearTimeout(tocarTimer.current);
    },
    [],
  );

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

  /**
   * Movida optimista con "Deshacer" (6 s): la tarjeta salta al instante, el
   * deshacer repite la action con los valores previos y `version + 1` (la
   * versión que dejó el servidor tras la movida).
   */
  const ejecutarMovida = (
    cita: AgendaCita,
    destino: { fechaHora: string; fechaHoraIso: string; usuarioId: string | null },
    opts: { version?: number; sinDeshacer?: boolean } = {},
  ) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    data.set("fechaHora", destino.fechaHora);
    data.set("usuarioId", destino.usuarioId ?? "");
    data.set("version", String(opts.version ?? cita.version));
    const previo = {
      fechaHora: cita.fechaHora,
      usuarioId: cita.usuarioId,
      version: cita.version,
    };
    startTransition(async () => {
      addOptimistic({
        tipo: "mover",
        id: cita.id,
        fechaHora: destino.fechaHoraIso,
        usuarioId: destino.usuarioId,
      });
      try {
        const result = await moveCita(data);
        if (result.success) {
          tocar(cita.id);
          if (opts.sinDeshacer) {
            toast.success(result.message ?? "Cita movida.");
          } else {
            toast.show({
              title: result.message ?? "Cita movida.",
              type: "success",
              timeout: 6000,
              actionProps: {
                type: "button",
                children: "Deshacer",
                onClick: () =>
                  ejecutarMovida(
                    cita,
                    {
                      fechaHora: dateTimeInputValue(previo.fechaHora, timeZone),
                      fechaHoraIso: previo.fechaHora,
                      usuarioId: previo.usuarioId,
                    },
                    { sinDeshacer: true, version: previo.version + 1 },
                  ),
              },
            });
          }
        } else {
          toast.error(result.error ?? "No se pudo mover la cita.");
        }
      } catch (error) {
        console.error(error);
        toast.error("No se pudo mover la cita.");
      }
    });
  };

  /** Cambio de duración optimista con "Deshacer", mismo patrón que la movida. */
  const ejecutarDuracion = (
    cita: AgendaCita,
    duracionMinutos: number,
    opts: { version?: number; sinDeshacer?: boolean } = {},
  ) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    data.set("duracionMinutos", String(duracionMinutos));
    data.set("version", String(opts.version ?? cita.version));
    const previo = { duracionMinutos: cita.duracionMinutos, version: cita.version };
    startTransition(async () => {
      addOptimistic({ tipo: "duracion", id: cita.id, duracionMinutos });
      try {
        const result = await cambiarDuracionCita(data);
        if (result.success) {
          tocar(cita.id);
          if (opts.sinDeshacer) {
            toast.success(result.message ?? "Duración actualizada.");
          } else {
            toast.show({
              title: result.message ?? "Duración actualizada.",
              type: "success",
              timeout: 6000,
              actionProps: {
                type: "button",
                children: "Deshacer",
                onClick: () =>
                  ejecutarDuracion(cita, previo.duracionMinutos, {
                    sinDeshacer: true,
                    version: previo.version + 1,
                  }),
              },
            });
          }
        } else {
          toast.error(result.error ?? "No se pudo cambiar la duración.");
        }
      } catch (error) {
        console.error(error);
        toast.error("No se pudo cambiar la duración.");
      }
    });
  };

  /**
   * Soltado del arrastre: sin cambio → nada; sobre un bloqueo → abre el
   * diálogo "Mover cita" con el horario intentado; en celda → movida optimista.
   */
  const soltarMover = ({ cita, columnaId, minutoInicio }: SoltarMover) => {
    if (!dayBounds) return;
    const partes = getZonedParts(new Date(cita.fechaHora), timeZone);
    const sinCambio =
      partes.dayKey === fecha &&
      partes.minutosDelDia === minutoInicio &&
      (cita.usuarioId ?? "") === columnaId;
    if (sinCambio) return;
    const fechaHora = `${fecha}T${etiquetaMinuto(minutoInicio)}`;
    const iniciaMs = dayBounds.iniciaAt.getTime() + minutoInicio * 60_000;
    const terminaMs = iniciaMs + cita.duracionMinutos * 60_000;
    const enBloqueo = bloqueos.some(
      (bloqueo) =>
        (bloqueo.usuarioId === null || bloqueo.usuarioId === columnaId) &&
        iniciaMs < new Date(bloqueo.terminaAt).getTime() &&
        new Date(bloqueo.iniciaAt).getTime() < terminaMs,
    );
    // Traslapar otra cita solo es inválido en columnas de profesional; en
    // "Sin asignar" la capacidad compartida sí permite coincidencias (la
    // valida el servidor con capacidad_sin_asignar).
    const enOtraCita =
      columnaId !== "" &&
      (citasPorColumna.get(columnaId) ?? []).some((otra) => {
        if (otra.id === cita.id) return false;
        const intervalo = citaInterval(otra);
        return iniciaMs < intervalo.terminaAtMs && intervalo.iniciaAtMs < terminaMs;
      });
    if (enBloqueo || enOtraCita) {
      toast.info(
        enBloqueo
          ? "Ese horario está bloqueado. Ajusta la hora o el profesional."
          : "Ese horario ya está ocupado. Ajusta la hora o el profesional.",
      );
      openMove(cita, "mover", { fechaHora, usuarioId: columnaId || null });
      return;
    }
    ejecutarMovida(cita, {
      fechaHora,
      fechaHoraIso: new Date(iniciaMs).toISOString(),
      usuarioId: columnaId || null,
    });
  };

  const soltarDuracion = ({ cita, duracion }: SoltarDuracion) => {
    if (duracion === cita.duracionMinutos) return;
    ejecutarDuracion(cita, duracion);
  };

  const openMove = (
    cita: AgendaCita,
    mode: MoveMode,
    initial?: { fechaHora: string; usuarioId: string | null },
  ) => {
    setSelectedId(null);
    setMoveTarget(cita);
    setMoveMode(mode);
    setMoveInitial(initial ?? null);
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
  const clickEnHueco = (minutos: number, usuarioId: string) => {
    setCreateInitial({
      fechaHora: `${fecha}T${etiquetaMinuto(minutos)}`,
      usuarioId: usuarioId || null,
    });
    setEditing(null);
    setCreateOpen(true);
  };

  const abrirNuevaCita = () => {
    setEditing(null);
    setCreateInitial(null);
    setCreateOpen(true);
  };

  const dayGridData = {
    columns,
    columnsVisibles,
    citasPorColumna,
    bloqueos,
    turnosDia,
    startMin,
    endMin,
    hours,
    dayStartMs: dayBounds ? dayBounds.iniciaAt.getTime() : null,
    minutoActual,
    isMd,
    fecha,
  };

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
      {vista === "dia" ? (
        <ResumenDia
          citas={citasBoard}
          currency={currency}
          minutoActual={minutoActual}
          timeZone={timeZone}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <Clock3 aria-hidden="true" className="size-4" />
          <span>
            {turnosDia.length > 0
              ? `Horario ${turnosDia.map((turno) => `${pad2(Math.floor(turno.iniciaMinutos / 60))}:${pad2(turno.iniciaMinutos % 60)}–${pad2(Math.floor(turno.terminaMinutos / 60))}:${pad2(turno.terminaMinutos % 60)}`).join(" · ")}`
              : "Sin horario configurado para este día"}
          </span>
          <LeyendaEstados />
          {pending ? <span role="status">Aplicando cambio…</span> : null}
        </div>
        <Button
          className="rounded-xl max-lg:hidden"
          data-action-clave="1"
          data-action-id="agenda.cita.abrir_formulario"
          onClick={abrirNuevaCita}
          size="lg"
          type="button"
        >
          <CalendarPlus aria-hidden="true" /> Nueva cita
        </Button>
      </div>

      {vista === "dia" ? (
        <div className={cn(selected ? "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(340px,26rem)] xl:gap-4" : "")}>
          <div className="min-w-0 space-y-3">
            <div className="flex items-center gap-3 px-1">
              <h2 className="text-lg font-semibold text-foreground">{fechaLarga}</h2>
              {fecha === hoy ? (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-op-xs font-bold text-primary">
                  Hoy
                </span>
              ) : null}
            </div>
            <DayGrid
              columnaMovil={columnaMovil}
              currency={currency}
              data={dayGridData}
              onClickHueco={clickEnHueco}
              onCobrarCita={cobrarCita}
              onColumnaMovil={setColumnaMovilId}
              onSelectCita={setSelectedId}
              onSoltarDuracion={soltarDuracion}
              onSoltarMover={soltarMover}
              pending={pending}
              sucursalNombre={sucursal.nombre}
              timeZone={timeZone}
              ultimaCitaTocada={ultimaCitaTocada}
            />
          </div>
          {selected && panelInline ? (
            <aside className="sticky top-24 max-h-[calc(100dvh-8rem)] self-start overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-sm">
              {sidePanel}
            </aside>
          ) : null}
        </div>
      ) : vista === "semana" ? (
        <WeekGrid
          citas={citasBoard}
          currency={currency}
          fecha={fecha}
          hrefForDia={(day) =>
            buildAdminHref("/agenda", {
              params: searchParams,
              preserve: ["sucursalId", "q"],
              extra: { fecha: day, vista: "dia" },
            })
          }
          onCobrarCita={cobrarCita}
          onSelectCita={setSelectedId}
          timeZone={timeZone}
          weekDays={weekDays}
        />
      ) : (
        <ListView citas={citasBoard} currency={currency} onSelectCita={setSelectedId} timeZone={timeZone} />
      )}

      {/* FAB móvil: la acción principal siempre al alcance del pulgar. */}
      <Button
        aria-label="Nueva cita"
        className="fixed bottom-20 right-4 z-30 rounded-full shadow-lg lg:hidden"
        data-action-clave="1"
        data-action-id="agenda.cita.abrir_formulario"
        onClick={abrirNuevaCita}
        size="touch"
        type="button"
      >
        <CalendarPlus aria-hidden="true" /> Nueva cita
      </Button>

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
        initial={moveInitial}
        key={`${moveTarget?.id ?? "none"}-${moveMode ?? "none"}-${moveInitial?.fechaHora ?? ""}`}
        mode={moveMode}
        onClose={() => {
          setMoveTarget(null);
          setMoveMode(null);
          setMoveInitial(null);
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
