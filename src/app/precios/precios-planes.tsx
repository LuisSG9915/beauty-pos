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
        <div className="inline-flex rounded-full border border-[#e3d8d0] bg-white p-1">
          {(["mensual", "anual"] as const).map((modo) => (
            <button
              className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
                (modo === "anual") === anual
                  ? "bg-[#2c2522] text-[#fffaf5]"
                  : "text-[#74675f] hover:text-[#2c2522]"
              }`}
              key={modo}
              onClick={() => setAnual(modo === "anual")}
              type="button"
            >
              {modo === "mensual" ? "Mensual" : "Anual · 2 meses gratis"}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-3 rounded-full border border-[#e3d8d0] bg-white px-4 py-1.5">
          <span className="text-sm text-[#74675f]">Sucursales:</span>
          <button
            aria-label="Quitar sucursal"
            className="flex size-7 items-center justify-center rounded-full border border-[#e3d8d0] text-[#4b403a] transition-colors hover:bg-[#f4f1ee] disabled:opacity-40"
            disabled={sucursales <= 1}
            onClick={() => setSucursales((n) => Math.max(1, n - 1))}
            type="button"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-semibold">{sucursales}</span>
          <button
            aria-label="Agregar sucursal"
            className="flex size-7 items-center justify-center rounded-full border border-[#e3d8d0] text-[#4b403a] transition-colors hover:bg-[#f4f1ee] disabled:opacity-40"
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
          const excedeMax = plan.maxSucursales != null && sucursales > plan.maxSucursales;
          const total = anual && anualMonto ? anualMonto * sucursales : mensual * sucursales;
          const equivMensual = anual && anualMonto ? (anualMonto / 12) * sucursales : null;

          return (
            <article
              className={`flex flex-col rounded-3xl border bg-white p-7 ${
                plan.destacado
                  ? "border-[#b8795d] shadow-[0_20px_60px_-28px_rgba(70,45,33,0.4)]"
                  : "border-[#eee6e0]"
              }`}
              key={plan.clave}
            >
              {plan.destacado ? (
                <span className="mb-4 w-fit rounded-full bg-[#f8eee8] px-3 py-1 text-xs font-semibold text-[#a76348]">
                  El más elegido
                </span>
              ) : null}
              <h2 className="text-xl font-semibold">{plan.nombre}</h2>
              <p className="mt-1 text-sm text-[#81746c]">{plan.descripcion}</p>

              {excedeMax ? (
                <p className="mt-5 text-sm font-medium text-[#a76348]">
                  Este plan permite hasta {plan.maxSucursales} sucursal(es).{" "}
                  {plan.clave === "profesional" ? "" : "El plan Profesional cubre más."}
                </p>
              ) : (
                <>
                  <p className="mt-5">
                    <span className="text-3xl font-semibold tracking-tight">
                      {formatoPrecio(total, plan.moneda)}
                    </span>
                    <span className="text-sm text-[#8a7b72]">
                      {" "}
                      / {anual ? "año" : "mes"}
                      {sucursales > 1 ? ` · ${sucursales} sucursales` : " por sucursal"}
                    </span>
                  </p>
                  {equivMensual !== null ? (
                    <p className="mt-1 text-xs text-[#8a7b72]">
                      Equivale a {formatoPrecio(equivMensual, plan.moneda)}/mes — ahorras{" "}
                      {formatoPrecio(mensual * 12 * sucursales - total, plan.moneda)} al año.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-[#8a7b72]">
                      {sucursales > 1
                        ? `${formatoPrecio(mensual, plan.moneda)} por sucursal al mes`
                        : "Precio por sucursal al mes"}
                    </p>
                  )}
                </>
              )}
              <p className="mt-1 text-xs text-[#a18d81]">Precios en MXN, IVA incluido.</p>

              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-[#4b403a]">
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
                    ? "bg-[#2c2522] text-[#fffaf5] hover:bg-[#463a34]"
                    : "border-[#ded5ce] bg-white hover:bg-[#f4f1ee]"
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
