"use client";

import {
  Check,
  MoveRight,
  Pencil,
  Phone,
  RefreshCcw,
  ShoppingCart,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  getCitaHistorial,
  toggleRecursoCita,
  toggleServicioCita,
  type CitaHistorialEvento,
} from "@/app/admin/agenda/actions";
import {
  cobrarAnticipo,
  devolverAnticipo,
  getCitaAnticipos,
  type CitaAnticipo,
} from "@/app/admin/pos/actions";
import type { AgendaCita, AgendaRecurso } from "@/app/admin/agenda/agenda-types";
import { EstadoVistaBadge } from "@/app/admin/agenda/cita-card";
import { FichaForm } from "@/app/admin/clientes/ficha-form";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/components/ui/toast";
import { initialActionState } from "@/lib/action-state";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";
import {
  canRescheduleEstado,
  canTransitionEstado,
  isCitaEditable,
} from "@/modules/agenda";
import { ESTADO_BD_LABEL, TRANSICION_LABEL } from "@/modules/agenda/estados";

const HISTORIAL_LABEL: Record<string, string> = {
  creada: "Cita creada",
  editada: "Datos editados",
  movida: "Movida de horario",
  reagendada: "Reagendada a pendiente",
  estado: "Cambio de estado",
  servicio_agregado: "Servicio agregado",
  servicio_quitado: "Servicio quitado",
  recurso_agregado: "Recurso asignado",
  recurso_quitado: "Recurso liberado",
  ocultada: "Ocultada de la agenda",
  reactivada: "Reactivada",
  anticipo: "Anticipo cobrado",
  anticipo_devuelto: "Anticipo devuelto",
};

function historialResumen(evento: CitaHistorialEvento): string {
  const detalle = evento.detalle ?? {};
  if (evento.accion === "estado") {
    return `${ESTADO_BD_LABEL[String(detalle.de)] ?? String(detalle.de)} → ${ESTADO_BD_LABEL[String(detalle.a)] ?? String(detalle.a)}`;
  }
  if ((evento.accion === "movida" || evento.accion === "reagendada") && detalle.fechaHoraA) {
    return `nueva hora: ${formatTime(String(detalle.fechaHoraA))}`;
  }
  if ((evento.accion === "recurso_agregado" || evento.accion === "recurso_quitado") && detalle.nombre) {
    return String(detalle.nombre);
  }
  return HISTORIAL_LABEL[evento.accion] ?? evento.accion;
}

/** Historial de movimientos de la cita, cargado al expandir (bitácora propia). */
function CitaHistorial({
  citaId,
  organizationId,
  timeZone,
}: {
  citaId: string;
  organizationId: string;
  timeZone: string;
}) {
  const [eventos, setEventos] = useState<CitaHistorialEvento[] | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = () => {
    if (eventos !== null || cargando) return;
    setCargando(true);
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", citaId);
    void getCitaHistorial(data)
      .then((result) => setEventos(result.success ? (result.eventos ?? []) : []))
      .catch(() => setEventos([]))
      .finally(() => setCargando(false));
  };

  return (
    <details
      className="rounded-xl border border-border bg-muted/60 px-4 py-3"
      onToggle={(event) => {
        if (event.currentTarget.open) cargar();
      }}
    >
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-primary select-none">
        Historial de la cita
      </summary>
      <ul className="mt-3 space-y-2">
        {eventos === null ? (
          <li className="text-xs text-muted-foreground">{cargando ? "Cargando…" : ""}</li>
        ) : eventos.length === 0 ? (
          <li className="text-xs text-muted-foreground">Sin movimientos registrados.</li>
        ) : (
          eventos.map((evento) => (
            <li className="flex items-baseline gap-2 text-xs" key={evento.id}>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatDate(evento.createdAt, { timeZone })} {formatTime(evento.createdAt, { timeZone })}
              </span>
              <span className="min-w-0 flex-1 text-muted-foreground">
                <span className="font-medium text-foreground">
                  {HISTORIAL_LABEL[evento.accion] ?? evento.accion}
                </span>
                {["estado", "movida", "reagendada", "recurso_agregado", "recurso_quitado"].includes(evento.accion)
                  ? ` — ${historialResumen(evento)}`
                  : ""}
                {evento.usuarioNombre ? ` · ${evento.usuarioNombre}` : ""}
              </span>
            </li>
          ))
        )}
      </ul>
    </details>
  );
}

