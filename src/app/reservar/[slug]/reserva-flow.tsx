"use client";

import { CalendarCheck2, CheckCircle2, ChevronLeft, Clock3, MapPin } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { confirmarReserva, obtenerSlotsReserva } from "@/app/reservar/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/ui/turnstile-widget";
import { formatCurrency, formatTime } from "@/lib/format";

type Sucursal = {
  id: string;
  nombre: string;
  direccion: string | null;
  autoConfirmar: boolean;
  zonaHoraria: string;
};

type Servicio = {
  id: string;
  nombre: string;
  descripcion: string | null;
  duracionMinutos: number;
  precio: string;
};

type Dia = { diaKey: string; etiqueta: string };

type Profesional = { sucursalId: string; usuarioId: string; nombre: string };

type Resultado =
  | { tipo: "confirmada"; gestionUrl: string | null }
  | { tipo: "pendiente"; gestionUrl: string | null }
  | { tipo: "error"; mensaje: string };

// Helpers memoizados de `@/lib/format`: los Intl anteriores se instanciaban
// por cada tarjeta/slot del render.
function formatoHora(iso: string, zonaHoraria: string) {
  return formatTime(iso, { timeZone: zonaHoraria });
}

function formatoPrecio(precio: string) {
  return formatCurrency(Number(precio), { currency: "MXN" });
}

/**
 * Flujo de reserva pública: sucursal → servicio → día → horario → datos.
 * Los horarios se piden al servidor por día elegido (no se precargan todos).
 */
