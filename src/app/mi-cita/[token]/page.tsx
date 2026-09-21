import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { clientIp } from "@/lib/client-ip";
import { obtenerReservaPorToken } from "@/modules/reservas/gestion";
import { GestionPanel } from "./gestion-panel";

export const dynamic = "force-dynamic";

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: "Pendiente de confirmación",
  confirmada: "Confirmada",
  en_proceso: "En atención",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const ESTILO_ESTADO: Record<string, string> = {
  pendiente: "bg-warning/10 text-warning border-warning/30",
  confirmada: "bg-success/10 text-success border-success/30",
  en_proceso: "bg-info/10 text-info border-info/30",
  completada: "bg-muted text-muted-foreground border-border",
  cancelada: "bg-destructive/10 text-destructive border-destructive/30",
  no_asistio: "bg-muted text-muted-foreground border-border",
};

function formatoFechaHora(iso: string, zonaHoraria: string) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: zonaHoraria,
  }).format(new Date(iso));
}

/**
 * Portal de autogestión de la cita. El token de la URL identifica la cita
 * (solo su hash vive en la base); la página expone únicamente datos seguros:
 * estado, horario, sucursal y servicio — nada financiero ni del staff.
 */
export default async function MiCitaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reserva = await obtenerReservaPorToken(token, { ip: await clientIp() });

  if (!reserva) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Enlace no válido</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Este enlace no corresponde a ninguna cita, fue revocado o se usó demasiadas veces en
            poco tiempo. Revisa tu correo de confirmación o comunícate con el negocio.
          </p>
        </div>
      </main>
    );
  }

  const estado = ETIQUETA_ESTADO[reserva.estado] ?? reserva.estado;
  const estilo = ESTILO_ESTADO[reserva.estado] ?? ESTILO_ESTADO.completada;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-6 py-6">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <p className="font-semibold tracking-tight">{reserva.organizacionNombre}</p>
            <p className="text-xs text-muted-foreground">Estado de tu cita</p>
          </div>
        </div>
        <ThemeModeSelector iconOnly />
      </header>

      <section className="mx-auto w-full max-w-3xl px-6 pb-16">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Tu cita</h1>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${estilo}`}>
              {estado}
            </span>
          </div>

          <dl className="mt-6 space-y-3 rounded-2xl bg-muted p-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Fecha y hora</dt>
              <dd className="font-medium capitalize">
                {formatoFechaHora(reserva.fechaHora, reserva.zonaHoraria)}
              </dd>
            </div>
            {reserva.servicioNombre ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Servicio</dt>
                <dd className="font-medium">{reserva.servicioNombre}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Duración</dt>
              <dd className="font-medium">{reserva.duracionMinutos} min</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Sucursal</dt>
              <dd className="font-medium">{reserva.sucursalNombre}</dd>
            </div>
            {reserva.clienteNombre ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">A nombre de</dt>
                <dd className="font-medium">{reserva.clienteNombre}</dd>
              </div>
            ) : null}
          </dl>

          <GestionPanel
            token={token}
            reserva={reserva}
          />

          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            ¿No fuiste tú? Alguien con tu enlace puede ver esta cita. Comunícate con{" "}
            {reserva.organizacionNombre} si necesitas ayuda.{" "}
            <Link className="underline" href={`/reservar/${reserva.organizacionSlug}`}>
              Reservar otra cita
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
