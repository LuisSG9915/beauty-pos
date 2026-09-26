"use client";

import { CalendarPlus, Clock3 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition, type DragEvent, type MouseEvent } from "react";

import {
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
  PX_PER_MIN,
} from "./agenda-types";
import { pad2 } from "./agenda-utils";
import { DayGrid } from "./day-grid";
import { ListView } from "./list-view";
import { MoveCitaDialog } from "./move-cita-dialog";
import { ResumenDia } from "./resumen-dia";
import { WeekGrid } from "./week-grid";

export type { AgendaBloqueo, AgendaCita, AgendaHorario, AgendaRecurso, AgendaVista };

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
          citas={citas}
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
          <DayGrid
            columnaMovil={columnaMovil}
            currency={currency}
            data={dayGridData}
            dragId={dragId}
            dropTarget={dropTarget}
            onClickHueco={clickEnHueco}
            onCobrarCita={cobrarCita}
            onColumnaMovil={setColumnaMovilId}
            onDragEndCita={() => {
              setDragId(null);
              setDropTarget(null);
            }}
            onDragLeaveColumna={(usuarioId) =>
              setDropTarget((target) => (target === usuarioId ? null : target))
            }
            onDragOverColumna={(event, usuarioId) => {
              event.preventDefault();
              setDropTarget(usuarioId);
            }}
            onDragStartCita={(event, cita) => {
              event.dataTransfer.setData("text/plain", cita.id);
              event.dataTransfer.effectAllowed = "move";
              setDragId(cita.id);
            }}
            onDropEnColumna={dropEnColumna}
            onSelectCita={setSelectedId}
            pending={pending}
            sucursalNombre={sucursal.nombre}
            timeZone={timeZone}
          />
          {selected && panelInline ? (
            <aside className="sticky top-24 max-h-[calc(100dvh-8rem)] self-start overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-sm">
              {sidePanel}
            </aside>
          ) : null}
        </div>
      ) : vista === "semana" ? (
        <WeekGrid
          citas={citas}
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
        <ListView citas={citas} currency={currency} onSelectCita={setSelectedId} timeZone={timeZone} />
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
