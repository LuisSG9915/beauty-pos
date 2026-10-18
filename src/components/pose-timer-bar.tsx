"use client";

import { Clock, Volume2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  calcularSegundosRestantes,
  formatearTiempoRestante,
  iniciarPoseTimerEnNavegador,
  POSE_STORAGE_KEY,
  reproducirAcordePose,
  type PoseTimer,
} from "@/modules/agenda/temporizador";

export { iniciarPoseTimerEnNavegador };

export function PoseTimerBar() {
  const toast = useToast();
  const [timers, setTimers] = useState<PoseTimer[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());

  // Sincronizar desde localStorage y eventos
  useEffect(() => {
    const cargar = () => {
      try {
        const raw = localStorage.getItem(POSE_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PoseTimer[];
          setTimers(parsed.filter((t) => !t.completado));
        } else {
          setTimers([]);
        }
      } catch {
        setTimers([]);
      }
    };

    cargar();
    window.addEventListener("melena:pose_timer_changed", cargar);
    window.addEventListener("storage", cargar);

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.removeEventListener("melena:pose_timer_changed", cargar);
      window.removeEventListener("storage", cargar);
      clearInterval(interval);
    };
  }, []);

  // Verificar expiración de temporizadores
  useEffect(() => {
    timers.forEach((timer) => {
      const restantes = calcularSegundosRestantes(timer, now);
      if (restantes <= 0 && !timer.completado) {
        // Marcar completado
        timer.completado = true;
        reproducirAcordePose();
        toast.info(
          `¡Tiempo de pose completado para ${timer.clienteNombre}! (${timer.servicioNombre})`,
        );

        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(`Pose lista: ${timer.clienteNombre}`, {
              body: `El tiempo de pose de ${timer.minutosTotales} min ha finalizado.`,
              icon: "/favicon.ico",
            });
          } catch {
            // Ignorar
          }
        }

        // Actualizar almacenamiento
        try {
          const raw = localStorage.getItem(POSE_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as PoseTimer[];
            const actualizados = parsed.map((t) => (t.id === timer.id ? { ...t, completado: true } : t));
            localStorage.setItem(POSE_STORAGE_KEY, JSON.stringify(actualizados));
          }
        } catch {
          // Ignorar
        }
      }
    });
  }, [now, timers, toast]);

  const descartarTimer = (timerId: string) => {
    const actualizados = timers.filter((t) => t.id !== timerId);
    setTimers(actualizados);
    try {
      localStorage.setItem(POSE_STORAGE_KEY, JSON.stringify(actualizados));
      window.dispatchEvent(new CustomEvent("melena:pose_timer_changed"));
    } catch {
      // Ignorar
    }
  };

  const extenderCincoMinutos = (timerId: string) => {
    const actualizados = timers.map((t) => {
      if (t.id === timerId) {
        return {
          ...t,
          terminaAt: t.terminaAt + 5 * 60 * 1000,
          minutosTotales: t.minutosTotales + 5,
          completado: false,
        };
      }
      return t;
    });
    setTimers(actualizados);
    try {
      localStorage.setItem(POSE_STORAGE_KEY, JSON.stringify(actualizados));
      window.dispatchEvent(new CustomEvent("melena:pose_timer_changed"));
    } catch {
      // Ignorar
    }
  };

  const activos = timers.filter((t) => !t.completado);
  if (activos.length === 0) return null;

  return (
    <aside
      aria-label="Temporizadores de pose activos"
      className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-xl sm:bottom-6"
    >
      <div className="flex flex-col gap-2">
        {activos.map((timer) => {
          const restantes = calcularSegundosRestantes(timer, now);
          const esCritico = restantes <= 300; // últimos 5 minutos

          return (
            <div
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md transition-all ${
                esCritico
                  ? "border-warning/60 bg-warning-soft text-warning-soft-foreground animate-pulse"
                  : "border-primary/30 bg-card/95 text-card-foreground"
              }`}
              key={timer.id}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl font-bold ${
                    esCritico ? "bg-warning text-warning-foreground" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Clock aria-hidden="true" className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-op-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tiempo de Pose · {timer.clienteNombre}
                  </p>
                  <p className="flex items-baseline gap-2">
                    <span className="font-mono text-xl font-bold tabular-nums">
                      {formatearTiempoRestante(restantes)}
                    </span>
                    <span className="truncate text-op-xs text-muted-foreground">
                      {timer.servicioNombre} ({timer.minutosTotales}m)
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <Button
                  aria-label="Agregar 5 minutos"
                  className="h-8 rounded-lg text-op-xs"
                  onClick={() => extenderCincoMinutos(timer.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  +5 min
                </Button>
                <Button
                  aria-label="Probar sonido armónico"
                  className="size-8 rounded-lg"
                  onClick={reproducirAcordePose}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Volume2 aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  aria-label="Finalizar pose"
                  className="size-8 rounded-lg text-destructive hover:text-destructive"
                  onClick={() => descartarTimer(timer.id)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
