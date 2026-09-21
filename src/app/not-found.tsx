import Link from "next/link";

/** 404 global del app router (fuera del shell admin). */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#f9f8f9] px-6 text-center">
      <p className="text-sm font-semibold tracking-widest text-[#724b7f]">404</p>
      <h1 className="mt-2 text-xl font-semibold text-[#2b272c]">Página no encontrada</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#5f5562]">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        className="mt-6 rounded-xl bg-[#724b7f] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5e396a]"
        href="/admin"
      >
        Ir al panel
      </Link>
    </div>
  );
}
