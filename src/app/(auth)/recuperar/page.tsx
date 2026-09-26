import Link from "next/link";

import { RecuperarForm } from "@/app/(auth)/recuperar/recuperar-form";
import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";

export default function RecuperarPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="absolute right-6 top-6">
        <ThemeModeSelector iconOnly />
      </div>
      <div className="w-full max-w-md">
        <Link className="inline-flex rounded-lg outline-offset-4" href="/">
          <BrandWordmark markSize={36} />
        </Link>
        <div className="mt-10">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Recupera tu acceso</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">¿Olvidaste tu contraseña?</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Escribe el correo con el que entras a Melena y te enviaremos un enlace para crear una contraseña nueva.
          </p>
          <RecuperarForm />
        </div>
      </div>
    </main>
  );
}
