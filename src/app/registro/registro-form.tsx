"use client";

import { ArrowRight, Building2, LockKeyhole, Mail, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import { registrarNegocio } from "@/app/registro/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { TurnstileWidget } from "@/components/ui/turnstile-widget";
import { authClient } from "@/lib/auth/client";

/**
 * Formulario de registro self-service. El server action crea la cuenta y la
 * organización con trial. Si el correo de verificación está activo redirige
 * al login con el aviso de "revisa tu correo"; en desarrollo sin Brevo
 * inicia sesión directo desde el cliente.
 */
export function RegistroForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const correo = String(formData.get("correo") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      const result = await registrarNegocio({}, formData);
      if (result.error) {
        setErrorMessage(result.error);
        return;
      }

      if (result.verificacionPendiente) {
        router.push("/login?verifica=1");
        return;
      }

      const { error } = await authClient.signIn.email({
        email: correo,
        password,
        callbackURL: "/admin",
      });
      if (error) {
        router.push("/login?registrado=1");
        return;
      }
      router.push("/admin");
      router.refresh();
    });
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <Field className="space-y-2" name="negocio">
        <FieldLabel required>
          Nombre de tu negocio
        </FieldLabel>
        <div className="flex items-center gap-3 rounded-xl border border-input bg-card px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <Building2 className="size-4 text-muted-foreground" />
          <Input
            required
            autoComplete="organization"
            className="border-0 bg-transparent px-0 focus-visible:ring-0"
            maxLength={160}
            name="negocio"
            placeholder="Estética Aurora"
            type="text"
          />
        </div>
      </Field>

      <Field className="space-y-2" name="nombre">
        <FieldLabel required>
          Tu nombre
        </FieldLabel>
        <div className="flex items-center gap-3 rounded-xl border border-input bg-card px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <User className="size-4 text-muted-foreground" />
          <Input
            required
            autoComplete="name"
            className="border-0 bg-transparent px-0 focus-visible:ring-0"
            maxLength={160}
            name="nombre"
            placeholder="María López"
            type="text"
          />
        </div>
      </Field>

      <Field className="space-y-2" name="correo">
        <FieldLabel required>
          Correo de acceso
        </FieldLabel>
        <div className="flex items-center gap-3 rounded-xl border border-input bg-card px-3.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
          <Mail className="size-4 text-muted-foreground" />
          <Input
            required
            autoComplete="email"
            className="border-0 bg-transparent px-0 focus-visible:ring-0"
            maxLength={254}
            name="correo"
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
            autoComplete="new-password"
            className="border-0 bg-transparent px-0 focus-visible:ring-0"
            minLength={12}
            name="password"
            placeholder="Mínimo 12 caracteres"
            type="password"
          />
        </div>
      </Field>

      {errorMessage ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <TurnstileWidget className="my-2 flex justify-center" />

      <Button
        className="w-full rounded-xl py-3 text-sm font-semibold"
        data-action-clave="1"
        data-action-id="registro.cuenta.crear"
        disabled={isPending}
        size="lg"
        type="submit"
      >
        {isPending ? "Creando tu espacio…" : "Crear mi cuenta gratis"}
        <ArrowRight className="ml-2 size-4" />
      </Button>

      <p className="text-center text-op-xs leading-5 text-muted-foreground">
        14 días de prueba sin tarjeta. Tus datos se conservan al contratar.
      </p>
    </form>
  );
}
