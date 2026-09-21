"use client";

import { normalizarRuta } from "./ruta";

/**
 * Colector de telemetría de producto (navegador). Mantiene una sesión por
 * pestaña (`bp_sid` en sessionStorage, rota tras 30 min sin actividad), encola
 * eventos y los envía en lote a `/api/telemetria/producto` con `sendBeacon` /
 * `fetch keepalive`. Todo falla en silencio: la telemetría nunca debe romper
 * la aplicación ni bloquear al usuario.
 *
 * Privacidad: no captura valores de formularios, texto libre ni cookies; solo
 * IDs de acción semánticos (`modulo.objeto.accion`) declarados con
 * `data-action-id` o vía `trackAction`.
 */

const SID_KEY = "bp_sid";
const SID_TS_KEY = "bp_sid_ts";
const ROTACION_MS = 30 * 60_000;
const FLUSH_MS = 15_000;
const MAX_COLA = 25;
const MAX_RASTRO = 8;

export type EventoProducto = {
  tipo: "page_view" | "action" | "form_success" | "form_error" | "performance";
  ruta?: string;
  actionId?: string;
  accionClave?: boolean;
  metrica?: string;
  valor?: number;
  clientAt: number;
};

type SesionLocal = {
  sid: string;
  iniciaAt: number;
  paginas: number;
  acciones: number;
  accionesClave: number;
  tiempoActivoMs: number;
  ultimaVisibilidadAt: number;
};

type Contexto = {
  organizacionId: string | null;
  sucursalId: string | null;
  dispositivo: string;
  navegador: string;
  release: string | null;
};

const cola: EventoProducto[] = [];
const rastroAcciones: string[] = [];
let sesion: SesionLocal | null = null;
let iniciado = false;

function nuevoSid(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 32);
}

function obtenerSesion(): SesionLocal {
  const ahora = Date.now();
  try {
    const sid = sessionStorage.getItem(SID_KEY);
    const ts = Number(sessionStorage.getItem(SID_TS_KEY) ?? "0");
    if (sid && ahora - ts < ROTACION_MS && sesion?.sid === sid) {
      sessionStorage.setItem(SID_TS_KEY, String(ahora));
      return sesion;
    }
    if (sid && ahora - ts < ROTACION_MS) {
      sesion = {
        sid,
        iniciaAt: ahora,
        paginas: 0,
        acciones: 0,
        accionesClave: 0,
        tiempoActivoMs: 0,
        ultimaVisibilidadAt: document.visibilityState === "visible" ? ahora : 0,
      };
      sessionStorage.setItem(SID_TS_KEY, String(ahora));
      return sesion;
    }
  } catch {
    // sessionStorage bloqueado (modo privado estricto): sesión en memoria.
  }
  sesion = {
    sid: nuevoSid(),
    iniciaAt: ahora,
    paginas: 0,
    acciones: 0,
    accionesClave: 0,
    tiempoActivoMs: 0,
    ultimaVisibilidadAt: document.visibilityState === "visible" ? ahora : 0,
  };
  try {
    sessionStorage.setItem(SID_KEY, sesion.sid);
    sessionStorage.setItem(SID_TS_KEY, String(ahora));
  } catch {
    // Ignorar: la sesión vive solo en memoria para esta pestaña.
  }
  return sesion;
}

function contexto(): Contexto {
  const params = new URLSearchParams(window.location.search);
  const ua = navigator.userAgent;
  return {
    organizacionId: params.get("organizationId"),
    sucursalId: params.get("sucursalId"),
    dispositivo:
      /Mobile|Android|iPhone|iPad/i.test(ua) ? "movil" : "escritorio",
    navegador: /Edg\//.test(ua)
      ? "edge"
      : /Chrome\//.test(ua)
        ? "chrome"
        : /Safari\//.test(ua)
          ? "safari"
          : /Firefox\//.test(ua)
            ? "firefox"
            : "otro",
    release: process.env.NEXT_PUBLIC_APP_RELEASE ?? null,
  };
}

function encolar(evento: EventoProducto) {
  cola.push(evento);
  if (cola.length >= MAX_COLA) flushTelemetria();
}

/** Envía la cola + estado de la sesión. `beacon` = la página se está cerrando. */
export function flushTelemetria(beacon = false) {
  const actual = obtenerSesion();
  if (cola.length === 0 && !beacon) return;

  // Acumula el tiempo visible hasta este momento.
  if (actual.ultimaVisibilidadAt > 0 && document.visibilityState === "visible") {
    actual.tiempoActivoMs += Date.now() - actual.ultimaVisibilidadAt;
    actual.ultimaVisibilidadAt = Date.now();
  }

  const payload = {
    sesion: {
      sid: actual.sid,
      iniciaAt: actual.iniciaAt,
      paginas: actual.paginas,
      acciones: actual.acciones,
      accionesClave: actual.accionesClave,
      tiempoActivoMs: Math.round(actual.tiempoActivoMs),
      entradaRuta: actual.paginas > 0 ? undefined : normalizarRuta(location.pathname),
      salidaRuta: normalizarRuta(location.pathname),
      ...contexto(),
    },
    eventos: cola.splice(0, cola.length),
  };

  const body = JSON.stringify(payload);
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/telemetria/producto",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    void fetch("/api/telemetria/producto", {
      body,
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    }).catch(() => {});
  } catch {
    // Nunca propagar errores de telemetría.
  }
}

