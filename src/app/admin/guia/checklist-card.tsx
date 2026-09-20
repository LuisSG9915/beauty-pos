import { CheckCircle2, Circle, Compass } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { buildAdminHref } from "@/lib/url-context";
import type { ResumenGuia } from "@/modules/onboarding/types";

import { actualizarGuia } from "./actions";

async function omitirGuia(formData: FormData) {
  "use server";
  formData.set("accion", "omitir");
  await actualizarGuia(formData);
}

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
  const href = (path: `/${string}`) => buildAdminHref(path, { organizationId, sucursalId });

  return (
    <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-[#f1eeea] text-[#8a5140]">
            <Compass aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-[#2d2926]">Prepara tu negocio</h2>
            <p className="text-sm text-[#81746c]">
              {resumen.completados} de {resumen.total} pasos listos
            </p>
          </div>
        </div>
        <Button nativeButton={false} render={<Link href={href("/guia")} />} size="sm" variant="outline">
          Ver guía completa
        </Button>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 h-2 overflow-hidden rounded-full bg-[#f1eeea]"
      >
        <div
          className="h-full rounded-full bg-[#8a5140]"
          style={{ width: `${Math.round((resumen.completados / resumen.total) * 100)}%` }}
        />
      </div>

      <ol className="mt-4 divide-y divide-[#f4eeea]">
        {resumen.pasos.map((paso) => (
          <li className="flex items-center gap-3 py-3" key={paso.clave}>
            {paso.hecho ? (
              <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-[#347052]" />
            ) : (
              <Circle aria-hidden="true" className="size-5 shrink-0 text-[#c4b7ae]" />
            )}
            <Link
              className="min-w-0 flex-1 truncate text-sm font-medium text-[#2d2926] hover:text-[#8a5140]"
              href={href(paso.href)}
            >
              {paso.titulo}
              {paso.opcional ? <span className="ml-2 text-xs font-normal text-[#a89d95]">Opcional</span> : null}
            </Link>
            {!paso.hecho ? (
              <Link className="shrink-0 text-xs font-medium text-[#8a5140] hover:underline" href={href(paso.href)}>
                Ir
              </Link>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#f4eeea] pt-4">
        <Link className="text-sm font-medium text-[#8a5140] hover:underline" href={href("/practica")}>
          Practicar con datos de ejemplo
        </Link>
        <form action={omitirGuia} className="ml-auto">
          <input name="organizacionId" type="hidden" value={organizationId} />
          <input name="sucursalId" type="hidden" value={sucursalId} />
          <Button size="sm" type="submit" variant="ghost">
            Omitir guía
          </Button>
        </form>
      </div>
    </section>
  );
}
