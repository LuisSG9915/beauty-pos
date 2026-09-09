import { eq } from "drizzle-orm";

import { AcceptInvitationForm } from "@/app/invitacion/[token]/accept-form";
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
    <main className="flex min-h-screen items-center justify-center bg-[#faf9f7] px-6 py-12 text-[#292522]">
      <section className="w-full max-w-md rounded-3xl border border-[#eadfd8] bg-white p-8 shadow-[0_24px_80px_-32px_rgba(70,45,33,0.35)]">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-[#2c2522] text-sm font-semibold text-[#f6eadf]">BP</div>
        <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-[#b8795d]">Beauty POS</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Acepta tu invitación</h1>
        {valid ? (
          <AcceptInvitationForm token={token} email={invitation.correo} name={invitation.nombre} />
        ) : (
          <p className="mt-5 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm leading-6 text-[#a34e3b]">Esta invitación no existe, expiró o ya fue utilizada.</p>
        )}
      </section>
    </main>
  );
}
