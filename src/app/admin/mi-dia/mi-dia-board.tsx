"use client";

import { CheckCircle2, CirclePlay, ClipboardList, Coins, Scissors, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { updateCitaEstado } from "@/app/admin/agenda/actions";
import { CitaStatusBadge } from "@/app/admin/agenda/cita-side-panel";
import { iniciarVentaDeCita } from "@/app/admin/pos/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";

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

  const cambiarEstado = (cita: MiDiaCita, estado: string) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("citaId", cita.id);
    data.set("estado", estado);
    startTransition(async () => {
      const result = await updateCitaEstado(data);
      if (result.success) {
        toast.success(result.message ?? "Estado actualizado.");
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
    startTransition(async () => {
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

  return (
    <div className="space-y-5">
      <section
        aria-label="Resumen del día"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Scissors aria-hidden="true" className="size-3.5 text-primary" /> Completadas
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
            {resumen.completadas}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ClipboardList aria-hidden="true" className="size-3.5 text-primary" /> Por atender
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
            {resumen.pendientes}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Coins aria-hidden="true" className="size-3.5 text-primary" /> Propinas
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-success">
            {formatCurrency(resumen.propinas, { currency })}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Wallet aria-hidden="true" className="size-3.5 text-primary" /> Comisiones
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-success">
            {formatCurrency(resumen.comisiones, { currency })}
          </p>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        {formatDate(`${fecha}T12:00:00Z`, { timeZone: "UTC" })} · {citas.length}{" "}
        {citas.length === 1 ? "cita" : "citas"}
      </p>

      {citas.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center shadow-sm">
          <p className="text-base font-medium text-foreground">Sin citas asignadas hoy</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Cuando la recepción te asigne una cita aparecerá aquí.
          </p>
        </section>
      ) : (
        <ol className="space-y-3">
          {citas.map((cita) => {
            const ventaAbierta = cita.ventaId != null && cita.ventaEstado === "en_proceso";
            const ventaCobrada = cita.ventaId != null && cita.ventaEstado === "completada";
            const enCurso = cita.estado === "en_proceso";
            const puedeCheckIn = ["pendiente", "confirmada"].includes(cita.estado);
            return (
              <li
                className={cn(
                  "rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
                  enCurso ? "border-[#e7bd66]" : "border-border",
                )}
                key={cita.id}
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
                      <p className="mt-1 text-xs text-muted-foreground">Nota: {cita.notas}</p>
                    ) : null}
                    {cita.clienteNotas ? (
                      <p className="mt-1.5 rounded-lg bg-[#ffe3ad] px-2.5 py-1.5 text-xs font-medium text-warning">
                        {cita.clienteNotas}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <CitaStatusBadge estado={cita.estado} />
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                      {formatCurrency(cita.totalEstimado, { currency })}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {puedeCheckIn ? (
                    <Button
                      data-action-clave="1"
                      data-action-id="mi_dia.cita.check_in"
                      disabled={pending}
                      onClick={() => cambiarEstado(cita, "en_proceso")}
                      size="touch"
                      type="button"
                    >
                      <CirclePlay aria-hidden="true" /> Cliente en silla
                    </Button>
                  ) : null}
                  {enCurso ? (
                    <>
                      {ventaAbierta ? (
                        <Button nativeButton={false} render={<Link href={ticketHref(cita.ventaId!)} />} size="touch">
                          Ir a cobro
                        </Button>
                      ) : (
                        <Button
                          data-action-clave="1"
                          data-action-id="mi_dia.cita.cobrar"
                          disabled={pending}
                          onClick={() => cobrar(cita)}
                          size="touch"
                          type="button"
                        >
                          Cobrar
                        </Button>
                      )}
                      {!ventaAbierta ? (
                        <Button
                          disabled={pending}
                          onClick={() => cambiarEstado(cita, "completada")}
                          size="touch"
                          type="button"
                          variant="outline"
                        >
                          <CheckCircle2 aria-hidden="true" /> Terminado
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  {ventaCobrada && cita.estado === "completada" ? (
                    <Button
                      nativeButton={false}
                      render={<Link href={ticketHref(cita.ventaId!)} />}
                      size="touch"
                      type="button"
                      variant="ghost"
                    >
                      Ver ticket
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
