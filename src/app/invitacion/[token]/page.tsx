import { eq } from "drizzle-orm";

import { AcceptInvitationForm } from "@/app/invitacion/[token]/accept-form";
import { BrandMark } from "@/components/brand-mark";
import { ThemeModeSelector } from "@/components/theme-mode-selector";
import { BRAND } from "@/lib/brand";
import { getDatabase } from "@/db/client";
import { invitacionesUsuarios } from "@/db/schema/access";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const db = getDatabase();
  const [invitation] = await db
    .select({ correo: invitacionesUsuarios.correo, nombre: invitacionesUsuarios.nombre, estado: invitacionesUsuarios.estado, expiraAt: invitacionesUsuarios.expiraAt })
    .from(invitacionesUsuarios)
    .where(eq(invitacionesUsuarios.tokenHash, tokenHash))
    .limit(1);

  const valid = invitation && invitation.estado === "pendiente" && invitation.expiraAt > new Date();

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="absolute right-6 top-6">
        <ThemeModeSelector iconOnly />
      </div>
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <BrandMark size={40} />
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-primary">{BRAND.name}</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-[-0.03em]">Acepta tu invitación</h1>
        {valid ? (
          <AcceptInvitationForm token={token} email={invitation.correo} name={invitation.nombre} />
        ) : (
          <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">Esta invitación no existe, expiró o ya fue utilizada.</p>
        )}
      </section>
    </main>
  );
}
