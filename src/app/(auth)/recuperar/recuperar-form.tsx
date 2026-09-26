"use client";

import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { authClient } from "@/lib/auth/client";

export function RecuperarForm() {
  const [isPending, startTransition] = useTransition();
  const [enviado, setEnviado] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();

    startTransition(async () => {
      // Respuesta uniforme aunque el correo no exista: no revelamos qué
      // cuentas están registradas.
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: "/restablecer",
      });
      if (error) {
        setErrorMessage("No pudimos enviar el correo en este momento. Espera un minuto e inténtalo de nuevo.");
        return;
      }
      setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <div className="mt-8 space-y-5">
        <p className="rounded-xl border border-success/30 bg-success-soft px-4 py-3 text-sm text-success" role="status">
          Listo — te enviamos un correo con el enlace para crear tu contraseña nueva. Si no lo ves en unos
          minutos, revisa tu carpeta de spam.
        </p>
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="/login"
        >
          <ArrowLeft className="size-4" /> Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <Field className="space-y-2" name="email">
        <FieldLabel required>Correo de acceso</FieldLabel>
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

      {errorMessage ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <Button className="h-11 w-full rounded-xl" data-action-id="auth.recuperar_enviar" disabled={isPending} type="submit">
        {isPending ? "Enviando correo..." : "Enviar enlace a mi correo"}
      </Button>

      <p className="text-center">
        <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/login">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
