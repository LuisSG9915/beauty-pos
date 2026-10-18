import { notFound } from "next/navigation";

import { ReservaFlow } from "@/app/reservar/[slug]/reserva-flow";
import { BrandMark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { obtenerReservaMeta } from "@/modules/reservas/queries";
import { dayKey } from "@/modules/agenda/timezone";

export const dynamic = "force-dynamic";

const DIAS_ANTICIPACION = 14;

function etiquetaDia(dk: string) {
  const fecha = new Date(`${dk}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(fecha);
}

export default async function ReservarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const { slug } = await params;
  const { p } = await searchParams;
  const meta = await obtenerReservaMeta(slug);
  if (!meta || meta.portal.sucursales.length === 0 || meta.servicios.length === 0) notFound();

  const { portal, servicios, profesionales } = meta;

  // Enlace directo del profesional (/reservar/slug?p=usuarioId): solo se
  // respeta si sigue siendo reservable en alguna sucursal.
  const preseleccion = typeof p === "string" ? p : null;
  const profesionalInicial =
    preseleccion && profesionales.some((prof) => prof.usuarioId === preseleccion) ? preseleccion : null;

  // Próximos días en la zona horaria de la primera sucursal (todas suelen
  // compartirla; el flujo recalcula por sucursal al cambiar).
  const tz = portal.sucursales[0]?.zonaHoraria ?? "America/Mexico_City";
  const hoy = dayKey(new Date(), tz);
  const dias: Array<{ diaKey: string; etiqueta: string }> = [];
  for (let i = 0; i < DIAS_ANTICIPACION; i += 1) {
    const fecha = new Date(`${hoy}T12:00:00Z`);
    fecha.setUTCDate(fecha.getUTCDate() + i);
    const dk = fecha.toISOString().slice(0, 10);
    dias.push({ diaKey: dk, etiqueta: i === 0 ? "Hoy" : i === 1 ? "Mañana" : etiquetaDia(dk) });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-6 py-6">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <p className="font-semibold tracking-tight">{portal.organizacion.nombre}</p>
            <p className="text-xs text-muted-foreground">Reserva tu cita en línea</p>
          </div>
        </div>
        <ThemeModeSelector iconOnly />
      </header>
      <ReservaFlow
        dias={dias}
        organizacion={portal.organizacion}
        profesionales={profesionales}
        profesionalInicial={profesionalInicial}
        servicios={servicios}
        sucursales={portal.sucursales}
      />
    </main>
  );
}