export function ReservaFlow({
  dias,
  organizacion,
  profesionales,
  profesionalInicial,
  servicios,
  sucursales,
}: {
  dias: Dia[];
  organizacion: { id: string; nombre: string; slug: string };
  profesionales: Profesional[];
  /** Profesional preseleccionado por enlace directo (?p=usuarioId). */
  profesionalInicial?: string | null;
  servicios: Servicio[];
  sucursales: Sucursal[];
}) {
  const [sucursalId, setSucursalId] = useState(() => {
    // Con enlace directo del profesional se arranca en su sucursal; si no,
    // la primera reservable.
    if (profesionalInicial) {
      const asignacion = profesionales.find((p) => p.usuarioId === profesionalInicial);
      if (asignacion) return asignacion.sucursalId;
    }
    return sucursales[0]?.id ?? "";
  });
  // Con un solo servicio reservable ya viene elegido: un toque menos.
  const servicioUnico = servicios.length === 1 ? servicios[0].id : "";
  const [servicioId, setServicioId] = useState(servicioUnico);
  const [usuarioId, setUsuarioId] = useState(profesionalInicial ?? "");
  // Día preseleccionado cuando el servicio ya viene dado: los horarios de hoy
  // aparecen sin toque extra. Al elegir servicio también se auto-selecciona.
  const [diaKey, setDiaKey] = useState(() => (servicioUnico ? dias[0]?.diaKey ?? "" : ""));
  const [slotIso, setSlotIso] = useState("");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pending, startTransition] = useTransition();

  const sucursal = useMemo(
    () => sucursales.find((s) => s.id === sucursalId) ?? sucursales[0],
    [sucursalId, sucursales],
  );
  const servicio = servicios.find((s) => s.id === servicioId);
  const profesionalesSucursal = useMemo(
    () => profesionales.filter((p) => p.sucursalId === sucursal?.id),
    [profesionales, sucursal],
  );
  const profesional = profesionalesSucursal.find((p) => p.usuarioId === usuarioId);

  // En cada paso del embudo existe exactamente una acción primaria visible
  // (data-action-clave="1"): servicio → día → horario → confirmar. Sin ella
  // el check de usabilidad no encuentra acción principal en el estado inicial.
  const clavePaso: "servicio" | "dia" | "horario" | "confirmar" = !servicioId
    ? "servicio"
    : slotIso
      ? "confirmar"
      : slots && slots.length > 0
        ? "horario"
        : "dia";

  // Al cambiar sucursal/servicio/día se reinicia la selección de horario.
  const elegir = (fn: (v: string) => void) => (v: string) => {
    setSlotIso("");
    setSlots(null);
    setSlotsError(null);
    setResultado(null);
    fn(v);
  };

  // El primer día se auto-selecciona al elegir servicio (en el click, no en un
  // efecto): los horarios de hoy aparecen solos y "sin horarios" guía a otra
  // fecha. `elegir` conserva el día si ya había uno.
  const elegirServicio = (id: string) => {
    elegir(setServicioId)(id);
    if (!diaKey && dias[0]) setDiaKey(dias[0].diaKey);
  };

  useEffect(() => {
    if (!diaKey || !servicioId || !sucursal) return;
    let cancelado = false;
    startTransition(async () => {
      const res = await obtenerSlotsReserva({
        organizacionId: organizacion.id,
        sucursalId: sucursal.id,
        servicioId,
        diaKey,
        usuarioId: usuarioId || null,
      });
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
  }, [diaKey, servicioId, sucursal, usuarioId, organizacion.id]);

  function enviar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const turnstileToken = (data.get("cf-turnstile-response") as string | null) || null;
    startTransition(async () => {
      const res = await confirmarReserva({
        organizacionId: organizacion.id,
        sucursalId: sucursal.id,
        servicioId,
        fechaHora: slotIso,
        usuarioId: usuarioId || null,
        nombre: String(data.get("nombre") ?? ""),
        telefono: String(data.get("telefono") ?? ""),
        correo: String(data.get("correo") ?? ""),
        notas: String(data.get("notas") ?? ""),
        turnstileToken,
      });
      setResultado(
        res.ok
          ? res.confirmada
            ? { tipo: "confirmada", gestionUrl: res.gestionUrl }
            : { tipo: "pendiente", gestionUrl: res.gestionUrl }
          : { tipo: "error", mensaje: res.error },
      );
    });
  }

  if (resultado?.tipo === "confirmada" || resultado?.tipo === "pendiente") {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 pb-16">
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm anim-entrada">
          <CheckCircle2 aria-hidden="true" className="mx-auto size-12 text-success anim-pulso-svg" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            {resultado.tipo === "confirmada" ? "¡Cita confirmada!" : "Reserva recibida"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {resultado.tipo === "confirmada"
              ? `Te esperamos en ${sucursal.nombre}. Llega unos minutos antes de tu horario.`
              : `${organizacion.nombre} revisará tu solicitud y te confirmará por teléfono.`}
          </p>
          <dl className="mx-auto mt-6 max-w-sm space-y-2 rounded-2xl bg-muted p-5 text-left text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Servicio</dt>
              <dd className="font-medium">{servicio?.nombre}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Horario</dt>
              <dd className="font-medium">
                {dias.find((d) => d.diaKey === diaKey)?.etiqueta ?? diaKey} ·{" "}
                {formatoHora(slotIso, sucursal.zonaHoraria)}
              </dd>
            </div>
            {profesional ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Profesional</dt>
                <dd className="font-medium">{profesional.nombre}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Sucursal</dt>
              <dd className="font-medium">{sucursal.nombre}</dd>
            </div>
          </dl>
          {resultado.gestionUrl ? (
            <>
              <a
                className="mt-6 inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                data-action-id="reserva.gestion"
                href={resultado.gestionUrl}
              >
                Consultar o modificar mi cita
              </a>
              <p className="mx-auto mt-3 max-w-sm text-op-xs leading-5 text-muted-foreground">
                Guarda este enlace: con él puedes ver el estado de tu cita, cambiarla de fecha o cancelarla
                según la política del negocio. También llega en tu correo de confirmación.
              </p>
            </>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-8 px-6 pb-16">
      {/* Paso 1: sucursal (solo si hay más de una reservable) */}
      {sucursales.length > 1 ? (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Sucursal</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {sucursales.map((s, index) => (
              <button
                aria-pressed={s.id === sucursal.id}
                className={`rounded-2xl border p-4 text-left transition-[transform,background-color,border-color] duration-150 anim-entrada active:scale-[0.98] ${
                  s.id === sucursal.id
                    ? "border-primary bg-accent"
                    : "border-border bg-card hover:border-muted-foreground/40"
                }`}
                data-action-id="reserva.sucursal.elegir"
                key={s.id}
                onClick={() => {
                  elegir(setSucursalId)(s.id);
                  // Un profesional que no atiende la nueva sucursal se limpia
                  // (vuelve al carril "cualquiera disponible").
                  if (usuarioId && !profesionales.some((p) => p.sucursalId === s.id && p.usuarioId === usuarioId)) {
                    setUsuarioId("");
                  }
                }}
                style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                type="button"
              >
                <p className="font-medium line-clamp-2">{s.nombre}</p>
                {s.direccion ? (
                  <p className="mt-1 flex items-center gap-1 text-op-xs text-muted-foreground">
                    <MapPin aria-hidden="true" className="size-3 shrink-0" /> <span className="min-w-0 truncate">{s.direccion}</span>
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Paso 2: servicio */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Servicio</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {servicios.map((s, index) => (
            <button
              aria-pressed={s.id === servicioId}
              className={`rounded-2xl border p-4 text-left transition-[transform,background-color,border-color] duration-150 anim-entrada active:scale-[0.98] ${
                s.id === servicioId
                  ? "border-primary bg-accent"
                  : "border-border bg-card hover:border-muted-foreground/40"
              }`}
              data-action-clave={index === 0 && clavePaso === "servicio" ? "1" : undefined}
              data-action-id="reserva.servicio.elegir"
              key={s.id}
              onClick={() => elegirServicio(s.id)}
              style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
              type="button"
            >
              <p className="font-medium line-clamp-2">{s.nombre}</p>
              <p className="mt-1 flex items-center gap-2 text-op-xs text-muted-foreground">
                <Clock3 aria-hidden="true" className="size-3 shrink-0" />
                {s.duracionMinutos} min · {formatoPrecio(s.precio)}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Paso 3: profesional (opcional — por defecto cualquiera disponible) */}
      {servicioId && profesionalesSucursal.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Profesional</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button
              aria-pressed={usuarioId === ""}
              className={`rounded-2xl border p-4 text-left transition-[transform,background-color,border-color] duration-150 anim-entrada active:scale-[0.98] ${
                usuarioId === ""
                  ? "border-primary bg-accent"
                  : "border-border bg-card hover:border-muted-foreground/40"
              }`}
              data-action-id="reserva.profesional.elegir"
              onClick={() => elegir(setUsuarioId)("")}
              type="button"
            >
              <p className="font-medium">Cualquiera disponible</p>
              <p className="mt-1 text-op-xs text-muted-foreground">Te asignamos quien esté libre</p>
            </button>
            {profesionalesSucursal.map((p, index) => (
              <button
                aria-pressed={p.usuarioId === usuarioId}
                className={`rounded-2xl border p-4 text-left transition-[transform,background-color,border-color] duration-150 anim-entrada active:scale-[0.98] ${
                  p.usuarioId === usuarioId
                    ? "border-primary bg-accent"
                    : "border-border bg-card hover:border-muted-foreground/40"
                }`}
                data-action-id="reserva.profesional.elegir"
                key={p.usuarioId}
                onClick={() => elegir(setUsuarioId)(p.usuarioId)}
                style={{ animationDelay: `${Math.min(index + 1, 8) * 30}ms` }}
                type="button"
              >
                <p className="font-medium truncate">{p.nombre}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Paso 4: día */}
      {servicioId ? (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Día</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {dias.map((dia, index) => (
              <button
                aria-pressed={dia.diaKey === diaKey}
                className={`min-h-11 rounded-xl border px-4 py-2 text-sm transition-[transform,background-color,border-color] duration-150 anim-entrada active:scale-[0.98] ${
                  dia.diaKey === diaKey
                    ? "border-primary bg-accent font-semibold"
                    : "border-border bg-card hover:border-muted-foreground/40"
                }`}
                data-action-clave={index === 0 && clavePaso === "dia" ? "1" : undefined}
                data-action-id="reserva.dia.elegir"
                key={dia.diaKey}
                onClick={() => elegir(setDiaKey)(dia.diaKey)}
                style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                type="button"
              >
                {dia.etiqueta}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Paso 4: horario */}
      {diaKey ? (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Horario</h2>
          {pending && slots === null ? (
            <div
              aria-label="Buscando horarios disponibles"
              className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6"
              role="status"
            >
              {Array.from({ length: 6 }).map((_, index) => (
                <div aria-hidden="true" className="h-11 animate-pulse rounded-xl border border-border bg-card" key={index} />
              ))}
              <span className="sr-only">Buscando horarios disponibles…</span>
            </div>
          ) : null}
          {slotsError ? (
            <p
              className="mt-3 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground"
              role="alert"
            >
              {slotsError}
            </p>
          ) : null}
          {slots !== null && slots.length === 0 && !slotsError ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No quedan horarios libres ese día. Prueba con otra fecha.
            </p>
          ) : null}
          {slots && slots.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {slots.map((iso, index) => (
                <button
                  aria-pressed={iso === slotIso}
                  className={`min-h-11 rounded-xl border px-3 py-2 text-sm tabular-nums transition-[transform,background-color,border-color] duration-150 anim-entrada active:scale-[0.98] ${
                    iso === slotIso
                      ? "border-primary bg-primary font-semibold text-primary-foreground"
                      : "border-border bg-card hover:border-muted-foreground/40"
                  }`}
                  data-action-clave={index === 0 && clavePaso === "horario" ? "1" : undefined}
                  data-action-id="reserva.horario.elegir"
                  key={iso}
                  onClick={() => setSlotIso(iso)}
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                  type="button"
                >
                  {formatoHora(iso, sucursal.zonaHoraria)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Paso 5: datos */}
      {slotIso ? (
        <form className="rounded-3xl border border-border bg-card p-6 shadow-sm anim-entrada" onSubmit={enviar}>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            <CalendarCheck2 aria-hidden="true" className="size-4" /> Tus datos
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel required>Nombre completo</FieldLabel>
              <Input autoComplete="name" maxLength={160} name="nombre" required />
            </Field>
            <Field>
              <FieldLabel required>Teléfono</FieldLabel>
              <Input autoComplete="tel" maxLength={30} name="telefono" required type="tel" />
            </Field>
            <Field>
              <FieldLabel>Correo (opcional)</FieldLabel>
              <Input autoComplete="email" maxLength={254} name="correo" type="email" />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel>Notas (alergias, preferencias…)</FieldLabel>
              <Textarea maxLength={2000} name="notas" rows={2} />
            </Field>
          </div>
          <TurnstileWidget className="mt-4 flex justify-center" />
          {resultado?.tipo === "error" ? (
            <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground" role="alert">
              {resultado.mensaje}
            </p>
          ) : null}
          <div className="mt-5 flex items-center gap-3">
            <Button
              className="rounded-xl"
              data-action-id="reserva.horario.cambiar"
              onClick={() => setSlotIso("")}
              type="button"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" className="size-4" /> Cambiar horario
            </Button>
            <Button
              className="flex-1 rounded-xl text-sm font-semibold"
              data-action-clave={clavePaso === "confirmar" ? "1" : undefined}
              data-action-id="reserva.confirmar"
              disabled={pending}
              size="touch"
              type="submit"
            >
              {pending ? "Reservando…" : "Confirmar reserva"}
            </Button>
          </div>
          <p className="mt-3 text-op-xs leading-5 text-muted-foreground">
            {sucursal.autoConfirmar
              ? "Tu cita queda confirmada al instante."
              : "El equipo revisará tu solicitud y te confirmará por teléfono."}
          </p>
        </form>
      ) : null}
    </section>
  );
}
