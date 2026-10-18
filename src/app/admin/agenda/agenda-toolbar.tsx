"use client";

import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  List,
  Search,
  type LucideIcon,
} from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from "react";

import { Button } from "@/components/ui/button";
import { buildHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";
import { shiftDateKey } from "@/modules/agenda";

type AgendaVista = "dia" | "semana" | "lista";

const VIEWS: Array<{ value: AgendaVista; label: string; Icon: LucideIcon }> = [
  { value: "dia", label: "Día", Icon: CalendarDays },
  { value: "semana", label: "Semana", Icon: CalendarRange },
  { value: "lista", label: "Lista", Icon: List },
];

const fechaEtiqueta = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const tiraDiaSemana = new Intl.DateTimeFormat("es-MX", {
  weekday: "short",
  timeZone: "UTC",
});

const tiraNumero = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  timeZone: "UTC",
});

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

type PendingControl = "fecha" | "buscar";

const PENDING_LABEL: Record<PendingControl, string> = {
  fecha: "Actualizando fecha…",
  buscar: "Buscando citas…",
};

/**
 * Controles de contexto de Agenda: fecha, vista y búsqueda. La sucursal se
 * cambia desde el selector global del shell (`BranchSelector`), que además
 * la conserva como preferida; aquí no se duplica.
 */
