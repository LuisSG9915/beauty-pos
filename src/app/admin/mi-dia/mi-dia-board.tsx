"use client";

import {
  CheckCircle2,
  CirclePlay,
  ClipboardList,
  Coins,
  Scissors,
  Sparkles,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";

import { updateCitaEstado } from "@/app/admin/agenda/actions";
import { CitaStatusBadge } from "@/app/admin/agenda/cita-side-panel";
import { FichaForm } from "@/app/admin/clientes/ficha-form";
import { iniciarVentaDeCita } from "@/app/admin/pos/actions";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";
import { TRANSICION_LABEL } from "@/modules/agenda/estados";

export type MiDiaCita = {
  id: string;
  fechaHora: string;
  duracionMinutos: number;
  estado: string;
  notas: string | null;
  totalEstimado: string;
  clienteId: string | null;
  clienteNombre: string;
  clienteNotas: string | null;
  ventaId: string | null;
  ventaEstado: string | null;
  /** Versión leída al cargar (concurrencia optimista de citas.version). */
  version?: number;
  servicios: string[];
};

export type MiDiaResumen = {
  completadas: number;
  pendientes: number;
  propinas: number;
  comisiones: number;
};

/**
 * Lista vertical "Mi día": una fila por cita con acciones grandes (≥48 px).
 * Check-in → en_proceso; Terminado → completada (bloqueado si hay venta
 * abierta — en ese caso el flujo correcto es cobrar primero).
 */
export function MiDiaBoard({
  citas,
  currency,
  fecha,
  organizationId,
  resumen,
  sucursalId,
  timeZone,
}: {
  citas: MiDiaCita[];
  currency: string;
  fecha: string;
  organizationId: string;
  resumen: MiDiaResumen;
  sucursalId: string;
  timeZone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [citaFicha, setCitaFicha] = useState<MiDiaCita | null>(null);
  // La cita resaltada con `anim-pulso` tras confirmarse el cambio de estado.
  const [resaltadaId, setResaltadaId] = useState<string | null>(null);
  const resaltadaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cambio de estado optimista: la fila refleja el nuevo estado al instante;
  // si el servidor falla revierte solo al cerrarse la transición.
  const [citasOptimistas, setCitaOptimista] = useOptimistic(
    citas,
    (current, update: { id: string; estado: string }) =>
      current.map((c) => (c.id === update.id ? { ...c, estado: update.estado } : c)),
  );

  const runCitaAction = (cita: MiDiaCita, action: string, work: () => Promise<void>) => {
    const key = `${cita.id}:${action}`;
    if (pending && pendingAction?.startsWith(`${cita.id}:`)) return;
    setPendingAction(key);
    startTransition(work);
  };

  const marcarResaltada = (citaId: string) => {
    setResaltadaId(citaId);
    if (resaltadaTimer.current) clearTimeout(resaltadaTimer.current);
    resaltadaTimer.current = setTimeout(() => setResaltadaId(null), 700);
  };

  const cambiarEstado = (cita: MiDiaCita, estado: string, action: string) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    data.set("estado", estado);
    if (cita.version !== undefined) data.set("version", String(cita.version));
    runCitaAction(cita, action, async () => {
      setCitaOptimista({ id: cita.id, estado });
      const result = await updateCitaEstado(data);
      if (result.success) {
        toast.success(result.message ?? "Estado actualizado.");
        marcarResaltada(cita.id);
        router.refresh();
      } else {
        toast.error(result.error ?? "No se pudo actualizar la cita.");
      }
    });
  };

  const cobrar = (cita: MiDiaCita) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    runCitaAction(cita, "cobrar", async () => {
      const result = await iniciarVentaDeCita(initialActionState as ActionState<{ ventaId: string }>, data);
      if (!result.success || !result.data?.ventaId) {
        toast.error(result.error ?? "No se pudo abrir la venta.");
        return;
      }
      router.push(
        buildAdminHref("/pos", {
          organizationId,
          sucursalId,
          extra: {
            ventaId: result.data.ventaId,
            returnTo: buildAdminHref("/mi-dia", { organizationId, sucursalId }),
          },
        }),
      );
    });
  };

  const ticketHref = (ventaId: string) =>
    buildAdminHref("/pos", {
      organizationId,
      sucursalId,
      extra: {
        ventaId,
        returnTo: buildAdminHref("/mi-dia", { organizationId, sucursalId }),
      },
    });

  // Acción primaria del profesional: la primera cita aún operable del día.
  // Si no hay ninguna, el "Ver agenda" del header es la acción clave.
  const primeraAccionableId = citasOptimistas.find((cita) =>
    ["pendiente", "confirmada", "en_proceso"].includes(cita.estado),
  )?.id;

  return (
    <div className="space-y-5">
      <section
        aria-label="Resumen del día"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          { icon: Scissors, label: "Completadas", value: resumen.completadas, valueClass: "text-foreground" },
          { icon: ClipboardList, label: "Por atender", value: resumen.pendientes, valueClass: "text-foreground" },
          { icon: Coins, label: "Propinas", value: formatCurrency(resumen.propinas, { currency }), valueClass: "text-success" },
          { icon: Wallet, label: "Comisiones", value: formatCurrency(resumen.comisiones, { currency }), valueClass: "text-success" },
        ].map((card, index) => (
          <div
            className="rounded-2xl border border-border bg-card p-4 shadow-sm anim-entrada"
            key={card.label}
            style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
          >
            <p className="flex items-center gap-1.5 text-op-xs font-medium text-muted-foreground">
              <card.icon aria-hidden="true" className="size-3.5 text-primary" /> {card.label}
            </p>
            <p className={cn("mt-1.5 text-2xl font-bold tabular-nums", card.valueClass)}>
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <p className="text-sm text-muted-foreground">
        {formatDate(`${fecha}T12:00:00Z`, { timeZone: "UTC" })} · {citas.length}{" "}
        {citas.length === 1 ? "cita" : "citas"}
      </p>

      {citas.length === 0 ? (
        <EmptyState
          action={
            <Button
              data-action-id="mi_dia.agenda.abrir"
              nativeButton={false}
              render={<Link href={buildAdminHref("/agenda", { organizationId, sucursalId })} />}
              size="touch"
            >
              Ver agenda
            </Button>
          }
          description="Cuando la recepción te asigne una cita aparecerá aquí."
          icon={Scissors}
          title="Sin citas asignadas hoy"
        />
      ) : (
        <ol className="space-y-3">
          {citasOptimistas.map((cita, index) => {
            const ventaAbierta = cita.ventaId != null && cita.ventaEstado === "en_proceso";
            const ventaCobrada = cita.ventaId != null && cita.ventaEstado === "completada";
            const enCurso = cita.estado === "en_proceso";
            const puedeCheckIn = ["pendiente", "confirmada"].includes(cita.estado);
            const citaBusy = pending && (pendingAction?.startsWith(`${cita.id}:`) ?? false);
            const accionBusy = (action: string) => pending && pendingAction === `${cita.id}:${action}`;
            return (
              <li
                aria-busy={citaBusy}
                className={cn(
                  "rounded-2xl border bg-card p-4 shadow-sm sm:p-5 anim-entrada",
                  enCurso ? "border-warning/60" : "border-border",
                  resaltadaId === cita.id && "anim-pulso",
                )}
                key={cita.id}
                style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold tabular-nums text-foreground">
                      {formatTime(cita.fechaHora, { timeZone })}
                      <span className="text-sm font-normal text-muted-foreground">
                        {cita.duracionMinutos} min
                      </span>
                    </p>
                    <p className="mt-0.5 text-base font-medium text-foreground">
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
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {cita.servicios.join(" · ") || "Sin servicios"}
                    </p>
                    {cita.notas ? (
                      <p className="mt-1 text-op-xs text-muted-foreground">Nota: {cita.notas}</p>
                    ) : null}
                    {cita.clienteNotas ? (
                      <p className="mt-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-op-xs font-medium text-warning-soft-foreground">
                        {cita.clienteNotas}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <CitaStatusBadge estado={cita.estado} ventaId={cita.ventaEstado === "completada" ? cita.ventaId : null} />
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                      {formatCurrency(cita.totalEstimado, { currency })}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {puedeCheckIn ? (
                    <Button
                      data-action-clave={cita.id === primeraAccionableId ? "1" : undefined}
                      data-action-id="mi_dia.cita.check_in"
                      disabled={citaBusy}
                      onClick={() => cambiarEstado(cita, "en_proceso", "check_in")}
                      size="touch"
                      type="button"
                    >
                      <CirclePlay aria-hidden="true" />
                      {accionBusy("check_in") ? "Registrando…" : TRANSICION_LABEL.en_proceso}
                    </Button>
                  ) : null}
                  {enCurso ? (
                    <>
                      {ventaAbierta ? (
                        <Button
                          data-action-clave={cita.id === primeraAccionableId ? "1" : undefined}
                          data-action-id="mi_dia.cita.abrir_cobro"
                          nativeButton={false}
                          render={<Link href={ticketHref(cita.ventaId!)} />}
                          size="touch"
                        >
                          Ir a cobro
                        </Button>
                      ) : (
                        <Button
                          data-action-clave={cita.id === primeraAccionableId ? "1" : undefined}
                          data-action-id="mi_dia.cita.cobrar"
                          disabled={citaBusy}
                          onClick={() => cobrar(cita)}
                          size="touch"
                          type="button"
                        >
                          {accionBusy("cobrar") ? "Abriendo cobro…" : "Cobrar"}
                        </Button>
                      )}
                      {!ventaAbierta ? (
                        <Button
                          data-action-id="mi_dia.cita.completar"
                          disabled={citaBusy}
                          onClick={() => cambiarEstado(cita, "completada", "completar")}
                          size="touch"
                          type="button"
                          variant="outline"
                        >
                          <CheckCircle2 aria-hidden="true" />
                          {accionBusy("completar") ? "Finalizando…" : TRANSICION_LABEL.completada}
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {ventaCobrada && cita.estado === "completada" ? (
                    <Button
                      data-action-id="mi_dia.cita.ver_ticket"
                      nativeButton={false}
                      render={<Link href={ticketHref(cita.ventaId!)} />}
                      size="touch"
                      type="button"
                      variant="ghost"
                    >
                      Ver ticket
                    </Button>
                  ) : null}
                  {cita.clienteId ? (
                    <Button
                      data-action-id="mi_dia.cita.ficha"
                      disabled={citaBusy}
                      onClick={() => setCitaFicha(cita)}
                      size="touch"
                      type="button"
                      variant="outline"
                    >
                      <Sparkles aria-hidden="true" className="size-4 text-primary" />
                      Ficha & Fórmula
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {citaFicha && citaFicha.clienteId ? (
        <Dialog onOpenChange={(open) => !open && setCitaFicha(null)} open={citaFicha != null}>
          <DialogContent className="max-h-[90dvh] w-[min(94vw,36rem)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Ficha & Recetario: {citaFicha.clienteNombre}</DialogTitle>
              <DialogDescription>
                Consulta fórmulas previas o registra la mezcla química y fotos de la sesión.
              </DialogDescription>
            </DialogHeader>
            <div className="pt-2">
              <FichaForm
                citaId={citaFicha.id}
                clienteId={citaFicha.clienteId}
                clienteNombre={citaFicha.clienteNombre}
                compact
                onSaved={() => {
                  setCitaFicha(null);
                  router.refresh();
                }}
                organizationId={organizationId}
                servicioNombre={citaFicha.servicios[0]}
                sucursalId={sucursalId}
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
