export type PoseTimer = {
  id: string;
  citaId: string;
  clienteNombre: string;
  servicioNombre: string;
  estacionNombre?: string;
  tipo?: string;
  minutosTotales: number;
  iniciaAt: number; // timestamp en ms
  terminaAt: number; // timestamp en ms
  pausadoAt?: number | null;
  completado: boolean;
};

export const POSE_STORAGE_KEY = "melena_pose_timers_v1";

/** Inicia o actualiza un temporizador de pose en el almacenamiento local del navegador. */
export function iniciarPoseTimerEnNavegador(timer: PoseTimer): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(POSE_STORAGE_KEY);
    const timers: PoseTimer[] = raw ? JSON.parse(raw) : [];
    const filtrados = timers.filter((t) => t.id !== timer.id);
    filtrados.push(timer);
    localStorage.setItem(POSE_STORAGE_KEY, JSON.stringify(filtrados));
    window.dispatchEvent(new CustomEvent("melena:pose_timer_changed"));

    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch (err) {
    console.warn("No se pudo iniciar el temporizador en localStorage:", err);
  }
}

/**
 * Crea una nueva instancia de temporizador de pose químico.
 */
export function crearPoseTimer(input: {
  citaId?: string;
  clienteNombre: string;
  servicioNombre?: string;
  estacionNombre?: string;
  minutos?: number;
  minutosTotales?: number;
  id?: string;
  nowMs?: number;
  tipo?: string;
}): PoseTimer {
  const now = input.nowMs ?? Date.now();
  const mins = input.minutos ?? input.minutosTotales ?? 30;
  const duracionMs = Math.max(1, Math.round(mins * 60 * 1000));
  const fallbackId = `pose_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const id = input.id ?? input.citaId ?? fallbackId;
  return {
    id,
    citaId: input.citaId ?? id,
    clienteNombre: input.clienteNombre.trim() || "Cliente",
    servicioNombre: input.servicioNombre?.trim() || "Servicio",
    minutosTotales: mins,
    iniciaAt: now,
    terminaAt: now + duracionMs,
    completado: false,
  };
}

/**
 * Calcula los segundos restantes de un temporizador de pose.
 */
export function calcularSegundosRestantes(timer: PoseTimer, nowMs = Date.now()): number {
  if (timer.completado) return 0;
  if (timer.pausadoAt) {
    const restante = Math.max(0, Math.round((timer.terminaAt - timer.pausadoAt) / 1000));
    return restante;
  }
  const restante = Math.max(0, Math.round((timer.terminaAt - nowMs) / 1000));
  return restante;
}

/**
 * Formatea segundos restantes en formato mm:ss legible.
 */
export function formatearTiempoRestante(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Reproduce un acorde armónico suave tipo campana de cristal tibetana
 * usando Web Audio API. Sin dependencias externas ni archivos de sonido pesados.
 */
export function reproducirAcordePose(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    // Tríada mayor suave: Do5 (523Hz), Mi5 (659Hz), Sol5 (784Hz), Do6 (1046Hz)
    const frecuencias = [523.25, 659.25, 783.99, 1046.5];
    const now = ctx.currentTime;

    frecuencias.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      // Desfase armónico sutil de 80ms entre notas tipo arpegio zen
      const startNote = now + index * 0.08;
      const duration = 2.2;

      gain.gain.setValueAtTime(0.0001, startNote);
      gain.gain.linearRampToValueAtTime(0.12 / frecuencias.length, startNote + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, startNote + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startNote);
      osc.stop(startNote + duration + 0.1);
    });
  } catch (err) {
    console.warn("No se pudo reproducir el sonido de pose:", err);
  }
}
