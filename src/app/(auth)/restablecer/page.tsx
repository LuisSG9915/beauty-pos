import Link from "next/link";

import { RestablecerForm } from "@/app/(auth)/restablecer/restablecer-form";
import { BrandWordmark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";

export default async function RestablecerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Contraseña nueva</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">Crea tu contraseña nueva</h1>
          {token ? (
            <>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Elige una contraseña de al menos 8 caracteres que puedas recordar fácil.
              </p>
              <RestablecerForm token={token} />
            </>
          ) : (
            <div className="mt-8 space-y-5">
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
                Este enlace no es válido o ya se usó. Pide uno nuevo para crear tu contraseña.
              </p>
              <Link
                className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                href="/recuperar"
              >
                Pedir un enlace nuevo
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
