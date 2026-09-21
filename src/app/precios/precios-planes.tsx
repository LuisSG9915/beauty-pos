"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export type PlanPrecioCard = {
  clave: string;
  nombre: string;
  descripcion: string;
  precioMensual: string;
  precioAnual: string | null;
  /** Precio de lista para mostrar tachado durante el precio fundador. */
  precioListaMensual: string | null;
  precioListaAnual: string | null;
  precioListaSucursalExtra: string | null;
  sucursalesIncluidas: number;
  precioSucursalExtra: string | null;
  moneda: string;
  destacado: boolean;
  maxSucursales: number | null;
  beneficios: string[];
};

function formatoPrecio(valor: number, moneda: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: moneda || "MXN",
    maximumFractionDigits: 0,
  }).format(valor);
}

const MAX_SELECTOR = 10;

/**
 * Cuadrícula comercial interactiva: toggle mensual/anual y calculadora de
 * sucursales. El precio anual equivale a 10 mensualidades (2 meses de
 * ahorro). Cuando el conteo supera el máximo del plan se muestra el aviso en
 * vez de un precio engañoso.
 */
export function PreciosPlanes({ planes }: { planes: PlanPrecioCard[] }) {
  const [anual, setAnual] = useState(false);
  const [sucursales, setSucursales] = useState(1);

  return (
    <div>
      <div className="mb-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
        <div className="inline-flex rounded-full border border-[#dbd6dd] bg-white p-1">
          {(["mensual", "anual"] as const).map((modo) => (
            <button
              className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                (modo === "anual") === anual
                  ? "bg-[#29242a] text-[#faf6fd]"
                  : "text-[#6d6271] hover:text-[#29242a]"
              }`}
              key={modo}
              onClick={() => setAnual(modo === "anual")}
              type="button"
            >
              {modo === "mensual" ? "Mensual" : "Anual · 2 meses gratis"}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-3 rounded-full border border-[#dbd6dd] bg-white px-4 py-1.5">
          <span className="text-sm text-[#6d6271]">Sucursales:</span>
          <button
            aria-label="Quitar sucursal"
            className="flex size-7 items-center justify-center rounded-full border border-[#dbd6dd] text-[#453d48] transition-colors hover:bg-[#f2f0f2] disabled:opacity-40"
            disabled={sucursales <= 1}
            onClick={() => setSucursales((n) => Math.max(1, n - 1))}
            type="button"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-semibold">{sucursales}</span>
          <button
            aria-label="Agregar sucursal"
            className="flex size-7 items-center justify-center rounded-full border border-[#dbd6dd] text-[#453d48] transition-colors hover:bg-[#f2f0f2] disabled:opacity-40"
            disabled={sucursales >= MAX_SELECTOR}
            onClick={() => setSucursales((n) => Math.min(MAX_SELECTOR, n + 1))}
            type="button"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {planes.map((plan) => {
          const mensual = Number(plan.precioMensual);
          const anualMonto = plan.precioAnual ? Number(plan.precioAnual) : null;
          const extraMensual = plan.precioSucursalExtra ? Number(plan.precioSucursalExtra) : 0;
          const extras = Math.max(0, sucursales - plan.sucursalesIncluidas);
          const excedeMax = plan.maxSucursales != null && sucursales > plan.maxSucursales;
          const total = anual && anualMonto
            ? anualMonto + extras * extraMensual * 10
            : mensual + extras * extraMensual;
          const equivMensual = anual && anualMonto ? total / 12 : null;
          const listaBase = plan.precioListaMensual ? Number(plan.precioListaMensual) : null;
          const listaAnual = plan.precioListaAnual ? Number(plan.precioListaAnual) : null;
          const extraLista = plan.precioListaSucursalExtra
            ? Number(plan.precioListaSucursalExtra)
            : extraMensual;
          const listaTotal = listaBase != null
            ? (anual && listaAnual ? listaAnual + extras * extraLista * 10 : listaBase + extras * extraLista)
            : null;
          const esFundador = listaTotal != null && listaTotal > total;

          return (
            <article
              className={`flex flex-col rounded-3xl border bg-white p-7 ${
                plan.destacado
                  ? "border-[#724b7f] shadow-[0_20px_60px_-28px_rgba(70,45,33,0.4)]"
                  : "border-[#e8e4ea]"
              }`}
              key={plan.clave}
            >
              {plan.destacado ? (
                <span className="mb-4 w-fit rounded-full bg-[#f2ecf4] px-3 py-1 text-xs font-semibold text-[#885699]">
                  El más elegido
                </span>
              ) : null}
              <h2 className="text-xl font-semibold">{plan.nombre}</h2>
              <p className="mt-1 text-sm text-[#675d6a]">{plan.descripcion}</p>

              {excedeMax ? (
                <p className="mt-5 text-sm font-medium text-[#885699]">
                  Este plan permite hasta {plan.maxSucursales} sucursal(es).{" "}
                  {plan.clave === "profesional" ? "" : "El plan Profesional cubre más."}
                </p>
              ) : (
                <>
                  {esFundador && listaTotal != null ? (
                    <p className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-[#a99fb0] line-through">
                        {formatoPrecio(listaTotal, plan.moneda)}
                      </span>
                      <span className="rounded-full bg-[#f2ecf4] px-2 py-0.5 text-xs font-semibold text-[#885699]">
                        Precio fundador
                      </span>
                    </p>
                  ) : null}
                  <p className={esFundador ? "mt-1" : "mt-5"}>
                    <span className="text-3xl font-semibold tracking-tight">
                      {formatoPrecio(total, plan.moneda)}
                    </span>
                    <span className="text-sm text-[#675d6a]">
                      {" "}
                      / {anual ? "año" : "mes"}
                      {sucursales > 1 ? ` · ${sucursales} sucursales` : ""}
                    </span>
                  </p>
                  {equivMensual !== null ? (
                    <p className="mt-1 text-xs text-[#675d6a]">
                      Equivale a {formatoPrecio(equivMensual, plan.moneda)}/mes — ahorras{" "}
                      {formatoPrecio((mensual + extras * extraMensual) * 12 - total, plan.moneda)} al año.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-[#675d6a]">
                      Incluye {plan.sucursalesIncluidas} sucursal(es)
                      {extras > 0
                        ? ` + ${extras} × ${formatoPrecio(extraMensual, plan.moneda)}`
                        : plan.precioSucursalExtra
                          ? ` · adicional ${formatoPrecio(extraMensual, plan.moneda)}/mes`
                          : ""}
                    </p>
                  )}
                </>
              )}
              <p className="mt-1 text-xs text-[#97869c]">Precios en MXN, IVA incluido.</p>

              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-[#453d48]">
                {plan.beneficios.map((beneficio) => (
                  <li className="flex items-start gap-2.5" key={beneficio}>
                    <Check className="mt-0.5 size-4 shrink-0 text-[#5d9a76]" />
                    {beneficio}
                  </li>
                ))}
              </ul>
              <Button
                className={`mt-7 w-full rounded-xl ${
                  plan.destacado
                    ? "bg-[#29242a] text-[#faf6fd] hover:bg-[#403743]"
                    : "border-[#d8d3d9] bg-white hover:bg-[#f2f0f2]"
                }`}
                nativeButton={false}
                render={<Link href="/registro" />}
                variant={plan.destacado ? "default" : "outline"}
              >
                Empezar prueba gratis
              </Button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
