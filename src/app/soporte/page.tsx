import Link from "next/link";
import { LifeBuoy, Mail, MessageCircleQuestion } from "lucide-react";

export const metadata = { title: "Soporte — Beauty POS" };

export default function SoportePage() {
  return (
    <main className="min-h-screen bg-[#faf9f7] text-[#292522]">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6 lg:px-10">
        <Link className="flex items-center gap-3" href="/">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#2c2522] text-sm font-semibold text-[#f6eadf]">
            BP
          </div>
          <p className="font-semibold tracking-tight">Beauty POS</p>
        </Link>
        <Link
          className="inline-flex h-8 items-center rounded-lg border border-[#ded5ce] bg-white px-4 text-sm font-medium transition-colors hover:bg-[#f4f1ee]"
          href="/login"
        >
          Iniciar sesión
        </Link>
      </header>

      <section className="mx-auto w-full max-w-4xl px-6 pb-20 pt-10 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#ae6f54]">Soporte</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Estamos para ayudarte</h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[#74675f]">
          Ya sea que estés en tu periodo de prueba o con una suscripción activa,
          tu operación no se detiene.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          <div className="rounded-3xl border border-[#eee6e0] bg-white p-6">
            <LifeBuoy className="size-5 text-[#8a5140]" />
            <h2 className="mt-4 font-semibold">Dentro del sistema</h2>
            <p className="mt-2 text-sm leading-6 text-[#6e6159]">
              La sección <strong>Ayuda</strong> del panel tiene la guía paso a paso
              y el modo práctica para aprender sin riesgo.
            </p>
          </div>
          <div className="rounded-3xl border border-[#eee6e0] bg-white p-6">
            <Mail className="size-5 text-[#8a5140]" />
            <h2 className="mt-4 font-semibold">Correo</h2>
            <p className="mt-2 text-sm leading-6 text-[#6e6159]">
              Escríbenos a{" "}
              <a className="font-medium text-[#a76348] underline underline-offset-2" href="mailto:soporte@beautypos.app">
                soporte@beautypos.app
              </a>{" "}
              y te respondemos en horario laboral.
            </p>
          </div>
          <div className="rounded-3xl border border-[#eee6e0] bg-white p-6">
            <MessageCircleQuestion className="size-5 text-[#8a5140]" />
            <h2 className="mt-4 font-semibold">Preguntas frecuentes</h2>
            <p className="mt-2 text-sm leading-6 text-[#6e6159]">
              Revisa las dudas más comunes en la{" "}
              <Link className="font-medium text-[#a76348] underline underline-offset-2" href="/precios">
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
