import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sin conexión — Beauty POS" };

/** Fallback del service worker cuando no hay red. */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#faf9f7] px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-[#f2e3dc] text-2xl font-bold text-[#8a5140]">
        B
      </div>
      <h1 className="mt-6 text-xl font-semibold text-[#2d2926]">Sin conexión</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#625b55]">
        No pudimos contactar el servidor. Revisa tu conexión y vuelve a intentar;
        tus datos están a salvo.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          className="rounded-xl bg-[#8a5140] px-5 py-2.5 text-sm font-medium text-white"
          href="/admin"
        >
          Reintentar
        </a>
        <a
          className="rounded-xl border border-[#8a5140] px-5 py-2.5 text-sm font-medium text-[#8a5140]"
          href="/offline/venta"
        >
          Registrar venta sin conexión
        </a>
      </div>
    </div>
  );
}