const ANTICIPO_ESTADO_LABEL: Record<string, string> = {
  vigente: "Vigente",
  aplicado: "Aplicado",
  devuelto: "Devuelto",
};

const ANTICIPO_ESTADO_TONE: Record<string, StatusTone> = {
  vigente: "info",
  aplicado: "success",
  devuelto: "destructive",
};

/**
 * Anticipos de la cita: lista cargada al abrir el panel, mini-formulario para
 * cobrar un depósito (entra al corte abierto) y devolución de los vigentes.
 * Los permisos se resuelven del lado servidor en `getCitaAnticipos`.
 */
function CitaAnticipos({
  cita,
  currency,
  editable,
  onChanged,
  organizationId,
}: {
  cita: AgendaCita;
  currency: string;
  editable: boolean;
  onChanged: () => void;
  organizationId: string;
}) {
  const toast = useToast();
  const [data, setData] = useState<{
    anticipos: CitaAnticipo[];
    mediosPago: Array<{ id: string; nombre: string; categoria: string }>;
    puedeCobrar: boolean;
    puedeDevolver: boolean;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [formAbierto, setFormAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [medioPagoId, setMedioPagoId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [devolviendoId, setDevolviendoId] = useState<string | null>(null);
  const [motivoDevolucion, setMotivoDevolucion] = useState("");
  const [idempotencia, setIdempotencia] = useState(() => crypto.randomUUID());

  const cargar = () => {
    const params = new FormData();
    params.set("organizacionId", organizationId);
    params.set("citaId", cita.id);
    void getCitaAnticipos(params)
      .then((result) => {
        if (result.success) setData(result);
      })
      .catch(() => setData(null));
  };

  // Carga perezosa al montar el panel; si cambia la cita se recarga.
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cita.id]);

  const medioSeleccionado = data?.mediosPago.find((m) => m.id === medioPagoId);
  const requiereReferencia = medioSeleccionado ? medioSeleccionado.categoria !== "efectivo" : false;
  const vigenteTotal = (data?.anticipos ?? [])
    .filter((a) => a.estado === "vigente")
    .reduce((s, a) => s + Number(a.monto), 0);

  const cobrar = () => {
    const params = new FormData();
    params.set("organizacionId", organizationId);
    params.set("citaId", cita.id);
    params.set("monto", monto);
    params.set("medioPagoId", medioPagoId);
    params.set("referencia", referencia);
    params.set("idempotencia", idempotencia);
    startTransition(async () => {
      const result = await cobrarAnticipo(initialActionState, params);
      if (result.success) {
        toast.success(result.message ?? "Anticipo registrado.");
        setFormAbierto(false);
        setMonto("");
        setReferencia("");
        setIdempotencia(crypto.randomUUID());
        cargar();
        onChanged();
      } else {
        toast.error(result.error ?? "No se pudo registrar el anticipo.");
      }
    });
  };

  const devolver = (anticipoId: string) => {
    const params = new FormData();
    params.set("organizacionId", organizationId);
    params.set("anticipoId", anticipoId);
    params.set("motivo", motivoDevolucion);
    startTransition(async () => {
      const result = await devolverAnticipo(initialActionState, params);
      if (result.success) {
        toast.success(result.message ?? "Anticipo devuelto.");
        setDevolviendoId(null);
        setMotivoDevolucion("");
        cargar();
        onChanged();
      } else {
        toast.error(result.error ?? "No se pudo devolver el anticipo.");
      }
    });
  };

  if (!data) return null;
  const puedeCapturar = editable && data.puedeCobrar;
  if (data.anticipos.length === 0 && !puedeCapturar) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
          Anticipos
        </h3>
        {vigenteTotal > 0 ? (
          <span className="text-xs font-semibold tabular-nums text-success">
            {formatCurrency(vigenteTotal, { currency })} vigente
          </span>
        ) : null}
      </div>

      {data.anticipos.length > 0 ? (
        <ul className="space-y-2">
          {data.anticipos.map((ant) => (
            <li
              className="rounded-xl border border-border px-4 py-2.5 text-sm"
              key={ant.id}
            >
              <div className="flex min-h-8 items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="font-medium tabular-nums">
                    {formatCurrency(ant.monto, { currency })}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">{ant.medioNombre ?? "Medio"}</span>
                </span>
                <StatusBadge tone={ANTICIPO_ESTADO_TONE[ant.estado] ?? "neutral"}>
                  {ANTICIPO_ESTADO_LABEL[ant.estado] ?? ant.estado}
                </StatusBadge>
                {ant.estado === "vigente" && data.puedeDevolver ? (
                  <Button
                    aria-label="Devolver anticipo"
                    disabled={pending}
                    onClick={() => setDevolviendoId(devolviendoId === ant.id ? null : ant.id)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <RefreshCcw aria-hidden="true" className="size-4 text-destructive" />
                  </Button>
                ) : null}
              </div>
              {devolviendoId === ant.id ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    aria-label="Motivo de la devolución"
                    className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                    onChange={(event) => setMotivoDevolucion(event.target.value)}
                    placeholder="Motivo de la devolución"
                    type="text"
                    value={motivoDevolucion}
                  />
                  <Button
                    className="rounded-lg"
                    disabled={pending || motivoDevolucion.trim().length < 3}
                    onClick={() => devolver(ant.id)}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    Devolver
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {puedeCapturar ? (
        formAbierto ? (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Monto del anticipo"
                className="h-9 w-28 rounded-lg border border-input bg-background px-3 text-sm tabular-nums outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                inputMode="decimal"
                min="0"
                onChange={(event) => setMonto(event.target.value)}
                placeholder="Monto"
                step="0.01"
                type="number"
                value={monto}
              />
              <div aria-label="Medio del anticipo" className="flex flex-wrap gap-1.5" role="group">
                {data.mediosPago.map((medio) => (
                  <button
                    aria-pressed={medioPagoId === medio.id}
                    className={cn(
                      "min-h-9 rounded-lg border px-3 text-xs font-medium transition-colors",
                      medioPagoId === medio.id
                        ? "border-primary bg-accent/70 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-accent-foreground/30",
                    )}
                    key={medio.id}
                    onClick={() => setMedioPagoId(medio.id)}
                    type="button"
                  >
                    {medio.nombre}
                  </button>
                ))}
              </div>
            </div>
            {requiereReferencia ? (
              <input
                aria-label="Referencia del anticipo"
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                onChange={(event) => setReferencia(event.target.value)}
                placeholder={`Referencia de ${medioSeleccionado?.nombre ?? "pago"} (folio o autorización)`}
                type="text"
                value={referencia}
              />
            ) : null}
            <div className="flex gap-2">
              <Button
                className="rounded-lg"
                disabled={
                  pending ||
                  !(Number(monto) > 0) ||
                  !medioPagoId ||
                  (requiereReferencia && referencia.trim().length === 0)
                }
                onClick={cobrar}
                size="sm"
                type="button"
              >
                {pending ? "Registrando…" : "Cobrar anticipo"}
              </Button>
              <Button
                className="rounded-lg"
                disabled={pending}
                onClick={() => setFormAbierto(false)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            className="rounded-xl text-primary"
            onClick={() => {
              setFormAbierto(true);
              setMedioPagoId((prev) => prev || (data.mediosPago.find((m) => m.categoria === "efectivo") ?? data.mediosPago[0])?.id || "");
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            + Cobrar anticipo
          </Button>
        )
      ) : null}
    </section>
  );
}

/** Compatibilidad: badge de estado para vistas con solo `estado` (mi-día). */
export function CitaStatusBadge({ estado, ventaId = null }: { estado: string; ventaId?: string | null }) {
  return <EstadoVistaBadge cita={{ estado, ventaId }} />;
}

type AgendaServicio = {
  id: string;
  nombre: string;
  precioBase: string;
  duracionMinutos: number;
};

/**
 * Panel operativo de la cita (estilo Fresha): datos, servicios editables,
 * acciones primarias de check-in/cobro y secundarias de gestión. El board lo
 * monta inline (xl, vista día) o dentro de un Sheet overlay en el resto.
 */
export function CitaSidePanel({
  cita,
  currency,
  organizationId,
  pending,
  recursos = [],
  servicios,
  staff,
  timeZone,
  onClose,
  onEdit,
  onMove,
  onReschedule,
  onToggleActiva,
  onTransition,
  onCobrar,
  onToggleServicio,
}: {
  cita: AgendaCita;
  currency: string;
  organizationId: string;
  pending: boolean;
  recursos?: AgendaRecurso[];
  servicios: AgendaServicio[];
  staff: Array<{ id: string; nombre: string }>;
  timeZone: string;
  onClose: () => void;
  onEdit: () => void;
  onMove: () => void;
  onReschedule: () => void;
  onToggleActiva: () => void;
  onTransition: (cita: AgendaCita, estado: string) => void;
  onCobrar: (cita: AgendaCita) => void;
  /** Se invoca tras agregar/quitar un servicio para refrescar el board. */
  onToggleServicio: () => void;
}) {
  const toast = useToast();
  const [servicioPending, startServicioTransition] = useTransition();
  const ocupado = pending || servicioPending;

  const profesional = cita.usuarioId
    ? (staff.find((item) => item.id === cita.usuarioId)?.nombre ?? cita.usuarioNombre ?? "Profesional")
    : "Sin asignar";
  const editable = isCitaEditable(cita.estado);
  const serviciosEnCita = new Set(cita.servicios.map((servicio) => servicio.id));
  const disponibles = servicios.filter((servicio) => !serviciosEnCita.has(servicio.id));
  const recursosEnCita = new Set(cita.recursos.map((recurso) => recurso.id));
  const recursosDisponibles = recursos.filter((recurso) => !recursosEnCita.has(recurso.id));

  const puedeCheckIn = canTransitionEstado(cita.estado, "en_proceso");
  const puedeConfirmar = canTransitionEstado(cita.estado, "confirmada");
  const puedeCancelar = canTransitionEstado(cita.estado, "cancelada");
  const puedeNoAsistio = canTransitionEstado(cita.estado, "no_asistio");
  const puedeMover = ["pendiente", "confirmada"].includes(cita.estado);
  const puedeReagendar = canRescheduleEstado(cita.estado);
  const puedeCobrar =
    ["pendiente", "confirmada", "en_proceso"].includes(cita.estado) || Boolean(cita.ventaId);

  const toggleServicio = (servicioId: string, agregar: boolean) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    data.set("servicioId", servicioId);
    data.set("agregar", agregar ? "true" : "false");
    data.set("version", String(cita.version));
    startServicioTransition(async () => {
      try {
        const result = await toggleServicioCita(data);
        if (result.success) {
          toast.success(result.message ?? "Servicios actualizados.");
          // El board hace router.refresh() y re-sincroniza la cita por id.
          onToggleServicio();
        } else {
          toast.error(result.error ?? "No se pudo actualizar los servicios.");
        }
      } catch (error) {
        console.error(error);
        toast.error("No se pudo actualizar los servicios.");
      }
    });
  };

  const toggleRecurso = (recursoId: string, agregar: boolean) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    data.set("recursoId", recursoId);
    data.set("agregar", agregar ? "true" : "false");
    data.set("version", String(cita.version));
    startServicioTransition(async () => {
      try {
        const result = await toggleRecursoCita(data);
        if (result.success) {
          toast.success(result.message ?? "Recursos actualizados.");
          onToggleServicio();
        } else {
          toast.error(result.error ?? "No se pudo actualizar los recursos.");
        }
      } catch (error) {
        console.error(error);
        toast.error("No se pudo actualizar los recursos.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {cita.clienteId ? (
                <a
                  className="hover:text-primary hover:underline"
                  href={buildAdminHref(`/clientes/${cita.clienteId}`, { organizationId })}
                >
                  {cita.clienteNombre}
                </a>
              ) : (
                cita.clienteNombre
              )}
            </h2>
            <EstadoVistaBadge cita={cita} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(cita.fechaHora, { timeZone })} · {formatTime(cita.fechaHora, { timeZone })} ·{" "}
            {cita.duracionMinutos} min
          </p>
          <p className="mt-1.5 text-sm font-medium text-muted-foreground">{profesional}</p>
          {cita.clienteTelefono ? (
            <a
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              href={`tel:${cita.clienteTelefono}`}
            >
              <Phone aria-hidden="true" className="size-3.5" /> {cita.clienteTelefono}
            </a>
          ) : null}
        </div>
        <Button
          aria-label="Cerrar panel"
          className="shrink-0 rounded-lg"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" />
        </Button>
      </div>

      {puedeCheckIn || puedeCobrar ? (
        <div className={cn("grid gap-2", puedeCheckIn && puedeCobrar && "grid-cols-2")}>
          {puedeCheckIn ? (
            <Button
              className="rounded-xl"
              disabled={ocupado}
              onClick={() => onTransition(cita, "en_proceso")}
              size="touch"
              type="button"
            >
              <UserCheck aria-hidden="true" /> {TRANSICION_LABEL.en_proceso}
            </Button>
          ) : null}
          {puedeCobrar ? (
            <Button
              className="rounded-xl bg-success text-success-foreground hover:bg-success/90"
              disabled={ocupado}
              onClick={() => onCobrar(cita)}
              size="touch"
              type="button"
            >
              <ShoppingCart aria-hidden="true" /> {cita.ventaId ? "Ver venta" : "Cobrar"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
            Servicios
          </h3>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {formatCurrency(cita.totalEstimado, { currency })}
          </span>
        </div>
        {cita.servicios.length === 0 ? (
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            Sin servicios en esta cita.
          </p>
        ) : (
          <ul className="space-y-2">
            {cita.servicios.map((servicio) => (
              <li
                className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-4 py-2 text-sm"
                key={servicio.id}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{servicio.nombre}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatCurrency(servicio.precio, { currency })}
                </span>
                {editable ? (
                  <Button
                    aria-label={`Quitar ${servicio.nombre}`}
                    disabled={ocupado}
                    onClick={() => toggleServicio(servicio.id, false)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" className="text-destructive" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {editable && disponibles.length > 0 ? (
          <Combobox
            clearable={false}
            disabled={ocupado}
            emptyMessage="No hay más servicios disponibles."
            items={disponibles.map((servicio) => ({
              value: servicio.id,
              label: servicio.nombre,
              description: `${formatCurrency(servicio.precioBase, { currency })} · ${servicio.duracionMinutos} min`,
            }))}
            onValueChange={(value) => {
              if (value) toggleServicio(value, true);
            }}
            placeholder="+ Agregar servicio"
            value={null}
          />
        ) : null}
      </section>

      {cita.recursos.length > 0 || (editable && recursosDisponibles.length > 0) ? (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
            Recursos
          </h3>
          {cita.recursos.length === 0 ? (
            <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              Sin recursos asignados.
            </p>
          ) : (
            <ul className="space-y-2">
              {cita.recursos.map((recurso) => (
                <li
                  className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-4 py-2 text-sm"
                  key={recurso.id}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{recurso.nombre}</span>
                  {editable ? (
                    <Button
                      aria-label={`Liberar ${recurso.nombre}`}
                      disabled={ocupado}
                      onClick={() => toggleRecurso(recurso.id, false)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <X aria-hidden="true" className="text-destructive" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {editable && recursosDisponibles.length > 0 ? (
            <Combobox
              clearable={false}
              disabled={ocupado}
              emptyMessage="No hay más recursos disponibles."
              items={recursosDisponibles.map((recurso) => ({
                value: recurso.id,
                label: recurso.nombre,
                description: recurso.tipo,
              }))}
              onValueChange={(value) => {
                if (value) toggleRecurso(value, true);
              }}
              placeholder="+ Asignar recurso"
              value={null}
            />
          ) : null}
        </section>
      ) : null}

      <CitaAnticipos
        cita={cita}
        currency={currency}
        editable={editable}
        onChanged={onToggleServicio}
        organizationId={organizationId}
      />

      {cita.notas ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
            Notas de la cita
          </h3>
          <p className="mt-2 rounded-xl bg-muted/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
            {cita.notas}
          </p>
        </section>
      ) : null}

      {cita.clienteNotas ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-warning">
            Notas del cliente / alergias
          </h3>
          <p className="mt-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-warning-soft-foreground">
            {cita.clienteNotas}
          </p>
        </section>
      ) : null}

      {/* Ficha técnica: registro rápido mientras la cita está en proceso. */}
      {cita.estado === "en_proceso" && cita.clienteId ? (
        <details className="rounded-xl border border-border bg-muted/60 px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-primary select-none">
            Registrar en ficha técnica
          </summary>
          <div className="mt-3">
            <FichaForm
              citaId={cita.id}
              clienteId={cita.clienteId}
              compact
              onSaved={onToggleServicio}
              organizationId={organizationId}
              servicioId={cita.servicios[0]?.id}
            />
          </div>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {editable ? (
          <Button
            className="rounded-xl"
            disabled={ocupado}
            onClick={onEdit}
            type="button"
            variant="outline"
          >
            <Pencil aria-hidden="true" /> Editar
          </Button>
        ) : null}
        {puedeMover ? (
          <Button
            className="rounded-xl"
            disabled={ocupado}
            onClick={onMove}
            type="button"
            variant="outline"
          >
            <MoveRight aria-hidden="true" /> Mover
          </Button>
        ) : null}
        {puedeReagendar ? (
          <Button
            className="rounded-xl"
            disabled={ocupado}
            onClick={onReschedule}
            type="button"
            variant="outline"
          >
            <RefreshCcw aria-hidden="true" /> Cambiar fecha
          </Button>
        ) : null}
        {puedeConfirmar ? (
          <Button
            className="rounded-xl"
            disabled={ocupado}
            onClick={() => onTransition(cita, "confirmada")}
            type="button"
            variant="outline"
          >
            <Check aria-hidden="true" /> {TRANSICION_LABEL.confirmada}
          </Button>
        ) : null}
      </div>

      <CitaHistorial citaId={cita.id} organizationId={organizationId} timeZone={timeZone} />

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {puedeCancelar ? (
          <ConfirmDialog
            confirmLabel={TRANSICION_LABEL.cancelada}
            description={`La cita pasará a "${ESTADO_BD_LABEL.cancelada}".`}
            onConfirm={() => onTransition(cita, "cancelada")}
            title="Cancelar esta cita?"
            trigger={
              <Button className="rounded-xl" disabled={ocupado} type="button" variant="destructive">
                {TRANSICION_LABEL.cancelada}
              </Button>
            }
          />
        ) : null}
        {puedeNoAsistio ? (
          <ConfirmDialog
            confirmLabel={TRANSICION_LABEL.no_asistio}
            description={`La cita pasará a "${ESTADO_BD_LABEL.no_asistio}".`}
            destructive={false}
            onConfirm={() => onTransition(cita, "no_asistio")}
            title="Marcar como no asistió?"
            trigger={
              <Button className="rounded-xl" disabled={ocupado} type="button" variant="outline">
                {TRANSICION_LABEL.no_asistio}
              </Button>
            }
          />
        ) : null}
        <ConfirmDialog
          confirmLabel="Ocultar cita"
          description="La cita dejará de aparecer en la agenda. Este cambio puede revertirse desde la base de datos."
          onConfirm={onToggleActiva}
          title="Ocultar esta cita?"
          trigger={
            <Button className="rounded-xl" disabled={ocupado} type="button" variant="ghost">
              Ocultar cita
            </Button>
          }
        />
      </div>
    </div>
  );
}
