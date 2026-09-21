import Link from "next/link";

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
  pendiente: "bg-[#fdf3e3] text-[#a06a1f] border-[#ecd9ae]",
  confirmada: "bg-[#eaf5ee] text-[#3f7a55] border-[#c8e2d2]",
  en_proceso: "bg-[#eef3f8] text-[#4d6a8a] border-[#d3dfec]",
  completada: "bg-[#f3f0ed] text-[#74675f] border-[#e0d8d2]",
  cancelada: "bg-[#faecea] text-[#a0473f] border-[#efd0cc]",
  no_asistio: "bg-[#f3f0ed] text-[#74675f] border-[#e0d8d2]",
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
      <main className="flex min-h-screen items-center justify-center bg-[#faf9f7] px-6 text-[#292522]">
        <div className="w-full max-w-md rounded-3xl border border-[#e4d9cf] bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Enlace no válido</h1>
          <p className="mt-3 text-sm leading-6 text-[#74675f]">
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
    <main className="min-h-screen bg-[#faf9f7] text-[#292522]">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-3 px-6 py-6">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-[#2c2522] text-sm font-semibold text-[#f6eadf]">
          {reserva.organizacionNombre.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold tracking-tight">{reserva.organizacionNombre}</p>
          <p className="text-xs text-[#6e6159]">Estado de tu cita</p>
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl px-6 pb-16">
        <div className="rounded-3xl border border-[#e4d9cf] bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Tu cita</h1>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${estilo}`}>
              {estado}
            </span>
          </div>

          <dl className="mt-6 space-y-3 rounded-2xl bg-[#faf6f3] p-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[#6e6159]">Fecha y hora</dt>
              <dd className="font-medium capitalize">
                {formatoFechaHora(reserva.fechaHora, reserva.zonaHoraria)}
              </dd>
            </div>
            {reserva.servicioNombre ? (
              <div className="flex justify-between gap-4">
                <dt className="text-[#6e6159]">Servicio</dt>
                <dd className="font-medium">{reserva.servicioNombre}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-[#6e6159]">Duración</dt>
              <dd className="font-medium">{reserva.duracionMinutos} min</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#6e6159]">Sucursal</dt>
              <dd className="font-medium">{reserva.sucursalNombre}</dd>
            </div>
            {reserva.clienteNombre ? (
              <div className="flex justify-between gap-4">
                <dt className="text-[#6e6159]">A nombre de</dt>
                <dd className="font-medium">{reserva.clienteNombre}</dd>
              </div>
            ) : null}
          </dl>

          <GestionPanel
            token={token}
            reserva={reserva}
          />

          <p className="mt-6 text-xs leading-5 text-[#a8958a]">
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
