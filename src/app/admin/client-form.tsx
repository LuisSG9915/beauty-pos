"use client";

import {
  Cake,
  MessageCircle,
  Phone,
  ReceiptText,
  Sparkles,
  User,
  UserCheck,
} from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { saveClient } from "@/app/admin/client-actions";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Textarea,
} from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type ClientData = {
  id?: string;
  organizacionId: string;
  nombre: string;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
  telefono?: string | null;
  correo?: string | null;
  fechaNacimiento?: string | null;
  notasOperativas?: string | null;
  rfc?: string | null;
  razonSocial?: string | null;
  codigoPostalFiscal?: string | null;
  regimenFiscal?: string | null;
  usoCfdi?: string | null;
};

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "·"
  );
}

export function ClientForm({
  organizationId,
  initial,
  onSuccess,
}: {
  organizationId: string;
  initial?: ClientData;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [state, formAction, isPending] = useActionState(saveClient, {});
  const value = (key: keyof ClientData) => initial?.[key] ?? "";

  const nombreCompleto = [initial?.nombre, initial?.apellidoPaterno, initial?.apellidoMaterno]
    .filter(Boolean)
    .join(" ");
  const initials = nombreCompleto ? getInitials(nombreCompleto) : (initial?.nombre ? initial.nombre.slice(0, 2).toUpperCase() : null);

  const tieneFiscales = Boolean(
    initial?.rfc ||
      initial?.razonSocial ||
      initial?.codigoPostalFiscal ||
      initial?.regimenFiscal ||
      initial?.usoCfdi,
  );

  const handled = useRef(state);
  useEffect(() => {
    if (state.success && handled.current !== state) {
      handled.current = state;
      toast.success(initial?.id ? "Cliente actualizado correctamente." : "Cliente creado correctamente.");
      onSuccess?.();
    }
  }, [initial?.id, onSuccess, state, toast]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />

      {/* Header visual de identidad del cliente */}
      <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-muted/40 p-3.5 sm:p-4">
        <div className="flex size-13 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-base font-bold text-primary shadow-xs">
          {initials ? initials : <User className="size-6 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-foreground">
              {nombreCompleto || "Nuevo cliente"}
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-op-xs font-semibold",
                initial?.id
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-primary/10 text-primary",
              )}
            >
              <UserCheck className="size-3" />
              {initial?.id ? "Cliente registrado" : "Alta de cliente"}
            </span>
          </div>

          {initial?.telefono ? (
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <a
                className="inline-flex items-center gap-1 text-op-xs font-medium text-primary hover:underline"
                href={`tel:${initial.telefono}`}
              >
                <Phone className="size-3" /> {initial.telefono}
              </a>
              <span className="text-muted-foreground/30">·</span>
              <a
                className="inline-flex items-center gap-1 text-op-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                href={`https://wa.me/52${initial.telefono.replace(/\D/g, "")}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <MessageCircle className="size-3" /> WhatsApp
              </a>
            </div>
          ) : (
            <p className="mt-0.5 text-op-xs text-muted-foreground">
              {initial?.id
                ? "Sin teléfono registrado"
                : "Captura los datos para agendar citas y enviar recordatorios."}
            </p>
          )}
        </div>
      </div>

      {/* ----------------- SECCIÓN 1: DATOS PERSONALES ----------------- */}
      <div className="space-y-3.5 rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center gap-2 text-op-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <User className="size-3.5 text-primary" />
          <span>Datos personales</span>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel required>Nombre(s)</FieldLabel>
            <Input
              autoFocus={!initial?.id}
              defaultValue={String(value("nombre"))}
              name="nombre"
              placeholder="Ej. Mariana"
              required
            />
          </Field>

          <Field>
            <FieldLabel>Apellido paterno</FieldLabel>
            <Input
              defaultValue={String(value("apellidoPaterno"))}
              name="apellidoPaterno"
              placeholder="Ej. López"
            />
          </Field>

          <Field>
            <FieldLabel>Apellido materno</FieldLabel>
            <Input
              defaultValue={String(value("apellidoMaterno"))}
              name="apellidoMaterno"
              placeholder="Ej. García"
            />
          </Field>

          <Field className="sm:col-span-2">
            <FieldLabel>Fecha de nacimiento / Cumpleaños</FieldLabel>
            <div className="relative">
              <Input
                defaultValue={String(value("fechaNacimiento"))}
                name="fechaNacimiento"
                type="date"
              />
            </div>
            <FieldDescription>
              <span className="inline-flex items-center gap-1">
                <Cake className="size-3 text-primary" /> Ideal para felicitaciones y descuentos especiales en su mes.
              </span>
            </FieldDescription>
          </Field>
        </div>
      </div>

      {/* ----------------- SECCIÓN 2: CONTACTO Y AVISOS ----------------- */}
      <div className="space-y-3.5 rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center gap-2 text-op-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Phone className="size-3.5 text-primary" />
          <span>Contacto y avisos</span>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Field>
            <FieldLabel>Teléfono móvil</FieldLabel>
            <Input
              defaultValue={String(value("telefono"))}
              name="telefono"
              placeholder="55 1234 5678"
              type="tel"
            />
            <FieldDescription>Para avisos de cita y confirmaciones por WhatsApp.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Correo electrónico</FieldLabel>
            <Input
              defaultValue={String(value("correo"))}
              name="correo"
              placeholder="cliente@correo.com"
              type="email"
            />
          </Field>
        </div>
      </div>

      {/* ----------------- SECCIÓN 3: PREFERENCIAS DEL SALÓN ----------------- */}
      <div className="space-y-3.5 rounded-2xl border border-border bg-card p-4 shadow-2xs">
        <div className="flex items-center gap-2 text-op-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          <span>Notas y preferencias de salón</span>
        </div>

        <Field>
          <Textarea
            className="min-h-24 resize-y text-sm"
            defaultValue={String(value("notasOperativas"))}
            name="notasOperativas"
            placeholder="Sensibilidad en cuero cabelludo, bebidas preferidas, estilo favorito, productos alérgenos..."
          />
          <FieldDescription>Notas visibles para el equipo al agendar o atender en silla.</FieldDescription>
        </Field>
      </div>

      {/* ----------------- SECCIÓN 4: FACTURACIÓN FISCAL SAT (PLEGABLE) ----------------- */}
      <details
        className="rounded-2xl border border-border bg-muted/40 p-4 transition-colors"
        open={tieneFiscales}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between text-op-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-primary">
          <div className="flex items-center gap-2">
            <ReceiptText className="size-3.5 text-primary" />
            <span>Datos fiscales de facturación (CFDI)</span>
          </div>
          <span className="text-op-xs font-normal lowercase tracking-normal text-muted-foreground/70">
            {tieneFiscales ? "Completado" : "Opcional"}
          </span>
        </summary>

        <div className="mt-4 grid grid-cols-1 gap-3.5 border-t border-border pt-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>RFC</FieldLabel>
            <Input
              className="font-mono uppercase text-op-xs"
              defaultValue={String(value("rfc"))}
              maxLength={13}
              name="rfc"
              placeholder="XAXX010101000"
            />
          </Field>

          <Field>
            <FieldLabel>Razón social</FieldLabel>
            <Input
              defaultValue={String(value("razonSocial"))}
              name="razonSocial"
              placeholder="Nombre fiscal de la empresa o persona"
            />
          </Field>

          <Field>
            <FieldLabel>Código postal fiscal</FieldLabel>
            <Input
              defaultValue={String(value("codigoPostalFiscal"))}
              maxLength={5}
              name="codigoPostalFiscal"
              placeholder="06700"
            />
          </Field>

          <Field>
            <FieldLabel>Régimen fiscal</FieldLabel>
            <Input
              defaultValue={String(value("regimenFiscal"))}
              name="regimenFiscal"
              placeholder="Ej. 605 o 612"
            />
          </Field>

          <Field className="sm:col-span-2">
            <FieldLabel>Uso de CFDI</FieldLabel>
            <Input
              defaultValue={String(value("usoCfdi"))}
              name="usoCfdi"
              placeholder="Ej. G03 (Gastos en general)"
            />
          </Field>
        </div>
      </details>

      {state.warning ? (
        <label className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <input className="mt-1" name="confirmarDuplicado" type="checkbox" value="true" />
          <span>{state.warning} Deseo guardar el cliente de todas formas.</span>
        </label>
      ) : null}

      <div className="mt-1">
        <ActionFeedback state={state} successMessage="Cliente guardado correctamente." />
      </div>

      {/* Barra de acción fija al fondo (Sticky Action Footer para móvil y desktop) */}
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-4 flex items-center justify-end gap-3 border-t border-border bg-card/95 p-4 backdrop-blur-md z-20">
        <Button
          className="rounded-xl px-6 text-sm font-semibold shadow-sm"
          data-action-clave="1"
          data-action-id="clientes.cliente.guardar"
          disabled={isPending}
          size="default"
          type="submit"
        >
          {isPending ? "Guardando…" : initial?.id ? "Guardar cambios" : "Crear cliente"}
        </Button>
      </div>
    </form>
  );
}
