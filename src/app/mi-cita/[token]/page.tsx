import { Calendar, CalendarHeart, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { AntesDespuesSlider } from "@/components/antes-despues-slider";
import { BrandMark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { Button } from "@/components/ui/button";
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
  pendiente: "bg-warning-soft text-warning-soft-foreground border-warning/30",
  confirmada: "bg-success-soft text-success-soft-foreground border-success/30",
  en_proceso: "bg-info-soft text-info-soft-foreground border-info/30",
  completada: "bg-muted text-muted-foreground border-border",
  cancelada: "bg-destructive-soft text-destructive-soft-foreground border-destructive/30",
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
            <p className="text-op-xs text-muted-foreground">Estado de tu cita</p>
          </div>
        </div>
        <ThemeModeSelector iconOnly />
      </header>

      <section className="mx-auto w-full max-w-3xl px-6 pb-16">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Tu cita</h1>
            <span className={`rounded-full border px-3 py-1 text-op-xs font-semibold ${estilo}`}>
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

          {reserva.pasaporteBelleza ? (
            <section className="mt-8 space-y-6 rounded-3xl border border-primary/20 bg-gradient-to-b from-primary/5 via-card to-card p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles aria-hidden="true" className="size-4 text-primary" />
                    <span className="text-op-xs font-bold uppercase tracking-wider text-primary">
                      Tu Pasaporte de Belleza
                    </span>
                  </div>
                  <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
                    Transformación & Cuidado Personalizado
                  </h2>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-op-xs font-semibold text-primary">
                  {reserva.pasaporteBelleza.servicioNombre}
                </span>
              </div>

              {/* Comparador visual interactivo Antes / Después */}
              {reserva.pasaporteBelleza.antesUrl || reserva.pasaporteBelleza.despuesUrl ? (
                <div className="space-y-2">
                  <AntesDespuesSlider
                    antesUrl={reserva.pasaporteBelleza.antesUrl}
                    aspectRatioClass="aspect-[4/5] sm:aspect-video"
                    despuesUrl={reserva.pasaporteBelleza.despuesUrl}
                  />
                  <p className="text-center text-op-xs text-muted-foreground">
                    Desliza horizontalmente para comparar el antes y después de tu sesión.
                  </p>
                </div>
              ) : null}

              {/* Resumen o notas del ritual */}
              {reserva.pasaporteBelleza.resumenCuidado ? (
                <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                  <p className="text-op-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Notas del servicio
                  </p>
                  <p className="mt-1 font-mono text-op-xs leading-5 text-foreground">
                    {reserva.pasaporteBelleza.resumenCuidado}
                  </p>
                </div>
              ) : null}

              {/* Prescripción de Cuidado en Casa */}
              {reserva.pasaporteBelleza.rutinaCuidadoCasa.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ShieldCheck aria-hidden="true" className="size-4 text-success" />
                    Prescripción de mantenimiento en casa
                  </h3>
                  <ul className="space-y-2 text-op-xs">
                    {reserva.pasaporteBelleza.rutinaCuidadoCasa.map((tip, index) => (
                      <li
                        className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3"
                        key={index}
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-op-xs font-bold text-primary">
                          {index + 1}
                        </span>
                        <span className="leading-5 text-foreground">{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Radar de Próxima Cita Sugerida */}
              {reserva.pasaporteBelleza.retencion ? (
                <div className="space-y-3 rounded-2xl border border-primary/30 bg-primary/10 p-5">
                  <div className="flex items-center gap-2 text-op-xs font-bold uppercase tracking-wide text-primary">
                    <CalendarHeart aria-hidden="true" className="size-4" />
                    Radar de mantenimiento sugerido
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">
                      {reserva.pasaporteBelleza.retencion.tituloTratamiento}
                    </h4>
                    <p className="mt-0.5 text-op-xs leading-5 text-muted-foreground">
                      {reserva.pasaporteBelleza.retencion.motivoExplicativo}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/20 pt-2">
                    <div className="text-op-xs">
                      <span className="text-muted-foreground">Fecha ideal recomendada: </span>
                      <strong className="text-foreground">
                        {new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(
                          new Date(reserva.pasaporteBelleza.retencion.fechaSugeridaIso),
                        )}
                      </strong>
                    </div>
                    {reserva.pasaporteBelleza.retencion.linkReserva ? (
                      <Button
                        className="min-h-10 gap-1.5 rounded-xl text-op-xs"
                        data-action-id="mi_cita.retencion.reservar"
                        nativeButton={false}
                        render={<Link href={reserva.pasaporteBelleza.retencion.linkReserva} />}
                        size="sm"
                      >
                        <Calendar aria-hidden="true" className="size-3.5" />
                        Agendar retoque en línea
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <p className="mt-6 text-op-xs leading-5 text-muted-foreground">
            ¿No fuiste tú? Alguien con tu enlace puede ver esta cita. Comunícate con{" "}
            {reserva.organizacionNombre} si necesitas ayuda.{" "}
            <Link
              className="inline-flex min-h-6 items-center underline"
              data-action-id="mi_cita.reservar_otra"
              href={`/reservar/${reserva.organizacionSlug}`}
            >
              Reservar otra cita
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