export function trackPageView(url?: string) {
  const actual = obtenerSesion();
  actual.paginas += 1;
  encolar({
    tipo: "page_view",
    ruta: normalizarRuta(url ?? location.pathname),
    clientAt: Date.now(),
  });
}

export function trackAction(actionId: string, opciones?: { clave?: boolean }) {
  const actual = obtenerSesion();
  actual.acciones += 1;
  if (opciones?.clave) actual.accionesClave += 1;
  rastroAcciones.push(actionId);
  if (rastroAcciones.length > MAX_RASTRO) rastroAcciones.shift();
  encolar({
    tipo: "action",
    actionId,
    accionClave: opciones?.clave ?? false,
    ruta: normalizarRuta(location.pathname),
    clientAt: Date.now(),
  });
}

/** Resultado de un formulario/flujo identificado por `actionId`. */
export function trackFormResult(actionId: string, ok: boolean) {
  encolar({
    tipo: ok ? "form_success" : "form_error",
    actionId,
    ruta: normalizarRuta(location.pathname),
    clientAt: Date.now(),
  });
}

/** Rastro reciente de acciones semánticas, adjunto a reportes de error. */
export function rastroReciente(): readonly string[] {
  return rastroAcciones;
}

export function sidActual(): string | null {
  return sesion?.sid ?? null;
}

// ── Web Vitals (PerformanceObserver, sin dependencias) ──────────────────────

function enviarMetrica(metrica: string, valor: number) {
  encolar({
    tipo: "performance",
    metrica,
    valor: Math.round(valor * 1000) / 1000,
    ruta: normalizarRuta(location.pathname),
    clientAt: Date.now(),
  });
}

/**
 * Métrica puntual de interacción (p. ej. latencia de navegación cliente). La
 * ruta se normaliza antes de encolar; nunca persistir query ni identificadores.
 */
export function trackPerformance(metrica: string, valor: number, ruta?: string) {
  encolar({
    tipo: "performance",
    metrica,
    valor: Math.round(valor * 1000) / 1000,
    ruta: normalizarRuta(ruta ?? location.pathname),
    clientAt: Date.now(),
  });
}

function iniciarVitals() {
  try {
    // TTFB + FCP desde las entradas de navegación/paint ya disponibles.
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (nav) enviarMetrica("ttfb", nav.responseStart);
    for (const paint of performance.getEntriesByType("paint")) {
      if (paint.name === "first-contentful-paint") enviarMetrica("fcp", paint.startTime);
    }

    // LCP: el último candidato antes de ocultarse/cerrar es el valor real.
    let lcp = 0;
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const ultimo = entries[entries.length - 1];
      if (ultimo) lcp = ultimo.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    const enviarLcp = () => {
      if (lcp > 0) {
        enviarMetrica("lcp", lcp);
        lcp = 0;
      }
    };

    // CLS acumulado de la ventana actual.
    let cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        if (!shift.hadRecentInput) cls += shift.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
    const enviarCls = () => {
      if (cls > 0) {
        enviarMetrica("cls", cls);
        cls = 0;
      }
    };

    // INP aproximado: mayor duración de evento observada.
    let inp = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > inp) inp = entry.duration;
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit);
    const enviarInp = () => {
      if (inp > 0) {
        enviarMetrica("inp", inp);
        inp = 0;
      }
    };

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden") {
          enviarLcp();
          enviarCls();
          enviarInp();
        }
      },
      { passive: true },
    );
  } catch {
    // Navegadores sin PerformanceObserver para estos tipos: omitir vitals.
  }
}

// ── Inicialización ──────────────────────────────────────────────────────────

function alCambiarVisibilidad() {
  const actual = obtenerSesion();
  if (document.visibilityState === "hidden") {
    if (actual.ultimaVisibilidadAt > 0) {
      actual.tiempoActivoMs += Date.now() - actual.ultimaVisibilidadAt;
      actual.ultimaVisibilidadAt = 0;
    }
    flushTelemetria(true);
  } else {
    actual.ultimaVisibilidadAt = Date.now();
    try {
      sessionStorage.setItem(SID_TS_KEY, String(Date.now()));
    } catch {
      // Ignorar.
    }
  }
}

function alClick(evento: MouseEvent) {
  const objetivo = (evento.target as HTMLElement | null)?.closest?.(
    "[data-action-id]",
  ) as HTMLElement | null;
  const actionId = objetivo?.dataset.actionId;
  if (!actionId) return;
  trackAction(actionId, { clave: objetivo?.dataset.actionClave === "1" });
}

function alEnviar(evento: SubmitEvent) {
  const form = evento.target as HTMLFormElement | null;
  const actionId = form?.dataset.actionId;
  if (actionId) trackAction(`${actionId}.submit`);
}

/**
 * Arranca el colector: página inicial, clicks delegados, visibilidad,
 * flush periódico y Web Vitals. Idempotente.
 */
export function iniciarTelemetria() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;

  trackPageView();
  document.addEventListener("click", alClick, { capture: true, passive: true });
  document.addEventListener("submit", alEnviar, { capture: true, passive: true });
  document.addEventListener("visibilitychange", alCambiarVisibilidad, {
    passive: true,
  });
  window.addEventListener("pagehide", () => flushTelemetria(true));
  window.setInterval(() => flushTelemetria(), FLUSH_MS);
  iniciarVitals();
}
