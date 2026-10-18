"use client";

import { CalendarCheck2, CheckCircle2, ChevronLeft, Clock3, MapPin } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { confirmarReserva, obtenerSlotsReserva } from "@/app/reservar/[slug]/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Textarea } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/ui/turnstile-widget";

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

function formatoHora(iso: string, zonaHoraria: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zonaHoraria,
  }).format(new Date(iso));
}

function formatoPrecio(precio: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(precio));
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
  const [servicioId, setServicioId] = useState("");
  const [usuarioId, setUsuarioId] = useState(profesionalInicial ?? "");
  const [diaKey, setDiaKey] = useState("");
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

  // Al cambiar sucursal/servicio/día se reinicia la selección de horario.
  const elegir = (fn: (v: string) => void) => (v: string) => {
    setSlotIso("");
    setSlots(null);
    setSlotsError(null);
    setResultado(null);
    fn(v);
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
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto size-12 text-success" />
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
                href={resultado.gestionUrl}
              >
                Consultar o modificar mi cita
              </a>
              <p className="mx-auto mt-3 max-w-sm text-xs leading-5 text-muted-foreground">
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
            {sucursales.map((s) => (
              <button
                aria-pressed={s.id === sucursal.id}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  s.id === sucursal.id
                    ? "border-primary bg-accent"
                    : "border-border bg-card hover:border-muted-foreground/40"
                }`}
                key={s.id}
                onClick={() => {
                  elegir(setSucursalId)(s.id);
                  // Un profesional que no atiende la nueva sucursal se limpia
                  // (vuelve al carril "cualquiera disponible").
                  if (usuarioId && !profesionales.some((p) => p.sucursalId === s.id && p.usuarioId === usuarioId)) {
                    setUsuarioId("");
                  }
                }}
                type="button"
              >
                <p className="font-medium">{s.nombre}</p>
                {s.direccion ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {s.direccion}
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
          {servicios.map((s) => (
            <button
              aria-pressed={s.id === servicioId}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                s.id === servicioId
                  ? "border-primary bg-accent"
                  : "border-border bg-card hover:border-muted-foreground/40"
              }`}
              key={s.id}
              onClick={() => elegir(setServicioId)(s.id)}
              type="button"
            >
              <p className="font-medium">{s.nombre}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Clock3 className="size-3" />
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
              className={`rounded-2xl border p-4 text-left transition-colors ${
                usuarioId === ""
                  ? "border-primary bg-accent"
                  : "border-border bg-card hover:border-muted-foreground/40"
              }`}
              onClick={() => elegir(setUsuarioId)("")}
              type="button"
            >
              <p className="font-medium">Cualquiera disponible</p>
              <p className="mt-1 text-xs text-muted-foreground">Te asignamos quien esté libre</p>
            </button>
            {profesionalesSucursal.map((p) => (
              <button
                aria-pressed={p.usuarioId === usuarioId}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  p.usuarioId === usuarioId
                    ? "border-primary bg-accent"
                    : "border-border bg-card hover:border-muted-foreground/40"
                }`}
                key={p.usuarioId}
                onClick={() => elegir(setUsuarioId)(p.usuarioId)}
                type="button"
              >
                <p className="font-medium">{p.nombre}</p>
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
            {dias.map((dia) => (
              <button
                aria-pressed={dia.diaKey === diaKey}
                className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
                  dia.diaKey === diaKey
                    ? "border-primary bg-accent font-semibold"
                    : "border-border bg-card hover:border-muted-foreground/40"
                }`}
                key={dia.diaKey}
                onClick={() => elegir(setDiaKey)(dia.diaKey)}
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
            <p className="mt-3 text-sm text-muted-foreground">Buscando horarios disponibles…</p>
          ) : null}
          {slotsError ? (
            <p className="mt-3 text-sm text-destructive">{slotsError}</p>
          ) : null}
          {slots !== null && slots.length === 0 && !slotsError ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No quedan horarios libres ese día. Prueba con otra fecha.
            </p>
          ) : null}
          {slots && slots.length > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {slots.map((iso) => (
                <button
                  aria-pressed={iso === slotIso}
                  className={`rounded-xl border px-3 py-2 text-sm tabular-nums transition-colors ${
                    iso === slotIso
                      ? "border-primary bg-primary font-semibold text-primary-foreground"
                      : "border-border bg-card hover:border-muted-foreground/40"
                  }`}
                  key={iso}
                  onClick={() => setSlotIso(iso)}
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
        <form className="rounded-3xl border border-border bg-card p-6 shadow-sm" onSubmit={enviar}>
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            <CalendarCheck2 className="size-4" /> Tus datos
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
            <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
              {resultado.mensaje}
            </p>
          ) : null}
          <div className="mt-5 flex items-center gap-3">
            <Button
              className="rounded-xl"
              onClick={() => setSlotIso("")}
              type="button"
              variant="outline"
            >
              <ChevronLeft className="size-4" /> Cambiar horario
            </Button>
            <Button
              className="flex-1 rounded-xl py-3 text-sm font-semibold"
              disabled={pending}
              type="submit"
            >
              {pending ? "Reservando…" : "Confirmar reserva"}
            </Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {sucursal.autoConfirmar
              ? "Tu cita queda confirmada al instante."
              : "El equipo revisará tu solicitud y te confirmará por teléfono."}
          </p>
        </form>
      ) : null}
    </section>
  );
}
