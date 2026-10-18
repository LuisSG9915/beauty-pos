import Link from "next/link";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { BRAND } from "@/lib/brand";

const AVISOS: Record<string, string> = {
  verifica: "Tu cuenta está lista. Te enviamos un correo con un enlace para verificarla — revísalo antes de iniciar sesión.",
  registrado: "Tu cuenta está lista. Inicia sesión para continuar.",
  restablecida: "Tu contraseña nueva ya está guardada. Inicia sesión con ella.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const avisoKey = typeof params.verifica === "string" ? "verifica" : typeof params.registrado === "string" ? "registrado" : typeof params.restablecida === "string" ? "restablecida" : null;
  const aviso = avisoKey ? AVISOS[avisoKey] : null;
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-sidebar px-10 py-10 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-accent/70 blur-3xl" />
        <div className="relative">
          <BrandWordmark markSize={40} withDescriptor />
        </div>
        <div className="relative max-w-xl pb-12">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-primary">Tu operación, en calma</p>
          <h1 className="font-serif text-5xl font-semibold leading-[1.04] tracking-[-0.03em] xl:text-6xl">
            Todo tu salón, <span className="italic">bajo control.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">
            Conecta agenda, clientes, servicios e inventario para que tu equipo se concentre en crear experiencias memorables.
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
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Bienvenido de vuelta</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Ingresa a tu operación</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">Usa las credenciales de tu invitación administrativa para continuar.</p>
            {aviso ? (
              <p className="mt-5 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success" role="status">
                {aviso}
              </p>
            ) : null}
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
