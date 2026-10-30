"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Compass, Loader2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { buildAdminHref } from "@/lib/url-context";
import { PACKS_ARRANQUE_MEXICO } from "@/modules/onboarding/rules";
import type { ResumenGuia } from "@/modules/onboarding/types";

import { actualizarGuia, aplicarPackArranqueAction } from "./actions";

/**
 * Checklist de «Prepara tu negocio» para el Inicio. Se muestra solo cuando
 * hay pasos visibles pendientes y la guía no fue omitida; los hechos salen
 * de los datos reales del negocio.
 */
export function GuiaChecklistCard({
  resumen,
  organizationId,
  sucursalId,
}: {
  resumen: ResumenGuia;
  organizationId: string;
  sucursalId: string;
}) {
  const [pendingPackId, setPendingPackId] = useState<string | null>(null);
  const [isPackPending, startPackTransition] = useTransition();
  const [isOmitPending, startOmitTransition] = useTransition();
  const [packError, setPackError] = useState<string | null>(null);

  const href = (path: `/${string}`) => buildAdminHref(path, { organizationId, sucursalId });

  const handleAplicarPack = (packId: string) => {
    setPackError(null);
    setPendingPackId(packId);
    startPackTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("packId", packId);
        formData.set("organizacionId", organizationId);
        formData.set("sucursalId", sucursalId);
        const res = await aplicarPackArranqueAction(formData);
        if (res.error) {
          setPackError(res.error);
        }
      } catch {
        setPackError("No se pudo aplicar el paquete. Intenta de nuevo.");
      } finally {
        setPendingPackId(null);
      }
    });
  };

  const handleOmitir = () => {
    startOmitTransition(async () => {
      const formData = new FormData();
      formData.set("organizacionId", organizationId);
      formData.set("sucursalId", sucursalId);
      formData.set("accion", "omitir");
      await actualizarGuia(formData);
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-muted/60 text-primary">
            <Compass aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">Prepara tu negocio</h2>
            <p className="text-sm text-muted-foreground">
              {resumen.completados} de {resumen.total} pasos listos
            </p>
          </div>
        </div>
        <Button nativeButton={false} render={<Link href={href("/guia")} prefetch={false} />} size="sm" variant="outline">
          Ver guía completa
        </Button>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 h-2 overflow-hidden rounded-full bg-muted/60"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round((resumen.completados / resumen.total) * 100)}%` }}
        />
      </div>

      <ol className="mt-4 divide-y divide-border">
        {resumen.pasos.map((paso) => {
          const esServiciosPendiente = paso.clave === "servicios" && !paso.hecho;

          return (
            <li className="py-3" key={paso.clave}>
              <div className="flex items-center gap-3">
                {paso.hecho ? (
                  <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-success" />
                ) : (
                  <Circle aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                )}
                <Link
                  className="inline-flex min-h-6 min-w-0 flex-1 items-center truncate text-sm font-medium text-foreground hover:text-primary"
                  href={href(paso.href)}
                  prefetch={false}
                >
                  {paso.titulo}
                  {paso.opcional ? <span className="ml-2 text-op-xs font-normal text-muted-foreground">Opcional</span> : null}
                </Link>
                {!paso.hecho ? (
                  <Link className="inline-flex min-h-6 shrink-0 items-center text-op-xs font-medium text-primary hover:underline" href={href(paso.href)} prefetch={false}>
                    Ir
                  </Link>
                ) : null}
              </div>

              {esServiciosPendiente ? (
                <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
                  <p className="mb-2.5 text-op-xs font-medium text-foreground">
                    O activa en 1 toque un paquete inicial con precios y tiempos reales de México:
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PACKS_ARRANQUE_MEXICO.map((pack) => {
                      const cargando = isPackPending && pendingPackId === pack.id;
                      return (
                        <Button
                          className="min-h-[44px] w-full justify-center px-3 py-2.5 text-center text-xs font-medium"
                          disabled={isPackPending}
                          key={pack.id}
                          onClick={() => handleAplicarPack(pack.id)}
                          type="button"
                          variant="outline"
                        >
                          {cargando ? (
                            <Loader2 aria-hidden="true" className="mr-1.5 size-3.5 shrink-0 animate-spin" />
                          ) : null}
                          <span className="truncate">{pack.etiqueta}</span>
                        </Button>
                      );
                    })}
                  </div>
                  {packError ? (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                      {packError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Link className="inline-flex min-h-6 items-center text-sm font-medium text-primary hover:underline" href={href("/practica")} prefetch={false}>
          Practicar con datos de ejemplo
        </Link>
        <div className="ml-auto">
          <Button
            disabled={isOmitPending}
            onClick={handleOmitir}
            size="sm"
            type="button"
            variant="ghost"
          >
            {isOmitPending ? "Omitiendo..." : "Omitir guía"}
          </Button>
        </div>
      </div>
    </section>
  );
}

