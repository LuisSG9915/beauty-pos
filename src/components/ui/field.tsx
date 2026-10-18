"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Campo de formulario compacto basado en Base UI Field.
 * `Field` agrupa label/control/mensajes y propaga `name`, `disabled`
 * e `invalid` a las partes internas.
 */
function Field({
  className,
  ...props
}: ComponentProps<typeof FieldPrimitive.Root>) {
  return (
    <FieldPrimitive.Root
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function FieldLabel({
  className,
  required,
  children,
  ...props
}: ComponentProps<typeof FieldPrimitive.Label> & { required?: boolean }) {
  return (
    <FieldPrimitive.Label
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    >
      {children}
      {required ? <span aria-hidden="true"> *</span> : null}
    </FieldPrimitive.Label>
  );
}

const controlStyles =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive/60 aria-invalid:focus:border-destructive aria-invalid:focus:ring-destructive/20";

type ControlProps = ComponentProps<typeof FieldPrimitive.Control> & {
  /** Marca `aria-invalid` y el estilo de error (p. ej. errores del servidor). */
  invalid?: boolean;
};

function Input({ className, invalid, ...props }: ControlProps) {
  return (
    <FieldPrimitive.Control
      aria-invalid={invalid || undefined}
      className={cn(controlStyles, className)}
      {...props}
    />
  );
}

function Textarea({
  className,
  invalid,
  rows = 3,
  ...props
}: Omit<ComponentProps<"textarea">, "children"> & { invalid?: boolean }) {
  return (
    <FieldPrimitive.Control
      aria-invalid={invalid || undefined}
      render={<textarea className={cn(controlStyles, "h-auto min-h-20 py-2", className)} rows={rows} />}
      {...(props as ComponentProps<typeof FieldPrimitive.Control>)}
    />
  );
}

function Select({
  className,
  invalid,
  children,
  ...props
}: Omit<ComponentProps<"select">, "children"> & {
  invalid?: boolean;
  children?: ComponentProps<"select">["children"];
}) {
  return (
    <FieldPrimitive.Control
      aria-invalid={invalid || undefined}
      render={<select className={cn(controlStyles, "pr-8", className)}>{children}</select>}
      {...(props as ComponentProps<typeof FieldPrimitive.Control>)}
    />
  );
}

function FieldDescription({
  className,
  ...props
}: ComponentProps<typeof FieldPrimitive.Description>) {
  return (
    <FieldPrimitive.Description
      className={cn("text-op-xs leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * Mensaje de error. Por defecto sigue la validación de Base UI; usa
 * `match={true}` (o pasa `error`) para errores que vienen del servidor.
 */
function FieldError({
  className,
  error,
  children,
  match,
  ...props
}: ComponentProps<typeof FieldPrimitive.Error> & { error?: string }) {
  const message = error ?? (typeof children === "string" ? children : undefined);
  return (
    <FieldPrimitive.Error
      className={cn("text-op-xs font-medium text-destructive", className)}
      match={error ? true : match}
      {...props}
    >
      {children ?? message}
    </FieldPrimitive.Error>
  );
}

/**
 * Feedback compacto: muestra el error (role="alert") o, en su defecto, una
 * descripción de ayuda. A diferencia de `FieldError`/`FieldDescription`,
 * no depende del contexto de `Field`, así que puede usarse también suelto.
 */
function FieldFeedback({
  error,
  hint,
  className,
}: {
  error?: string | null;
  hint?: string;
  className?: string;
}) {
  if (error) {
    return (
      <p
        className={cn("text-op-xs font-medium text-destructive", className)}
        role="alert"
      >
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p className={cn("text-op-xs leading-5 text-muted-foreground", className)}>
        {hint}
      </p>
    );
  }
  return null;
}

export {
  Field,
  FieldDescription,
  FieldError,
  FieldFeedback,
  FieldLabel,
  Input,
  Select,
  Textarea,
};
