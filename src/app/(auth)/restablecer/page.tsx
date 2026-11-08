import Link from "next/link";

import { RestablecerForm } from "@/app/(auth)/restablecer/restablecer-form";
import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { BRAND } from "@/lib/brand";

export default async function RestablecerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-sidebar px-10 py-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-accent/70 blur-3xl" />
        <div className="relative">
          <BrandWordmark markSize={40} withDescriptor />
        </div>
        <div className="relative max-w-xl pb-12">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-primary">Contraseña nueva</p>
          <h1 className="font-serif text-5xl font-semibold leading-[1.04] tracking-[-0.03em] xl:text-6xl">
            Crea una contraseña <span className="italic">que recuerdes.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">
            Elige una contraseña de al menos 12 caracteres para volver a entrar a tu salón.
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
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Contraseña nueva</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Crea tu contraseña nueva</h1>
            {token ? (
              <>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  Elige una contraseña de al menos 12 caracteres que puedas recordar fácil.
                </p>
                <RestablecerForm token={token} />
              </>
            ) : (
              <div className="anim-entrada mt-8 space-y-5">
                <p className="rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground" role="alert">
                  Este enlace no es válido o ya se usó. Pide uno nuevo para crear tu contraseña.
                </p>
                <Link
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  href="/recuperar"
                >
                  Pedir un enlace nuevo
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
