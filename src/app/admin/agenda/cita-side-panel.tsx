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
import { useTransition } from "react";

import { toggleServicioCita } from "@/app/admin/agenda/actions";
import type { AgendaCita } from "@/app/admin/agenda/agenda-board";
import { FichaForm } from "@/app/admin/clientes/ficha-form";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";
import {
  canRescheduleEstado,
  canTransitionEstado,
  isCitaEditable,
} from "@/modules/agenda";

// Etiquetas/tonos de estado compartidos con agenda-board (tarjetas y lista).
const ESTADO_TONE: Record<string, StatusTone> = {
  pendiente: "neutral",
  confirmada: "info",
  en_proceso: "warning",
  completada: "success",
  cancelada: "destructive",
  no_asistio: "neutral",
};

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  en_proceso: "En proceso",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const TRANSITION_LABEL: Record<string, string> = {
  confirmada: "Confirmar",
  en_proceso: "Cliente llegó",
  cancelada: "Cancelar cita",
  no_asistio: "No asistió",
};

export { ESTADO_LABEL };

export function CitaStatusBadge({ estado }: { estado: string }) {
  return (
    <StatusBadge tone={ESTADO_TONE[estado] ?? "neutral"}>
      {ESTADO_LABEL[estado] ?? estado}
    </StatusBadge>
  );
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-[#2d2926]">
              {cita.clienteId ? (
                <a
                  className="hover:text-[#8a5140] hover:underline"
                  href={buildAdminHref(`/clientes/${cita.clienteId}`, { organizationId })}
                >
                  {cita.clienteNombre}
                </a>
              ) : (
                cita.clienteNombre
              )}
            </h2>
            <CitaStatusBadge estado={cita.estado} />
          </div>
          <p className="mt-1 text-sm text-[#81746c]">
            {formatDate(cita.fechaHora, { timeZone })} · {formatTime(cita.fechaHora, { timeZone })} ·{" "}
            {cita.duracionMinutos} min
          </p>
          <p className="mt-1.5 text-sm font-medium text-[#625b55]">{profesional}</p>
          {cita.clienteTelefono ? (
            <a
              className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-[#8a5140] hover:underline"
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
              <UserCheck aria-hidden="true" /> Cliente llegó
            </Button>
          ) : null}
          {puedeCobrar ? (
            <Button
              className="rounded-xl bg-[#347052] text-white hover:bg-[#2a5a42]"
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
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
            Servicios
          </h3>
          <span className="text-xs font-semibold tabular-nums text-[#625b55]">
            {formatCurrency(cita.totalEstimado, { currency })}
          </span>
        </div>
        {cita.servicios.length === 0 ? (
          <p className="rounded-xl bg-[#f1eeea] px-4 py-3 text-sm text-[#625b55]">
            Sin servicios en esta cita.
          </p>
        ) : (
          <ul className="space-y-2">
            {cita.servicios.map((servicio) => (
              <li
                className="flex min-h-11 items-center gap-3 rounded-xl border border-[#eee8e3] px-4 py-2 text-sm"
                key={servicio.id}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{servicio.nombre}</span>
                <span className="text-xs tabular-nums text-[#625b55]">
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

      {cita.notas ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#8a5140]">
            Notas de la cita
          </h3>
          <p className="mt-2 rounded-xl bg-[#faf9f7] px-4 py-3 text-sm leading-6 text-[#625b55]">
            {cita.notas}
          </p>
        </section>
      ) : null}

      {cita.clienteNotas ? (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#986b16]">
            Notas del cliente / alergias
          </h3>
          <p className="mt-2 rounded-xl border border-[#e3c8a0] bg-[#fdf3e8] px-4 py-3 text-sm leading-6 text-[#986b16]">
            {cita.clienteNotas}
          </p>
        </section>
      ) : null}

      {/* Ficha técnica: registro rápido mientras la cita está en proceso. */}
      {cita.estado === "en_proceso" && cita.clienteId ? (
        <details className="rounded-xl border border-[#eadfd8] bg-[#faf9f7] px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[#8a5140] select-none">
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
            <RefreshCcw aria-hidden="true" /> Reagendar
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
            <Check aria-hidden="true" /> {TRANSITION_LABEL.confirmada}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[#eee8e3] pt-4">
        {puedeCancelar ? (
          <ConfirmDialog
            confirmLabel={TRANSITION_LABEL.cancelada}
            description={`La cita pasará a "${ESTADO_LABEL.cancelada}".`}
            onConfirm={() => onTransition(cita, "cancelada")}
            title="Cancelar esta cita?"
            trigger={
              <Button className="rounded-xl" disabled={ocupado} type="button" variant="destructive">
                {TRANSITION_LABEL.cancelada}
              </Button>
            }
          />
        ) : null}
        {puedeNoAsistio ? (
          <ConfirmDialog
            confirmLabel={TRANSITION_LABEL.no_asistio}
            description={`La cita pasará a "${ESTADO_LABEL.no_asistio}".`}
            destructive={false}
            onConfirm={() => onTransition(cita, "no_asistio")}
            title="Marcar como no asistió?"
            trigger={
              <Button className="rounded-xl" disabled={ocupado} type="button" variant="outline">
                {TRANSITION_LABEL.no_asistio}
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
