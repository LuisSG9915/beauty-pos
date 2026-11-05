"use client";

import { Clock3, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { firstParam } from "@/lib/url-context";

export type BillingBadge = {
  /** `vigente` con trial activo muestra cuenta regresiva; `vencida` aviso de solo lectura. */
  estado: "trialing" | "vencida";
  diasRestantes: number | null;
};

/**
 * Aviso del estado de la suscripción dentro del shell. Solo aparece cuando la
 * organización activa está en trial o con la suscripción vencida (solo
 * lectura). Las suscripciones activas no generan ruido visual.
 */
export function SubscriptionBanner({
  billingByOrg,
  organizations,
  permissionsByOrg,
}: {
  billingByOrg: Record<string, BillingBadge>;
  organizations: Array<{ id: string }>;
  permissionsByOrg?: Record<string, string[]> | null;
}) {
  const searchParams = useSearchParams();
  const organizationId =
    firstParam(searchParams.get("organizationId")) ?? organizations[0]?.id;
  const badge = organizationId ? billingByOrg[organizationId] : undefined;
  if (!badge) return null;

  // El personal operativo no administra el plan: en trial solo ve aviso
  // cuando falta poco para el vencimiento, y en pausa un aviso para escalar
  // a la dueña — nunca el CTA comercial "Ver planes".
  const permisos =
    organizationId && permissionsByOrg
      ? (permissionsByOrg[organizationId] ?? null)
      : null;
  const puedeAdministrarPlan =
    permisos === null ||
    permisos.includes("organizaciones.editar") ||
    permisos.includes("sucursales.editar");

  if (!puedeAdministrarPlan) {
    if (badge.estado === "vencida") {
      return (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-soft-foreground">
          <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
          <p>
            La suscripción del salón está en pausa (solo lectura) — avísale a
            la dueña o encargada para reactivarla.
          </p>
        </div>
      );
    }
    const dias = badge.diasRestantes;
    if (dias === null || dias > 3) return null;
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-soft-foreground">
        <Clock3 aria-hidden="true" className="size-4 shrink-0" />
        <p>
          El periodo de prueba del salón vence en {dias}{" "}
          {dias === 1 ? "día" : "días"} — recuérdale a la dueña o encargada
          para evitar pausas.
        </p>
      </div>
    );
  }

  if (badge.estado === "vencida") {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-soft-foreground">
        <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
        <p>
          Tu suscripción está en pausa: puedes consultar tu información, pero no
          registrar cambios. Reactiva tu plan para volver a operar — tus datos
          están a salvo.
        </p>
        <Link
          className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-full border border-destructive-soft-foreground/40 px-3 text-op-xs font-semibold"
          href="/precios"
        >
          Ver planes
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-soft-foreground">
      <Clock3 aria-hidden="true" className="size-4 shrink-0" />
      <p>
        Estás en tu periodo de prueba
        {badge.diasRestantes !== null
          ? ` — te ${badge.diasRestantes === 1 ? "queda 1 día" : `quedan ${badge.diasRestantes} días`}`
          : ""}
        . Todo lo que registres se conserva al contratar.
      </p>
      <Link
        className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-full border border-warning-soft-foreground/40 px-3 text-op-xs font-semibold"
        href="/precios"
      >
        Ver planes
      </Link>
    </div>
  );
}
