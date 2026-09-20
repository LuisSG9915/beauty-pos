"use client";

import { CalendarCheck, FlaskConical, ReceiptText, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SERVICIOS = [
  { nombre: "Corte y peinado", duracion: 60, precio: 350 },
  { nombre: "Manicura", duracion: 45, precio: 220 },
  { nombre: "Facial limpieza profunda", duracion: 75, precio: 480 },
] as const;

const HORAS = ["9:00", "11:30", "16:00"] as const;
const CLIENTE = "María López (ejemplo)";
const MEDIOS = ["Efectivo", "Tarjeta"] as const;

const PASOS = [
  "Bienvenida",
  "Agenda",
  "Nueva cita",
  "Cobro",
  "Ticket",
] as const;

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/**
 * Simulación educativa acotada: todo vive en memoria y ningún control llama
 * a acciones del servidor. La etiqueta «Práctica» es permanente.
 */
export function PracticaFlow({
  ayudaHref,
  historialHref,
}: {
  ayudaHref: string;
  historialHref: string;
}) {
  const [paso, setPaso] = useState(0);
  const [servicio, setServicio] = useState(0);
  const [hora, setHora] = useState(0);
  const [medio, setMedio] = useState(0);

  const reiniciar = () => {
    setPaso(0);
    setServicio(0);
    setHora(0);
    setMedio(0);
  };

  const elegido = SERVICIOS[servicio];

  return (
    <div className="space-y-5">
      <p
        className="flex items-center gap-2 rounded-xl border border-[#e8d9b8] bg-[#fdf8ec] px-4 py-3 text-sm font-medium text-[#7a5b1e]"
        role="status"
      >
        <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
        Práctica: estos datos no pertenecen a tu negocio. Nada de lo que hagas aquí se guarda.
      </p>

      <ol aria-label="Progreso de la práctica" className="flex flex-wrap items-center gap-2">
        {PASOS.map((nombre, index) => (
          <li
            aria-current={index === paso ? "step" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              index === paso
                ? "bg-[#8a5140] text-white"
                : index < paso
                  ? "bg-[#e8f0ea] text-[#347052]"
                  : "bg-[#f1eeea] text-[#81746c]",
            )}
            key={nombre}
          >
            {index + 1}. {nombre}
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border border-[#eadfd8] bg-white p-5 shadow-sm sm:p-6">
        {paso === 0 ? (
          <div className="max-w-xl">
            <h2 className="text-lg font-semibold text-[#2d2926]">Así funciona el día a día</h2>
            <p className="mt-2 text-sm leading-6 text-[#625b55]">
              En menos de un minuto vas a agendar una cita de ejemplo, cobrarla y ver su ticket.
              Es el mismo camino que seguirás con tus clientes reales.
            </p>
            <Button className="mt-5" onClick={() => setPaso(1)} type="button">
              Empezar
            </Button>
          </div>
        ) : null}

        {paso === 1 ? (
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#2d2926]">
              <CalendarCheck aria-hidden="true" className="size-5 text-[#8a5140]" />
              Agenda de ejemplo
            </h2>
            <p className="mt-1 text-sm text-[#81746c]">Martes · cada bloqueo es una cita.</p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-[#f4eeea] bg-[#faf6f3] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#2d2926]">9:00 · {CLIENTE}</p>
                  <p className="text-xs text-[#81746c]">Retoque de tinte</p>
                </div>
                <span className="rounded-full bg-[#e8f0ea] px-2.5 py-1 text-xs font-medium text-[#347052]">Confirmada</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-dashed border-[#ded8d2] px-4 py-3">
                <p className="text-sm text-[#a89d95]">11:30 · libre</p>
                <span className="text-xs text-[#a89d95]">Disponible</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-dashed border-[#ded8d2] px-4 py-3">
                <p className="text-sm text-[#a89d95]">16:00 · libre</p>
                <span className="text-xs text-[#a89d95]">Disponible</span>
              </div>
            </div>
            <Button className="mt-5" onClick={() => setPaso(2)} type="button">
              Agendar cita de ejemplo
            </Button>
          </div>
        ) : null}

        {paso === 2 ? (
          <div className="max-w-xl">
            <h2 className="text-lg font-semibold text-[#2d2926]">Nueva cita para {CLIENTE}</h2>
            <p className="mt-1 text-sm text-[#81746c]">Elige un servicio y una hora disponible.</p>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#8a7b72]">Servicio</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3" role="group" aria-label="Servicio de ejemplo">
              {SERVICIOS.map((item, index) => (
                <button
                  aria-pressed={servicio === index}
                  className={cn(
                    "rounded-xl border px-3 py-3 text-left transition-colors",
                    servicio === index
                      ? "border-[#8a5140] bg-[#f2e3dc]"
                      : "border-[#eadfd8] hover:border-[#c9a899]",
                  )}
                  key={item.nombre}
                  onClick={() => setServicio(index)}
                  type="button"
                >
                  <span className="block text-sm font-medium text-[#2d2926]">{item.nombre}</span>
                  <span className="mt-0.5 block text-xs text-[#81746c]">
                    {item.duracion} min · {money.format(item.precio)}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#8a7b72]">Hora</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Hora de ejemplo">
              {HORAS.map((valor, index) => (
                <button
                  aria-pressed={hora === index}
                  className={cn(
                    "min-h-11 rounded-xl border px-4 text-sm font-medium transition-colors",
                    hora === index
                      ? "border-[#8a5140] bg-[#f2e3dc] text-[#2d2926]"
                      : "border-[#eadfd8] text-[#625b55] hover:border-[#c9a899]",
                  )}
                  key={valor}
                  onClick={() => setHora(index)}
                  type="button"
                >
                  {valor}
                </button>
              ))}
            </div>

            <Button className="mt-6" onClick={() => setPaso(3)} type="button">
              Confirmar cita
            </Button>
          </div>
        ) : null}

        {paso === 3 ? (
          <div className="max-w-xl">
            <h2 className="text-lg font-semibold text-[#2d2926]">La cita quedó en la agenda</h2>
            <div className="mt-4 rounded-xl border border-[#e3ece6] bg-[#f4f9f6] px-4 py-3">
              <p className="text-sm font-medium text-[#2d2926]">
                {HORAS[hora]} · {CLIENTE}
              </p>
              <p className="text-xs text-[#347052]">
                {elegido.nombre} · {elegido.duracion} min · {money.format(elegido.precio)}
              </p>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#625b55]">
              Cuando la clienta llegue, cobras desde la misma cita o desde Cobrar. Vamos a cobrarla.
            </p>
            <Button className="mt-5" onClick={() => setPaso(4)} type="button">
              Cobrar {money.format(elegido.precio)}
            </Button>
          </div>
        ) : null}

        {paso === 4 ? (
          <div className="max-w-xl">
            <h2 className="text-lg font-semibold text-[#2d2926]">Cobro de ejemplo</h2>
            <div className="mt-4 rounded-xl border border-[#f4eeea] bg-[#faf6f3] px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#625b55]">{elegido.nombre}</span>
                <span className="font-medium tabular-nums text-[#2d2926]">{money.format(elegido.precio)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-[#eadfd8] pt-2">
                <span className="text-sm font-semibold text-[#2d2926]">Total</span>
                <span className="font-semibold tabular-nums text-[#2d2926]">{money.format(elegido.precio)}</span>
              </div>
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#8a7b72]">Medio de pago</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Medio de pago de ejemplo">
              {MEDIOS.map((valor, index) => (
                <button
                  aria-pressed={medio === index}
                  className={cn(
                    "min-h-11 rounded-xl border px-4 text-sm font-medium transition-colors",
                    medio === index
                      ? "border-[#8a5140] bg-[#f2e3dc] text-[#2d2926]"
                      : "border-[#eadfd8] text-[#625b55] hover:border-[#c9a899]",
                  )}
                  key={valor}
                  onClick={() => setMedio(index)}
                  type="button"
                >
                  {valor}
                </button>
              ))}
            </div>

            <Button className="mt-6" onClick={() => setPaso(5)} type="button">
              Confirmar cobro de ejemplo
            </Button>
          </div>
        ) : null}

        {paso === 5 ? (
          <div className="max-w-xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[#2d2926]">
              <ReceiptText aria-hidden="true" className="size-5 text-[#8a5140]" />
              Ticket de ejemplo
            </h2>
            <div className="mt-4 rounded-xl border border-[#f4eeea] bg-[#faf6f3] px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7b72]">Venta completada</p>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#625b55]">{elegido.nombre} · {CLIENTE}</span>
                  <span className="tabular-nums text-[#2d2926]">{money.format(elegido.precio)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#625b55]">Medio de pago</span>
                  <span className="text-[#2d2926]">{MEDIOS[medio]}</span>
                </div>
                <div className="flex justify-between border-t border-[#eadfd8] pt-2 font-semibold">
                  <span className="text-[#2d2926]">Total cobrado</span>
                  <span className="tabular-nums text-[#2d2926]">{money.format(elegido.precio)}</span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#625b55]">
              Con datos reales, este ticket queda en <strong>Historial de ventas</strong>, donde puedes
              reabrirlo, registrar una devolución o corregir el medio de pago.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href={historialHref} />}>
                Ver el historial real
              </Button>
              <Button onClick={reiniciar} type="button" variant="outline">
                <RotateCcw aria-hidden="true" className="size-4" />
                Repetir práctica
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {paso > 0 && paso < PASOS.length ? (
          <Button onClick={() => setPaso(paso - 1)} type="button" variant="ghost">
            Anterior
          </Button>
        ) : null}
        <Link className="text-sm font-medium text-[#8a5140] hover:underline" href={ayudaHref}>
          Salir de la práctica
        </Link>
      </div>
    </div>
  );
}
