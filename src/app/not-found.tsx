import Link from "next/link";

/** 404 global del app router (fuera del shell admin). */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <p className="text-sm font-semibold tracking-widest text-primary">404</p>
      <h1 className="mt-2 text-xl font-semibold text-foreground">Página no encontrada</h1>
      <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        La página que buscas no existe o fue movida.
      </p>
      <Link
        className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        href="/admin"
      >
        Ir al panel
      </Link>
    </div>
  );
}
