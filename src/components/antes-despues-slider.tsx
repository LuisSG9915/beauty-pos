"use client";

import { ChevronsLeftRight } from "lucide-react";
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent, type TouchEvent } from "react";

import { cn } from "@/lib/utils";

type AntesDespuesSliderProps = {
  antesUrl?: string | null;
  despuesUrl?: string | null;
  altAntes?: string;
  altDespues?: string;
  className?: string;
  aspectRatioClass?: string;
};

/**
 * Slider interactivo de comparación visual Antes vs. Después.
 * Soporta deslizamiento táctil y por puntero, atajos de teclado accesibles
 * y recorte acelerado por hardware con clip-path.
 */
export function AntesDespuesSlider({
  antesUrl,
  despuesUrl,
  altAntes = "Fotografía inicial (Antes)",
  altDespues = "Resultado final (Después)",
  className,
  aspectRatioClass = "aspect-[4/5] sm:aspect-square",
}: AntesDespuesSliderProps) {
  const [posicion, setPosicion] = useState(50); // Porcentaje de 0 a 100
  const [arrastrando, setArrastrando] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const actualizarPosicion = useCallback((clientX: number) => {
    if (!contenedorRef.current) return;
    const rect = contenedorRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const porcentaje = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosicion(Math.round(porcentaje));
  }, []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setArrastrando(true);
    actualizarPosicion(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (arrastrando) {
      actualizarPosicion(e.clientX);
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    setArrastrando(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignorar si el puntero ya se liberó
    }
  };

  const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches[0]) {
      actualizarPosicion(e.touches[0].clientX);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setPosicion((p) => Math.max(0, p - 5));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setPosicion((p) => Math.min(100, p + 5));
    } else if (e.key === "Home") {
      e.preventDefault();
      setPosicion(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setPosicion(100);
    }
  };

  // Si solo hay una imagen disponible, mostrar foto única con su badge
  if (antesUrl && !despuesUrl) {
    return (
      <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-muted", aspectRatioClass, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={altAntes} className="size-full object-cover" src={antesUrl} />
        <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 text-op-xs font-semibold text-white backdrop-blur-md">
          Antes
        </span>
      </div>
    );
  }

  if (!antesUrl && despuesUrl) {
    return (
      <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-muted", aspectRatioClass, className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={altDespues} className="size-full object-cover" src={despuesUrl} />
        <span className="absolute top-3 right-3 rounded-full border border-emerald-500/30 bg-emerald-950/80 px-3 py-1 text-op-xs font-semibold text-emerald-200 backdrop-blur-md">
          Resultado final
        </span>
      </div>
    );
  }

  if (!antesUrl && !despuesUrl) {
    return null;
  }

  return (
    <div
      aria-label="Comparador interactivo de antes y después"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={posicion}
      className={cn(
        "group relative select-none overflow-hidden rounded-2xl border border-border bg-muted shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        aspectRatioClass,
        className,
      )}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onTouchMove={onTouchMove}
      ref={contenedorRef}
      role="slider"
      tabIndex={0}
    >
      {/* Capa base: DESPUÉS (fondo completo) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={altDespues}
        className="pointer-events-none absolute inset-0 size-full object-cover"
        draggable={false}
        src={despuesUrl!}
      />

      {/* Capa superpuesta: ANTES (recortada con clip-path según posición) */}
      <div
        className="pointer-events-none absolute inset-0 size-full overflow-hidden"
        style={{
          clipPath: `inset(0 ${100 - posicion}% 0 0)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={altAntes}
          className="pointer-events-none size-full object-cover"
          draggable={false}
          src={antesUrl!}
        />
      </div>

      {/* Badges fijos en esquinas superiores */}
      <div className="pointer-events-none absolute top-3 left-3 z-10">
        <span className="rounded-full bg-black/60 px-2.5 py-1 text-op-xs font-bold uppercase tracking-wider text-white backdrop-blur-md shadow-sm">
          Antes
        </span>
      </div>
      <div className="pointer-events-none absolute top-3 right-3 z-10">
        <span className="rounded-full border border-emerald-500/40 bg-emerald-950/70 px-2.5 py-1 text-op-xs font-bold uppercase tracking-wider text-emerald-200 backdrop-blur-md shadow-sm">
          Después
        </span>
      </div>

      {/* Línea divisoria y manija de arrastre */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)] transition-shadow group-hover:shadow-[0_0_12px_rgba(255,255,255,0.8)]"
        style={{ left: `${posicion}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex size-10 items-center justify-center rounded-full border border-white/40 bg-white text-zinc-900 shadow-xl backdrop-blur-sm transition-transform group-hover:scale-105 active:scale-95">
          <ChevronsLeftRight aria-hidden="true" className="size-5" />
        </div>
      </div>
    </div>
  );
}
