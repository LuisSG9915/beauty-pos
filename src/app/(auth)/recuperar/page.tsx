import Link from "next/link";

import { RecuperarForm } from "@/app/(auth)/recuperar/recuperar-form";
import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { BRAND } from "@/lib/brand";

export default function RecuperarPage() {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-sidebar px-10 py-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-accent/70 blur-3xl" />
        <div className="relative">
          <BrandWordmark markSize={40} withDescriptor />
        </div>
        <div className="relative max-w-xl pb-12">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-primary">Recupera tu acceso</p>
          <h1 className="font-serif text-5xl font-semibold leading-[1.04] tracking-[-0.03em] xl:text-6xl">
            Vuelve a entrar <span className="italic">sin contratiempos.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">
            Te enviamos un enlace para crear una contraseña nueva y seguir operando tu salón.
          </p>
        </div>
        <p className="relative text-op-xs text-muted-foreground">{BRAND.name} · Operación multisucursal</p>
      </section>

      <section className="relative flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="absolute right-6 top-6 sm:right-10">
          <ThemeModeSelector iconOnly />
        </div>
        <div className="w-full max-w-md">
          <Link className="inline-flex rounded-lg outline-offset-4 lg:hidden" href="/">
            <BrandWordmark markSize={36} />
          </Link>
          <div className="mt-12 lg:mt-0">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Recupera tu acceso</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">¿Olvidaste tu contraseña?</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Escribe el correo con el que entras a Melena y te enviaremos un enlace para crear una contraseña nueva.
            </p>
            <RecuperarForm />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              ¿Ya la recordaste?{" "}
              <Link
                className="inline-flex min-h-6 items-center font-semibold text-primary hover:text-primary/80"
                data-action-id="recuperar.login.abrir"
                href="/login"
              >
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
