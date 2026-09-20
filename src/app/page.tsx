import Link from "next/link";
import { CalendarDays, ChartNoAxesCombined, ShieldCheck, Store } from "lucide-react";

import { Button } from "@/components/ui/button";

const modules = [
  {
    icon: CalendarDays,
    title: "Agenda y citas",
    description: "Organiza la jornada y convierte cada cita en una venta en proceso.",
  },
  {
    icon: Store,
    title: "Multi-sucursal",
    description: "Administra equipos, cajas y operación desde un solo lugar.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Reportes claros",
    description: "Toma decisiones con ventas, ocupación e inventario en contexto.",
  },
  {
    icon: ShieldCheck,
    title: "Seguridad integrada",
    description: "Permisos por rol y organización desde el inicio del sistema.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col bg-[#faf9f7] text-[#292522]">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#2c2522] text-sm font-semibold text-[#f6eadf]">
            BP
          </div>
          <div>
            <p className="font-semibold tracking-tight">Beauty POS</p>
            <p className="text-xs text-[#8a7b72]">Gestión para tu belleza</p>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            className="hidden h-8 items-center rounded-lg px-3 text-sm font-medium text-[#6b5d54] transition-colors hover:bg-[#f4f1ee] sm:inline-flex"
            href="/precios"
          >
            Precios
          </Link>
          <Link
            className="inline-flex h-8 items-center rounded-lg border border-[#ded5ce] bg-white px-4 text-sm font-medium transition-colors hover:bg-[#f4f1ee]"
            href="/login"
          >
            Iniciar sesión
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-16 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:px-10 lg:py-24">
        <div>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-[#ae6f54]">
            Próxima generación para salones
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.03] tracking-[-0.05em] text-[#292522] sm:text-6xl lg:text-7xl">
            Menos administración.
            <span className="block text-[#b8795d]">Más tiempo para consentir.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#74675f]">
            Una operación sencilla para conectar citas, clientes, servicios,
            inventario y ventas en cada sucursal de tu salón.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button
              nativeButton={false}
              render={<Link href="/registro" />}
              size="lg"
              className="h-11 rounded-xl bg-[#2c2522] px-6 text-[#fffaf5] hover:bg-[#463a34]"
            >
              Prueba gratis 14 días
            </Button>
            <Button
              nativeButton={false}
              render={<Link href="/precios" />}
              size="lg"
              variant="outline"
              className="h-11 rounded-xl border-[#ded5ce] bg-white px-6"
            >
              Ver planes y precios
            </Button>
          </div>
          <p className="mt-5 text-sm text-[#988b82]">
            Diseñado para México · Sin tarjeta · Tus datos se conservan al contratar
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-5 rounded-[2.5rem] bg-[#f1dfd3] blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-[#eadfd8] bg-white p-5 shadow-[0_24px_80px_-32px_rgba(70,45,33,0.35)]">
            <div className="flex items-center justify-between border-b border-[#f0e9e4] pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#a7978e]">Resumen del día</p>
                <p className="mt-1 text-xl font-semibold">Casa Magnolia</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-[#e5ddd6] px-2.5 py-1 text-[10px] font-medium text-[#a7978e]">
                  Ejemplo ilustrativo
                </span>
                <div className="rounded-full bg-[#f8eee8] px-3 py-1.5 text-xs font-medium text-[#a76348]">Hoy, 8 sep</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 py-5">
              <div className="rounded-2xl bg-[#f8f5f2] p-4">
                <p className="text-xs text-[#95877e]">Ventas</p>
                <p className="mt-2 text-2xl font-semibold">$18,450</p>
                <p className="mt-1 text-xs text-[#5d9a76]">+12.8% vs. ayer</p>
              </div>
              <div className="rounded-2xl bg-[#f8f5f2] p-4">
                <p className="text-xs text-[#95877e]">Citas de hoy</p>
                <p className="mt-2 text-2xl font-semibold">24</p>
                <p className="mt-1 text-xs text-[#95877e]">18 confirmadas</p>
              </div>
            </div>
            <div className="rounded-2xl border border-[#eee6e0] p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Próximas citas</p>
                <span className="text-xs text-[#a76348]">Ver agenda</span>
              </div>
              <div className="space-y-3">
                {[
                  ["09:30", "Mariana López", "Color y corte", "En espera"],
                  ["10:15", "Sofía Ramírez", "Manicure gel", "Confirmada"],
                  ["11:00", "Camila Torres", "Facial hidratante", "Confirmada"],
                ].map(([time, name, service, status]) => (
                  <div className="flex items-center gap-3" key={`${time}-${name}`}>
                    <span className="w-12 text-xs font-semibold text-[#a76348]">{time}</span>
                    <div className="size-8 rounded-full bg-[#e7d5cb]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate text-xs text-[#95877e]">{service}</p>
                    </div>
                    <span className="rounded-full bg-[#f4f1ee] px-2 py-1 text-[10px] text-[#786b63]">{status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#eee6e0] bg-white/70">
        <div className="mx-auto grid w-full max-w-7xl gap-4 px-6 py-10 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
          {modules.map(({ icon: Icon, title, description }) => (
            <div className="rounded-2xl p-4" key={title}>
              <Icon className="size-5 text-[#b8795d]" strokeWidth={1.8} />
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#81746c]">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#eee6e0]">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-[#8a7b72] lg:px-10">
          <p>© Beauty POS · Hecho para estéticas y salones en México</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            <Link className="hover:text-[#5d524b]" href="/precios">Precios</Link>
            <Link className="hover:text-[#5d524b]" href="/soporte">Soporte</Link>
            <Link className="hover:text-[#5d524b]" href="/terminos">Términos</Link>
            <Link className="hover:text-[#5d524b]" href="/privacidad">Privacidad</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
