"use client";

import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition, type MouseEvent } from "react";

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

function guardRepeatedTap(event: MouseEvent<HTMLAnchorElement>) {
  const now = Date.now();
  const lastTap = Number(event.currentTarget.dataset.navTapAt ?? "0");
  if (now - lastTap < 800) {
    event.preventDefault();
    return;
  }
  event.currentTarget.dataset.navTapAt = String(now);
}

function ViewPendingIndicator({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute right-1 top-1 size-1.5 rounded-full bg-primary opacity-0 transition-opacity data-[pending=true]:opacity-100"
        data-pending={pending}
      />
      <span className="sr-only" role="status">
        {pending ? `Abriendo vista ${label}…` : ""}
      </span>
    </>
  );
}

type PendingControl = "fecha" | "sucursal" | "buscar";

const PENDING_LABEL: Record<PendingControl, string> = {
  fecha: "Actualizando fecha…",
  sucursal: "Cambiando sucursal…",
  buscar: "Buscando citas…",
};

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
  const [navigationPending, startNavigation] = useTransition();
  const [pendingControl, setPendingControl] = useState<PendingControl | null>(null);
  const activePending = navigationPending ? pendingControl : null;

  const navigate = (control: PendingControl, href: string) => {
    if (navigationPending && pendingControl === control) return;
    setPendingControl(control);
    startNavigation(() => router.push(href));
  };

  const updateSearch = (value: string) => {
    if (searchTimeout.current !== null) window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      setPendingControl("buscar");
      startNavigation(() =>
        router.replace(
          buildHref(pathname, {
            params: searchParams,
            preserve: ["fecha", "vista", "sucursalId", "q"],
            extra: { q: value || null },
          }),
        ),
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
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            aria-label="Periodo anterior"
            className="rounded-xl"
            disabled={activePending === "fecha"}
            onClick={() => navigate("fecha", hrefFor({ fecha: shiftByView(fecha, vista, -1) }))}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            className={cn("rounded-xl", fecha === hoy && "border-primary/40 bg-accent text-accent-foreground")}
            disabled={activePending === "fecha"}
            onClick={() => navigate("fecha", hrefFor({ fecha: hoy }))}
            type="button"
            variant="outline"
          >
            Hoy
          </Button>
          <Button
            aria-label="Periodo siguiente"
            className="rounded-xl"
            disabled={activePending === "fecha"}
            onClick={() => navigate("fecha", hrefFor({ fecha: shiftByView(fecha, vista, 1) }))}
            size="icon"
            type="button"
            variant="outline"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <label className="min-w-0">
          <span className="sr-only">Fecha de la agenda</span>
          <input
            aria-label="Fecha de la agenda"
            className="h-10 w-full min-w-40 rounded-xl border border-input bg-background px-3 text-sm font-medium outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
            disabled={activePending === "fecha"}
            onChange={(event) => {
              if (event.target.value) navigate("fecha", hrefFor({ fecha: event.target.value }));
            }}
            type="date"
            value={fecha}
          />
        </label>
        <label className="min-w-44 flex-1 sm:flex-none">
          <span className="sr-only">Sucursal de la agenda</span>
          <select
            aria-label="Sucursal de la agenda"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60"
            disabled={activePending === "sucursal"}
            onChange={(event) => navigate("sucursal", hrefFor({ sucursalId: event.target.value }))}
            value={sucursalId}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.nombre} · {branch.clave}
              </option>
            ))}
          </select>
        </label>
        <span
          aria-live="polite"
          className={cn(
            "min-h-5 text-xs font-medium text-primary transition-opacity",
            activePending ? "opacity-100" : "opacity-0",
          )}
          role="status"
        >
          {activePending ? PENDING_LABEL[activePending] : "Actualizando…"}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
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
        <div aria-label="Vista de agenda" className="flex rounded-xl border border-border bg-muted p-1" role="group">
          {VIEWS.map((view) => (
            <Link
              aria-current={vista === view.value ? "page" : undefined}
              className={cn(
                "relative inline-flex min-h-8 flex-1 items-center justify-center rounded-lg px-3 text-xs font-medium whitespace-nowrap transition-colors",
                vista === view.value
                  ? "bg-card font-semibold text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-primary",
              )}
              href={hrefFor({ vista: view.value })}
              key={view.value}
              onClick={guardRepeatedTap}
            >
              {view.label}
              <ViewPendingIndicator label={view.label} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
