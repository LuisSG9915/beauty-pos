"use client";

import { Clock3, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { firstParam } from "@/lib/url-context";
import { SUSCRIPCION_COPY } from "@/lib/glosario";
import { puedeAdministrarPlan } from "@/lib/auth/permissions";

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

  const permisos =
    organizationId && permissionsByOrg
      ? (permissionsByOrg[organizationId] ?? null)
      : null;
  const esAdminPlan = puedeAdministrarPlan(permisos);

  // Staff operativo: solo aviso suave (sin CTA comercial)
  if (!esAdminPlan) {
    if (badge.estado === "vencida") {
      return (
        <div className="anim-entrada mb-4 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground" aria-live="polite" role="status">
          <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
          <p>{SUSCRIPCION_COPY.vencidaStaff}</p>
        </div>
      );
    }
    const dias = badge.diasRestantes;
    if (dias === null || dias > 3) return null;
    return (
      <div className="anim-entrada mb-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground" aria-live="polite" role="status">
        <Clock3 aria-hidden="true" className="size-4 shrink-0" />
        <p>{SUSCRIPCION_COPY.trialStaff(dias)}</p>
      </div>
    );
  }

  // Admin del plan: aviso con CTA a planes
  if (badge.estado === "vencida") {
    return (
      <div className="anim-entrada mb-4 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive-soft-foreground" aria-live="polite" role="status">
        <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
        <p>{SUSCRIPCION_COPY.vencidaAdmin}</p>
        <Link
          className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-full border border-destructive-soft-foreground/40 bg-card/60 px-3.5 text-op-xs font-semibold transition-colors hover:bg-card"
          href="/precios"
        >
          Ver planes
        </Link>
      </div>
    );
  }

  return (
    <div className="anim-entrada mb-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground" aria-live="polite" role="status">
      <Clock3 aria-hidden="true" className="size-4 shrink-0" />
      <p>{SUSCRIPCION_COPY.trialAdmin(badge.diasRestantes)}</p>
      <Link
        className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-full border border-warning-soft-foreground/40 bg-card/60 px-3.5 text-op-xs font-semibold transition-colors hover:bg-card"
        href="/precios"
      >
        Ver planes
      </Link>
    </div>
  );
}
