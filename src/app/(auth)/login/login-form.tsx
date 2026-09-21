"use client";

import { ArrowRight, LockKeyhole, Mail } from "lucide-react";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
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
        setErrorMessage(
          error.status === 403
            ? "Tu correo aún no está verificado. Te reenviamos el enlace — revísalo e inténtalo de nuevo."
            : "El correo o la contraseña no son correctos.",
        );
        return;
      }

      router.push("/admin");
      router.refresh();
    });
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <Field className="space-y-2" name="email">
        <FieldLabel required>
          Correo de acceso
        </FieldLabel>
        <div className="flex items-center gap-3 rounded-xl border border-input bg-card px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <Mail className="size-4 text-muted-foreground" />
          <Input
            required
            autoComplete="email"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 focus:border-transparent focus:ring-0"
            placeholder="tu@salon.com"
            type="email"
          />
        </div>
      </Field>

      <Field className="space-y-2" name="password">
        <FieldLabel required>
          Contraseña
        </FieldLabel>
        <div className="flex items-center gap-3 rounded-xl border border-input bg-card px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <LockKeyhole className="size-4 text-muted-foreground" />
          <Input
            required
            autoComplete="current-password"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 focus:border-transparent focus:ring-0"
            placeholder="Tu contraseña"
            type="password"
          />
        </div>
      </Field>

      {errorMessage ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <Button className="h-11 w-full rounded-xl" disabled={isPending} type="submit">
        {isPending ? "Validando acceso..." : "Iniciar sesión"}
        {!isPending ? <ArrowRight className="size-4" /> : null}
      </Button>

      <p className="text-center text-xs leading-5 text-muted-foreground">
        El acceso se habilita mediante una invitación administrativa.
      </p>
    </form>
  );
}
