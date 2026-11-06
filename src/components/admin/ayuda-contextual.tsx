"use client";

import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { buildAdminHref, firstParam } from "@/lib/url-context";

type DestinoAyuda = "/practica" | "/guia" | "/ayuda";

const RUTAS_PRACTICA = ["/admin/pos", "/admin/caja"];
const RUTAS_GUIA = ["/admin/agenda", "/admin/clientes", "/admin/servicios", "/admin/productos", "/admin/reportes"];
const RUTAS_SOLO_PLATAFORMA = ["/admin/incidentes", "/admin/telemetria"];

function estaEnRuta(pathname: string, ruta: string) {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

export function resolverAyudaRuta(pathname: string): DestinoAyuda | null {
  if (!estaEnRuta(pathname, "/admin")) return null;
  if (RUTAS_SOLO_PLATAFORMA.some((ruta) => estaEnRuta(pathname, ruta))) return null;
  if (RUTAS_PRACTICA.some((ruta) => estaEnRuta(pathname, ruta))) return "/practica";
  if (RUTAS_GUIA.some((ruta) => estaEnRuta(pathname, ruta))) return "/guia";
  return "/ayuda";
}

export function AyudaContextualBoton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const destino = resolverAyudaRuta(pathname);
  if (!destino) return null;

  return (
    <Link
      aria-label="Ayuda de esta pantalla"
      className="-my-2 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-op-xs font-semibold text-primary transition-colors hover:bg-accent sm:text-sm"
      data-action-id="ayuda.contextual"
      href={buildAdminHref(destino, {
        organizationId: firstParam(searchParams.get("organizationId")),
        sucursalId: firstParam(searchParams.get("sucursalId")),
      })}
    >
      <CircleHelp aria-hidden="true" className="size-4 shrink-0" />
      Ayuda
    </Link>
  );
}