export function AgendaToolbar({
  fecha,
  vista,
  q,
  hoy,
  action,
}: {
  fecha: string;
  vista: AgendaVista;
  q: string;
  /** Fecha de hoy (`YYYY-MM-DD`) en la zona de la sucursal, para el atajo "Hoy". */
  hoy: string;
  /** Elemento opcional de acción/configuración integrado en la barra. */
  action?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchTimeout = useRef<number | null>(null);
  const fechaInputRef = useRef<HTMLInputElement>(null);
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

  // Tira de 14 días alrededor de `fecha` (vista día): el día activo queda
  // centrado en el scroll horizontal y hoy se marca con un punto.
  const diasTira = useMemo(
    () => Array.from({ length: 15 }, (_, index) => shiftDateKey(fecha, index - 7) ?? fecha),
    [fecha],
  );
  const tiraRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const activo = tiraRef.current?.querySelector("[aria-current='page']");
    activo?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [fecha]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm sm:gap-2.5 sm:p-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Fila 1: Navegación de fecha + picker (y vistas/ajustes en móvil) */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-1.5 sm:justify-start sm:gap-2">
          <div className="flex items-center gap-1">
            <Button
              aria-label="Periodo anterior"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl"
              disabled={activePending === "fecha"}
              onClick={() => navigate("fecha", hrefFor({ fecha: shiftByView(fecha, vista, -1) }))}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Button>
            <Button
              className={cn("h-8 px-2.5 sm:h-9 sm:px-3 text-xs sm:text-sm rounded-xl font-medium", fecha === hoy && "border-primary/40 bg-accent text-accent-foreground")}
              disabled={activePending === "fecha"}
              onClick={() => navigate("fecha", hrefFor({ fecha: hoy }))}
              type="button"
              variant="outline"
            >
              Hoy
            </Button>
            <Button
              aria-label="Periodo siguiente"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl"
              disabled={activePending === "fecha"}
              onClick={() => navigate("fecha", hrefFor({ fecha: shiftByView(fecha, vista, 1) }))}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>

          {/* Fecha legible con input date nativo que cubre el botón */}
          <div className="relative rounded-xl border border-input bg-background transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
            <div
              aria-hidden="true"
              className="flex h-8 sm:h-9 items-center gap-1.5 whitespace-nowrap px-2.5 text-xs font-semibold text-foreground sm:gap-2 sm:text-sm"
            >
              <CalendarDays className="size-3.5 sm:size-4 text-muted-foreground" />
              {fechaEtiqueta.format(new Date(`${fecha}T12:00:00Z`))}
            </div>
            <input
              aria-label="Cambiar fecha de la agenda"
              className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              disabled={activePending === "fecha"}
              onChange={(event) => {
                if (event.target.value) navigate("fecha", hrefFor({ fecha: event.target.value }));
              }}
              ref={fechaInputRef}
              type="date"
              value={fecha}
            />
          </div>

          {/* Vistas y Ajustes visibles a la derecha en móviles/tablets */}
          <div className="flex items-center gap-1 lg:hidden">
            <div aria-label="Vista de agenda" className="flex shrink-0 rounded-xl border border-border bg-muted p-0.5" role="group">
              {VIEWS.map((view) => (
                <Link
                  aria-current={vista === view.value ? "page" : undefined}
                  aria-label={`Vista ${view.label}`}
                  title={`Vista ${view.label}`}
                  className={cn(
                    "relative inline-flex h-7 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium whitespace-nowrap transition-colors",
                    vista === view.value
                      ? "bg-card font-semibold text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-primary",
                  )}
                  href={hrefFor({ vista: view.value })}
                  key={view.value}
                  onClick={guardRepeatedTap}
                >
                  <view.Icon aria-hidden="true" className="size-3.5" />
                  <span className="hidden sm:inline">{view.label}</span>
                  <ViewPendingIndicator label={view.label} />
                </Link>
              ))}
            </div>
            {action}
          </div>

          <span
            aria-live="polite"
            className={cn(
              "hidden sm:inline text-xs font-medium text-primary transition-opacity",
              activePending ? "opacity-100" : "opacity-0",
            )}
            role="status"
          >
            {activePending ? PENDING_LABEL[activePending] : "Actualizando…"}
          </span>
        </div>

        {/* Fila 2 en móvil / Lado derecho en escritorio: Búsqueda y Vistas en lg */}
        <div className="flex min-w-0 flex-row items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:w-64 xl:w-72">
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 sm:size-4 -translate-y-1/2 text-muted-foreground" />
            <label className="sr-only" htmlFor="agenda-buscar">
              Buscar citas
            </label>
            <input
              className="h-8 sm:h-9 w-full rounded-xl border border-input bg-background pl-8 sm:pl-9 pr-3 text-xs sm:text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              defaultValue={q}
              id="agenda-buscar"
              key={q}
              onChange={(event) => updateSearch(event.target.value)}
              placeholder="Buscar cliente, servicio o profesional…"
              type="search"
            />
          </div>

          <div aria-label="Vista de agenda" className="hidden lg:flex shrink-0 rounded-xl border border-border bg-muted p-1" role="group">
            {VIEWS.map((view) => (
              <Link
                aria-current={vista === view.value ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  vista === view.value
                    ? "bg-card font-semibold text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-primary",
                )}
                href={hrefFor({ vista: view.value })}
                key={view.value}
                onClick={guardRepeatedTap}
              >
                <view.Icon aria-hidden="true" className="size-4" />
                {view.label}
                <ViewPendingIndicator label={view.label} />
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center">
            {action}
          </div>
        </div>
      </div>

      {vista === "dia" ? (
        <nav
          aria-label="Elegir día"
          className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1 shadow-sm"
          ref={tiraRef}
        >
          {diasTira.map((dia) => {
            const activo = dia === fecha;
            return (
              <Link
                aria-current={activo ? "page" : undefined}
                className={cn(
                  "relative flex min-w-10 sm:min-w-11 shrink-0 flex-col items-center justify-center rounded-xl px-1.5 sm:px-2 py-1 sm:py-1.5 text-center transition-colors",
                  activo
                    ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                data-action-id="agenda.fecha.tira_dia"
                href={hrefFor({ fecha: dia })}
                key={dia}
                onClick={guardRepeatedTap}
                title={fechaEtiqueta.format(new Date(`${dia}T12:00:00Z`))}
              >
                <span className="text-op-xs capitalize leading-none">
                  {tiraDiaSemana.format(new Date(`${dia}T12:00:00Z`))}
                </span>
                <span className="text-sm sm:text-base font-bold leading-tight tabular-nums">
                  {tiraNumero.format(new Date(`${dia}T12:00:00Z`))}
                </span>
                {dia === hoy ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-0.5 size-1 rounded-full",
                      activo ? "bg-primary-foreground" : "bg-primary",
                    )}
                  />
                ) : null}
                {activo ? <ViewPendingIndicator label="día" /> : null}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
