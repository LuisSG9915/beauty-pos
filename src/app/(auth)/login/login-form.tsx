"use client";

import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      const { error } = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/admin",
      });

      if (error) {
        setErrorMessage("El correo o la contraseña no son correctos.");
        return;
      }

      router.push("/admin");
      router.refresh();
    });
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#4b403a]">Correo de acceso</span>
        <span className="flex items-center gap-3 rounded-xl border border-[#e3d9d1] bg-white px-3.5 focus-within:border-[#b8795d] focus-within:ring-3 focus-within:ring-[#b8795d]/10">
          <Mail className="size-4 text-[#a18d81]" />
          <input
            required
            autoComplete="email"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#b6a9a1]"
            name="email"
            placeholder="tu@salon.com"
            type="email"
          />
        </span>
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[#4b403a]">Contraseña</span>
        <span className="flex items-center gap-3 rounded-xl border border-[#e3d9d1] bg-white px-3.5 focus-within:border-[#b8795d] focus-within:ring-3 focus-within:ring-[#b8795d]/10">
          <LockKeyhole className="size-4 text-[#a18d81]" />
          <input
            required
            autoComplete="current-password"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#b6a9a1]"
            name="password"
            placeholder="Tu contraseña"
            type="password"
          />
        </span>
      </label>

      {errorMessage ? (
        <p className="rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a34e3b]" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <Button className="h-11 w-full rounded-xl bg-[#2c2522] text-[#fffaf5] hover:bg-[#463a34]" disabled={isPending} type="submit">
        {isPending ? "Validando acceso..." : "Iniciar sesión"}
        {!isPending ? <ArrowRight className="size-4" /> : null}
      </Button>

      <p className="text-center text-xs leading-5 text-[#9a8c83]">
        El acceso se habilita mediante una invitación administrativa.
      </p>
    </form>
  );
}
