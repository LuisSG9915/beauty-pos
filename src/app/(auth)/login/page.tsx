import Link from "next/link";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { BrandWordmark } from "@/components/brand-mark";
import { BRAND } from "@/lib/brand";

const AVISOS: Record<string, string> = {
  verifica: "Tu cuenta está lista. Te enviamos un correo con un enlace para verificarla — revísalo antes de iniciar sesión.",
  registrado: "Tu cuenta está lista. Inicia sesión para continuar.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const avisoKey = typeof params.verifica === "string" ? "verifica" : typeof params.registrado === "string" ? "registrado" : null;
  const aviso = avisoKey ? AVISOS[avisoKey] : null;
  return (
    <main className="grid min-h-screen bg-[#f9f8f9] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#29242a] px-10 py-10 text-[#faf6fd] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-[#724b7f]/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-[#ddcae4]/10 blur-3xl" />
        <div className="relative">
          <BrandWordmark markSize={40} tone="light" withDescriptor />
        </div>
        <div className="relative max-w-xl pb-12">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-[#d9c3e3]">Tu operación, en calma</p>
          <h1 className="font-serif text-5xl font-semibold leading-[1.04] tracking-[-0.03em] xl:text-6xl">
            Todo tu salón, <span className="italic">bajo control.</span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-[#cfc2d3]">
            Conecta agenda, clientes, servicios e inventario para que tu equipo se concentre en crear experiencias memorables.
          </p>
        </div>
        <p className="relative text-xs text-[#b3a4be]">{BRAND.name} · Operación multisucursal</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link className="inline-flex rounded-lg outline-offset-4 lg:hidden" href="/">
            <BrandWordmark markSize={36} />
          </Link>
          <div className="mt-12 lg:mt-0">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#724b7f]">Bienvenido de vuelta</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#29242a]">Ingresa a tu operación</h1>
            <p className="mt-4 text-sm leading-6 text-[#675d6a]">Usa las credenciales de tu invitación administrativa para continuar.</p>
            {aviso ? (
              <p className="mt-5 rounded-xl border border-[#d8e6d3] bg-[#f0f7ec] px-4 py-3 text-sm text-[#3d6b4a]" role="status">
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
