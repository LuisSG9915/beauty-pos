import Link from "next/link";

import { RegistroForm } from "@/app/registro/registro-form";
import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Crear cuenta" };

export default function RegistroPage() {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[0.95fr_1.05fr]">
      <section className="relative flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="absolute left-6 top-6 sm:left-10">
          <ThemeModeSelector iconOnly />
        </div>
        <div className="w-full max-w-md">
          <Link className="inline-flex rounded-lg outline-offset-4" href="/">
            <BrandWordmark markSize={36} />
          </Link>
          <div className="mt-10">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">
              Prueba gratis 14 días
            </p>
            <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.03em]">
              Pon tu salón en orden hoy
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Crea tu cuenta y empieza con tu agenda, tus clientes y tu caja. Sin
              tarjeta, sin compromiso — y si te gusta, todo lo que registraste se
              queda contigo al contratar.
            </p>
            <RegistroForm />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link className="font-semibold text-primary hover:text-primary/80" href="/login">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="relative hidden overflow-hidden bg-sidebar px-10 py-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-accent/70 blur-3xl" />
        <p className="relative text-sm font-semibold uppercase tracking-[0.22em] text-primary">
          Pensado para tu día a día
        </p>
        <div className="relative max-w-lg space-y-8 pb-8">
          {[
            {
              titulo: "Agenda y clientes sin fricción",
              detalle: "Citas, recordatorios y expediente de cada cliente en un solo lugar.",
            },
            {
              titulo: "Caja que cuadra sola",
              detalle: "Ventas, gastos y comisiones claras al final del día, sin hojas de cálculo.",
            },
            {
              titulo: "Empieza en minutos",
              detalle: "Una guía paso a paso te ayuda a cargar tus servicios y hacer tu primera venta.",
            },
          ].map((item) => (
            <div className="border-l-2 border-primary/50 pl-5" key={item.titulo}>
              <p className="font-semibold">{item.titulo}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.detalle}</p>
            </div>
          ))}
        </div>
        <p className="relative text-xs text-muted-foreground">{BRAND.name} · {BRAND.descriptor} en México</p>
      </section>
    </main>
  );
}
