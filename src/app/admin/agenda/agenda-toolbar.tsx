"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { buildHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";
import { shiftDateKey } from "@/modules/agenda";

type AgendaVista = "dia" | "semana" | "lista";

const VIEWS: Array<{ value: AgendaVista; label: string }> = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "lista", label: "Lista" },
];

function shiftByView(fecha: string, vista: AgendaVista, direction: -1 | 1) {
  const amount = vista === "semana" ? 7 : vista === "lista" ? 14 : 1;
  return shiftDateKey(fecha, amount * direction) ?? fecha;
}

/** Controles de contexto de Agenda: sucursal, fecha, vista y búsqueda. */
export function AgendaToolbar({
  branches,
  sucursalId,
  fecha,
  vista,
  q,
  hoy,
}: {
  branches: Array<{ id: string; nombre: string; clave: string }>;
  sucursalId: string;
  fecha: string;
  vista: AgendaVista;
  q: string;
  /** Fecha de hoy (`YYYY-MM-DD`) en la zona de la sucursal, para el atajo "Hoy". */
  hoy: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTimeout = useRef<number | null>(null);

  const updateSearch = (value: string) => {
    if (searchTimeout.current !== null) window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      router.replace(
        buildHref(pathname, {
          params: searchParams,
          preserve: ["fecha", "vista", "sucursalId", "q"],
          extra: { q: value || null },
        }),
      );
    }, 300);
  };

  const hrefFor = (extra: Record<string, string | null>) =>
    buildHref(pathname, {
      params: searchParams,
      preserve: ["fecha", "vista", "sucursalId", "q"],
      extra,
    });

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#eadfd8] bg-white p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
      <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-end">
        <label className="min-w-44 space-y-1.5">
          <span className="text-xs font-medium text-[#6e6159]">Sucursal</span>
          <select
            aria-label="Sucursal de la agenda"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            onChange={(event) => router.push(hrefFor({ sucursalId: event.target.value }))}
            value={sucursalId}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nombre} · {branch.clave}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-[#6e6159]">Fecha</span>
          <input
            aria-label="Fecha de la agenda"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            onChange={(event) => {
              if (event.target.value) router.push(hrefFor({ fecha: event.target.value }));
            }}
            type="date"
            value={fecha}
          />
        </label>
        <div className="flex items-center gap-1 lg:pb-0">
          <Button
            aria-label="Periodo anterior"
            className="rounded-xl"
            onClick={() => router.push(hrefFor({ fecha: shiftByView(fecha, vista, -1) }))}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            className="rounded-xl"
            onClick={() => router.push(hrefFor({ fecha: hoy }))}
            type="button"
            variant="outline"
          >
            Hoy
          </Button>
          <Button
            aria-label="Periodo siguiente"
            className="rounded-xl"
            onClick={() => router.push(hrefFor({ fecha: shiftByView(fecha, vista, 1) }))}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative min-w-0 flex-1 sm:w-64">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <label className="sr-only" htmlFor="agenda-buscar">
            Buscar citas
          </label>
          <input
            className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            defaultValue={q}
            id="agenda-buscar"
            key={q}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="Cliente, servicio o profesional"
            type="search"
          />
        </div>
        <div aria-label="Vista de agenda" className="flex rounded-xl border border-[#ded8d2] bg-[#f1eeea] p-1" role="group">
          {VIEWS.map((view) => (
            <Link
              aria-current={vista === view.value ? "page" : undefined}
              className={cn(
                "inline-flex min-h-8 flex-1 items-center justify-center rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors",
                vista === view.value
                  ? "bg-white text-[#60392e] shadow-sm"
                  : "text-[#625b55] hover:text-[#8a5140]",
              )}
              href={hrefFor({ vista: view.value })}
              key={view.value}
            >
              {view.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
