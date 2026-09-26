"use client";

import { ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";

export function RestablecerForm({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (password.length < 8) {
      setErrorMessage("La contraseña necesita al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErrorMessage("Las contraseñas no coinciden. Escríbelas igual en los dos campos.");
      return;
    }

    startTransition(async () => {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        setErrorMessage("Este enlace ya no sirve o ya se usó. Pide uno nuevo para crear tu contraseña.");
        return;
      }
      router.push("/login?restablecida=1");
    });
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <Field className="space-y-2" name="password">
        <FieldLabel required>Contraseña nueva</FieldLabel>
        <div className="flex items-center gap-3 rounded-xl border border-input bg-card px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <LockKeyhole className="size-4 text-muted-foreground" />
          <Input
            required
            autoComplete="new-password"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 focus:border-transparent focus:ring-0"
            minLength={8}
            placeholder="Mínimo 8 caracteres"
            type="password"
          />
        </div>
      </Field>

      <Field className="space-y-2" name="confirm">
        <FieldLabel required>Repite la contraseña</FieldLabel>
        <div className="flex items-center gap-3 rounded-xl border border-input bg-card px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <LockKeyhole className="size-4 text-muted-foreground" />
          <Input
            required
            autoComplete="new-password"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 focus:border-transparent focus:ring-0"
            minLength={8}
            placeholder="Escríbela igual"
            type="password"
          />
        </div>
      </Field>

      {errorMessage ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
          {errorMessage.includes("enlace") ? (
            <Link className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline" href="/recuperar">
              Pedir un enlace nuevo
            </Link>
          ) : null}
        </div>
      ) : null}

      <Button className="h-11 w-full rounded-xl" data-action-id="auth.restablecer_guardar" disabled={isPending} type="submit">
        {isPending ? "Guardando..." : "Guardar contraseña"}
        {!isPending ? <ArrowRight className="size-4" /> : null}
      </Button>
    </form>
  );
}
