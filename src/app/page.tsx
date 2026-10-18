import Link from "next/link";
import {
  CalendarDays,
  ChartNoAxesCombined,
  Scissors,
  ShieldCheck,
  Store,
  Wallet,
} from "lucide-react";

import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { Button } from "@/components/ui/button";
import { TelemetriaPing } from "@/components/telemetria-ping";
import { BRAND } from "@/lib/brand";

const benefits = [
  {
    icon: CalendarDays,
    title: "Agenda sin empalmes",
    description: "Tus clientes reservan en línea y cada cita queda lista para cobrarse al terminar.",
  },
  {
    icon: Wallet,
    title: "Caja que sí cuadra",
    description: "Ventas, gastos y comisiones conectados: cierras el día sabiendo cómo quedó el negocio.",
  },
  {
    icon: Scissors,
    title: "Clientes que regresan",
    description: "Historial, paquetes, membresías y promociones para que vuelvan sin perseguirlas por WhatsApp.",
  },
  {
    icon: Store,
    title: "Sucursales bajo control",
    description: "Equipos, cajas e inventario de cada sucursal, supervisados desde un solo lugar.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Decisiones con números",
    description: "Qué se vende, quién lo hace y cómo se paga — reportes claros por rango y sucursal.",
  },
  {
    icon: ShieldCheck,
    title: "Cada quien lo suyo",
    description: "Permisos por rol: recepción ve la agenda, estilistas su día y tú todo el negocio.",
  },
];

const steps = [
  {
    step: "1",
    title: "Crea tu salón",
    description: "Servicios, equipo y agenda listos en minutos, con guía inicial incluida.",
  },
  {
    step: "2",
    title: "Agenda y cobra",
    description: "Tus clientes reservan solas y cada cita se convierte en venta con un toque.",
  },
  {
    step: "3",
    title: "Cierra con claridad",
    description: "Corte de caja, gastos y comisiones al día — sin libreta ni Excel.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <TelemetriaPing origen="landing" />
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <BrandWordmark markSize={40} withDescriptor />
        <nav className="flex items-center gap-2">
          <ThemeModeSelector iconOnly />
          <Link
            className="hidden h-8 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted sm:inline-flex"
            href="/precios"
          >
            Precios
          </Link>
          <Link
            className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
            href="/login"
          >
            Iniciar sesión
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-16 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-24">
        {/* `min-w-0`: sin él, el grid item no encoge por debajo de su
            contenido (min-width: auto) y el hero desborda en móvil. */}
        <div className="min-w-0">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            Para salones, spas y estudios de belleza
          </p>
          <h1 className="max-w-3xl font-serif text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
            Todo tu salón,
            <span className="block italic text-primary">bajo control.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
            De la cita al corte de caja: agenda, clientes, cobros, inventario y
            comisiones conectados en un solo lugar. Menos libreta, más salón.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button
              className="h-11 rounded-xl px-6"
              data-action-clave="1"
              data-action-id="landing.registro.abrir"
              nativeButton={false}
              render={<Link href="/registro" />}
              size="lg"
            >
              Prueba gratis 14 días
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/precios" />}
              size="lg"
              variant="outline"
              className="h-11 rounded-xl px-6"
            >
              Ver planes y precios
            </Button>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            Diseñado para México · Precio fijo por negocio, no por persona · Sin tarjeta
          </p>
        </div>

        <div className="relative min-w-0">
          <div className="absolute -inset-5 rounded-[2.5rem] bg-accent blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <p className="text-op-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Resumen del día</p>
                <p className="mt-1 font-serif text-xl font-semibold">Casa Magnolia</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border px-2.5 py-1 text-op-xs font-medium text-muted-foreground">
                  Ejemplo ilustrativo
                </span>
                <div className="rounded-full bg-accent px-3 py-1.5 text-op-xs font-medium text-accent-foreground">Hoy, 8 sep</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 py-5">
              <div className="rounded-2xl bg-muted p-4">
                <p className="text-op-xs text-muted-foreground">Ventas</p>
                <p className="mt-2 text-2xl font-semibold">$18,450</p>
                <p className="mt-1 text-op-xs text-success">+12.8% vs. ayer</p>
              </div>
              <div className="rounded-2xl bg-muted p-4">
                <p className="text-op-xs text-muted-foreground">Citas de hoy</p>
                <p className="mt-2 text-2xl font-semibold">24</p>
                <p className="mt-1 text-op-xs text-muted-foreground">18 confirmadas</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Próximas citas</p>
                <span className="text-op-xs text-primary">Ver agenda</span>
              </div>
              <div className="space-y-3">
                {[
                  ["09:30", "Mariana López", "Color y corte", "En espera"],
                  ["10:15", "Sofía Ramírez", "Manicure gel", "Confirmada"],
                  ["11:00", "Camila Torres", "Facial hidratante", "Confirmada"],
                ].map(([time, name, service, status]) => (
                  <div className="flex items-center gap-3" key={`${time}-${name}`}>
                    <span className="w-12 text-op-xs font-semibold text-primary">{time}</span>
                    <div className="size-8 rounded-full bg-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate text-op-xs text-muted-foreground">{service}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-op-xs text-muted-foreground">{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-card/70">
        <div className="mx-auto grid w-full max-w-7xl gap-4 px-6 py-12 sm:grid-cols-2 lg:grid-cols-3 lg:px-10">
          {benefits.map(({ icon: Icon, title, description }) => (
            <div className="rounded-2xl p-4" key={title}>
              <Icon className="size-5 text-primary" strokeWidth={1.8} />
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-7xl px-6 py-16 lg:px-10">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            Cómo funciona
          </p>
          <h2 className="mt-4 max-w-xl font-serif text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            Ordena tu salón en tres pasos
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {steps.map(({ step, title, description }) => (
              <div key={step}>
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-accent font-serif text-lg font-semibold text-accent-foreground">
                  {step}
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center px-6 py-16 text-center lg:px-10">
          <h2 className="max-w-2xl font-serif text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            Menos caos. <span className="italic">Más salón.</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-primary-foreground">
            Prueba {BRAND.name} gratis 14 días y deja tu agenda, tu caja y tus
            comisiones trabajando juntas. Los primeros 100 negocios contratan con
            precio fundador.
          </p>
          <Button
            nativeButton={false}
            render={<Link href="/registro" />}
            size="lg"
            className="mt-8 h-11 rounded-xl bg-primary-foreground px-6 text-primary hover:bg-primary-foreground/90"
          >
            Crear mi cuenta gratis
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground lg:px-10">
          <p>© {BRAND.name} · {BRAND.descriptor} en México</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link className="inline-flex min-h-6 items-center hover:text-foreground" href="/precios">Precios</Link>
            <Link className="inline-flex min-h-6 items-center hover:text-foreground" href="/soporte">Soporte</Link>
            <Link className="inline-flex min-h-6 items-center hover:text-foreground" href="/terminos">Términos</Link>
            <Link className="inline-flex min-h-6 items-center hover:text-foreground" href="/privacidad">Privacidad</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
