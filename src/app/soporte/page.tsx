import Link from "next/link";

import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { LifeBuoy, Mail, MessageCircleQuestion } from "lucide-react";

export const metadata = { title: "Soporte" };

export default function SoportePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6 lg:px-10">
        <Link className="inline-flex rounded-lg outline-offset-4" href="/">
          <BrandWordmark markSize={40} />
        </Link>
        <nav className="flex items-center gap-2">
          <ThemeModeSelector iconOnly />
          <Link
            className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted"
            href="/login"
          >
            Iniciar sesión
          </Link>
        </nav>
      </header>

      <section className="mx-auto w-full max-w-4xl px-6 pb-20 pt-10 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Soporte</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Estamos para ayudarte</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          Ya sea que estés en tu periodo de prueba o con una suscripción activa,
          tu operación no se detiene.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          <div className="rounded-3xl border border-border bg-card p-6">
            <LifeBuoy className="size-5 text-primary" />
            <h2 className="mt-4 font-semibold">Dentro del sistema</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              La sección <strong>Ayuda</strong> del panel tiene la guía paso a paso
              y el modo práctica para aprender sin riesgo.
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6">
            <Mail className="size-5 text-primary" />
            <h2 className="mt-4 font-semibold">Correo</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Escríbenos a{" "}
              <a className="font-medium text-primary underline underline-offset-2" href="mailto:soporte@melena.app">
                soporte@melena.app
              </a>{" "}
              y te respondemos en horario laboral.
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6">
            <MessageCircleQuestion className="size-5 text-primary" />
            <h2 className="mt-4 font-semibold">Preguntas frecuentes</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Revisa las dudas más comunes en la{" "}
              <Link className="font-medium text-primary underline underline-offset-2" href="/precios">
                página de precios
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
