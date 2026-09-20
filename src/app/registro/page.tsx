import Link from "next/link";

import { RegistroForm } from "@/app/registro/registro-form";

export const metadata = { title: "Crear cuenta — Beauty POS" };

export default function RegistroPage() {
  return (
    <main className="grid min-h-screen bg-[#faf9f7] lg:grid-cols-[0.95fr_1.05fr]">
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <Link className="inline-flex items-center gap-3" href="/">
            <span className="flex size-9 items-center justify-center rounded-xl bg-[#2c2522] text-xs font-semibold text-[#f6eadf]">BP</span>
            <span className="font-semibold">Beauty POS</span>
          </Link>
          <div className="mt-10">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#b8795d]">
              Prueba gratis 14 días
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#2c2522]">
              Pon tu salón en orden hoy
            </h1>
            <p className="mt-4 text-sm leading-6 text-[#81746c]">
              Crea tu cuenta y empieza con tu agenda, tus clientes y tu caja. Sin
              tarjeta, sin compromiso — y si te gusta, todo lo que registraste se
              queda contigo al contratar.
            </p>
            <RegistroForm />
            <p className="mt-6 text-center text-sm text-[#81746c]">
              ¿Ya tienes cuenta?{" "}
              <Link className="font-semibold text-[#b8795d] hover:text-[#96573f]" href="/login">
                Inicia sesión
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="relative hidden overflow-hidden bg-[#2c2522] px-10 py-10 text-[#fffaf5] lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-[#b8795d]/25 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 size-96 rounded-full bg-[#ead2c4]/10 blur-3xl" />
        <p className="relative text-sm font-semibold uppercase tracking-[0.22em] text-[#e9b59d]">
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
            <div className="border-l-2 border-[#b8795d]/50 pl-5" key={item.titulo}>
              <p className="font-semibold">{item.titulo}</p>
              <p className="mt-1 text-sm leading-6 text-[#d6c7bf]">{item.detalle}</p>
            </div>
          ))}
        </div>
        <p className="relative text-xs text-[#a8958a]">Beauty POS · Hecho para estéticas y salones</p>
      </section>
    </main>
  );
}
