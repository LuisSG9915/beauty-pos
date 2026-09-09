import Link from "next/link";

import { LoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-[#faf9f7] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#2c2522] px-10 py-10 text-[#fffaf5] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-[#b8795d]/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-[#ead2c4]/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#f1dfd3] text-sm font-semibold text-[#2c2522]">BP</div>
          <div>
            <p className="font-semibold tracking-tight">Beauty POS</p>
            <p className="text-xs text-[#cbbab0]">Gestión para tu belleza</p>
          </div>
        </div>
        <div className="relative max-w-xl pb-12">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.22em] text-[#e9b59d]">Tu operación, en calma</p>
          <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.05em] xl:text-6xl">
            Todo tu salón en un solo lugar.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-8 text-[#d6c7bf]">
            Conecta agenda, clientes, servicios e inventario para que tu equipo se concentre en crear experiencias memorables.
          </p>
        </div>
        <p className="relative text-xs text-[#a8958a]">Beauty POS · Operación multisucursal</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link className="inline-flex items-center gap-3 lg:hidden" href="/">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#2c2522] text-xs font-semibold text-[#f6eadf]">BP</span>
            <span className="font-semibold">Beauty POS</span>
          </Link>
          <div className="mt-12 lg:mt-0">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b8795d]">Bienvenido de vuelta</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#2c2522]">Ingresa a tu operación</h1>
            <p className="mt-4 text-sm leading-6 text-[#81746c]">Usa las credenciales de tu invitación administrativa para continuar.</p>
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
