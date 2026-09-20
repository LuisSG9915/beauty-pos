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
}: {
  billingByOrg: Record<string, BillingBadge>;
  organizations: Array<{ id: string }>;
}) {
  const searchParams = useSearchParams();
  const organizationId =
    firstParam(searchParams.get("organizationId")) ?? organizations[0]?.id;
  const badge = organizationId ? billingByOrg[organizationId] : undefined;
  if (!badge) return null;

  if (badge.estado === "vencida") {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#e5b4a2] bg-[#fdf0ea] px-4 py-3 text-sm text-[#7c3a21]">
        <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
        <p>
          Tu suscripción está en pausa: puedes consultar tu información, pero no
          registrar cambios. Reactiva tu plan para volver a operar — tus datos
          están a salvo.{" "}
          <Link className="font-semibold underline underline-offset-2" href="/precios">
            Ver planes
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#ecd9c4] bg-[#fdf7ef] px-4 py-3 text-sm text-[#7a4f22]">
      <Clock3 aria-hidden="true" className="size-4 shrink-0" />
      <p>
        Estás en tu periodo de prueba
        {badge.diasRestantes !== null
          ? ` — te ${badge.diasRestantes === 1 ? "queda 1 día" : `quedan ${badge.diasRestantes} días`}`
          : ""}
        . Todo lo que registres se conserva al contratar.{" "}
        <Link className="font-semibold underline underline-offset-2" href="/precios">
          Ver planes
        </Link>
      </p>
    </div>
  );
}
