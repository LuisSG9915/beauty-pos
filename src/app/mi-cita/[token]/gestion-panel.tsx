"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarClock, CircleAlert, XCircle } from "lucide-react";

import type { ReservaGestionPublica } from "@/modules/reservas/gestion";
import { dayKey } from "@/modules/agenda/timezone";
import { cancelarMiCita, reagendarMiCita, slotsMiCita } from "./actions";

type Aviso = { tipo: "ok" | "error"; mensaje: string } | null;

function etiquetaDia(dk: string, zonaHoraria: string) {
  const hoy = dayKey(new Date(), zonaHoraria);
  const fecha = new Date(`${dk}T12:00:00Z`);
  const manana = new Date(`${hoy}T12:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  if (dk === hoy) return "Hoy";
  if (dk === manana.toISOString().slice(0, 10)) return "Mañana";
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(fecha);
}

function formatoHora(iso: string, zonaHoraria: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zonaHoraria,
  }).format(new Date(iso));
}

/**
 * Acciones de autogestión: cancelar y reagendar dentro de la política de la
 * sucursal. La lista de días respeta el horizonte configurado; los horarios
 * libres se piden al servidor por día (re-validados también al confirmar).
 */
export function GestionPanel({ token, reserva }: { token: string; reserva: ReservaGestionPublica }) {
  const [modo, setModo] = useState<"menu" | "cancelar" | "reagendar">("menu");
  const [telefono, setTelefono] = useState("");
  const [diaKeySel, setDiaKeySel] = useState("");
  const [slotIso, setSlotIso] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [hecho, setHecho] = useState<"cancelada" | "reagendada" | null>(null);
  const [pending, startTransition] = useTransition();

  const dias = useMemo(() => {
    const tz = reserva.zonaHoraria;
    const hoy = dayKey(new Date(), tz);
    const lista: string[] = [];
    for (let i = 0; i < reserva.horizonteDias; i += 1) {
      const fecha = new Date(`${hoy}T12:00:00Z`);
      fecha.setUTCDate(fecha.getUTCDate() + i);
      lista.push(fecha.toISOString().slice(0, 10));
    }
    return lista;
  }, [reserva.horizonteDias, reserva.zonaHoraria]);

  useEffect(() => {
    if (modo !== "reagendar" || !diaKeySel) return;
    let cancelado = false;
    startTransition(async () => {
      const res = await slotsMiCita(token, diaKeySel);
      if (cancelado) return;
      if (res.ok) {
        setSlots(res.slots);
        setSlotsError(null);
      } else {
        setSlots([]);
        setSlotsError(res.error);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [modo, diaKeySel, token]);

  if (hecho === "cancelada") {
    return (
      <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
        <p className="font-semibold">Tu cita quedó cancelada.</p>
        <p className="mt-1">Recibirás un correo de confirmación de la cancelación.</p>
      </div>
    );
  }
  if (hecho === "reagendada") {
    return (
      <div className="mt-6 rounded-2xl border border-success/30 bg-success/10 p-5 text-sm text-success">
        <p className="font-semibold">Tu cita quedó reagendada.</p>
        <p className="mt-1">Recibirás un correo con el nuevo horario. Recarga la página para verlo.</p>
      </div>
    );
  }

  if (!reserva.gestionable) {
    return (
      <div className="mt-6 rounded-2xl bg-muted p-5 text-sm text-muted-foreground">
        <p>{reserva.motivoNoGestionable}</p>
      </div>
    );
  }

  const confirmarCancelacion = () => {
    startTransition(async () => {
      const res = await cancelarMiCita(token, telefono);
      if (res.ok) {
        setHecho("cancelada");
      } else {
        setAviso({ tipo: "error", mensaje: res.error });
      }
    });
  };

  const confirmarReagenda = () => {
    if (!slotIso) return;
    startTransition(async () => {
      const res = await reagendarMiCita(token, slotIso, telefono);
      if (res.ok) {
        setHecho("reagendada");
      } else {
        setAviso({ tipo: "error", mensaje: res.error });
      }
    });
  };

  return (
    <div className="mt-6 border-t border-border pt-6">
      {aviso ? (
        <div
          className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            aviso.tipo === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-success/30 bg-success/10 text-success"
          }`}
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{aviso.mensaje}</p>
        </div>
      ) : null}

      {modo === "menu" ? (
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:bg-accent"
            onClick={() => setModo("reagendar")}
            type="button"
          >
            <CalendarClock className="size-4" />
            Reagendar
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            onClick={() => setModo("cancelar")}
            type="button"
          >
            <XCircle className="size-4" />
            Cancelar cita
          </button>
          <p className="w-full text-xs leading-5 text-muted-foreground">
            Puedes cambiar o cancelar en línea hasta {reserva.cancelacionHoras} h antes de la cita.
          </p>
        </div>
      ) : null}

      {modo === "cancelar" ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5">
          <p className="text-sm font-semibold text-destructive">¿Cancelar tu cita?</p>
          <p className="mt-1 text-sm text-destructive">
            Esta acción no se puede deshacer. Si cambias de opinión tendrás que reservar de nuevo.
          </p>
          {reserva.verificacionContacto ? (
            <label className="mt-3 block text-sm text-destructive">
              Teléfono con el que reservaste
              <input
                autoComplete="tel"
                className="mt-1 w-full rounded-lg border border-destructive/30 bg-card px-3 py-2 text-sm text-foreground"
                inputMode="tel"
                onChange={(event) => setTelefono(event.target.value)}
                placeholder="55 1234 5678"
                type="tel"
                value={telefono}
              />
            </label>
          ) : null}
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              disabled={pending || (reserva.verificacionContacto && !telefono.trim())}
              onClick={confirmarCancelacion}
              type="button"
            >
              {pending ? "Cancelando…" : "Sí, cancelar mi cita"}
            </button>
            <button
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              onClick={() => setModo("menu")}
              type="button"
            >
              Volver
            </button>
          </div>
        </div>
      ) : null}

      {modo === "reagendar" ? (
        <div className="rounded-2xl border border-border bg-muted p-5">
          <p className="text-sm font-semibold">Elige un nuevo horario</p>
          {reserva.verificacionContacto ? (
            <label className="mt-3 block text-sm text-muted-foreground">
              Teléfono con el que reservaste
              <input
                autoComplete="tel"
                className="mt-1 w-full max-w-xs rounded-lg border border-input bg-card px-3 py-2 text-sm"
                inputMode="tel"
                onChange={(event) => setTelefono(event.target.value)}
                placeholder="55 1234 5678"
                type="tel"
                value={telefono}
              />
            </label>
          ) : null}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Día</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {dias.map((dk) => (
                <button
                  className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                    dk === diaKeySel
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-card hover:border-muted-foreground/40"
                  }`}
                  key={dk}
                  onClick={() => {
                    setDiaKeySel(dk);
                    setSlots(null);
                    setSlotIso("");
                    setSlotsError(null);
                  }}
                  type="button"
                >
                  {etiquetaDia(dk, reserva.zonaHoraria)}
                </button>
              ))}
            </div>
          </div>

          {diaKeySel ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Horario</p>
              {slots === null ? (
                <p className="mt-2 text-sm text-muted-foreground">Buscando horarios…</p>
              ) : slotsError ? (
                <p className="mt-2 text-sm text-destructive">{slotsError}</p>
              ) : slots.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No hay horarios libres este día.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {slots.map((iso) => (
                    <button
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                        iso === slotIso
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-muted-foreground/40"
                      }`}
                      key={iso}
                      onClick={() => setSlotIso(iso)}
                      type="button"
                    >
                      {formatoHora(iso, reserva.zonaHoraria)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-5 flex gap-3">
            <button
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              disabled={pending || !slotIso || (reserva.verificacionContacto && !telefono.trim())}
              onClick={confirmarReagenda}
              type="button"
            >
              {pending ? "Reagendando…" : "Confirmar nuevo horario"}
            </button>
            <button
              className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
              onClick={() => setModo("menu")}
              type="button"
            >
              Volver
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
