import type { Metadata } from "next";

import { BrandMark } from "@/components/brand-mark";

export const metadata: Metadata = { title: "Sin conexión" };

/** Fallback del service worker cuando no hay red. */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#f9f8f9] px-6 text-center">
      <BrandMark size={64} />
      <h1 className="mt-6 text-xl font-semibold text-[#2b272c]">Sin conexión</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#5f5562]">
        No pudimos contactar el servidor. Revisa tu conexión y vuelve a intentar;
        tus datos están a salvo.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          className="rounded-xl bg-[#724b7f] px-5 py-2.5 text-sm font-medium text-white"
          href="/admin"
        >
          Reintentar
        </a>
        <a
          className="rounded-xl border border-[#724b7f] px-5 py-2.5 text-sm font-medium text-[#724b7f]"
          href="/offline/venta"
        >
          Registrar venta sin conexión
        </a>
      </div>
    </div>
  );
}
