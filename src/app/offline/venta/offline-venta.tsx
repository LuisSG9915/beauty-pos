"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";

import {
  encolarVentaOffline,
  leerUltimoCatalogoOffline,
  listarVentasOffline,
  offlineDbDisponible,
  type LineaOffline,
  type OfflineCatalogo,
  type PagoOffline,
  type VentaOffline,
} from "@/modules/offline/idb";
import { drenarColaOffline } from "@/modules/offline/sync-client";
import { totalVentaOffline, validarPagosOffline } from "@/modules/offline/venta-offline";

type LineaTicket = LineaOffline & { tipo: "servicio" | "producto" };

type ResumenVentaImprimible = {
  folio: string;
  fecha: string;
  items: Array<{ nombre: string; cantidad: number; precio: number; subtotal: number }>;
  total: number;
  pagos: Array<{ medioNombre: string; monto: number; referencia: string | null }>;
  recibido: number;
  cambio: number;
  sucursalNombre: string;
  nota: string | null;
};

const BILLETES_RAPIDOS = [50, 100, 200, 500, 1000];

function formatMonto(monto: number, moneda: string) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).format(monto);
  } catch {
    return `$${monto.toFixed(2)}`;
  }
}

/**
 * Ticket de emergencia: arma una venta con el catálogo cacheado en IndexedDB
 * y la encola. Permite búsqueda instantánea de servicios/productos, cálculo
 * de cambio con billetes rápidos e impresión de comprobante provisional para el cliente.
 */
export function OfflineVenta() {
  const [catalogo, setCatalogo] = useState<OfflineCatalogo | null>(null);
  const [cargado, setCargado] = useState(false);
  const [lineas, setLineas] = useState<LineaTicket[]>([]);
  const [pagos, setPagos] = useState<PagoOffline[]>([{ medioPagoId: "", monto: "", referencia: null }]);
  const [nota, setNota] = useState("");
  const [pendientes, setPendientes] = useState<VentaOffline[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enLinea, setEnLinea] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [tabCatalogo, setTabCatalogo] = useState<"todos" | "servicios" | "productos">("todos");
  const [ultimaVenta, setUltimaVenta] = useState<ResumenVentaImprimible | null>(null);
  const busy = useRef(false);

  const moneda = catalogo?.moneda ?? "MXN";
  const total = totalVentaOffline(lineas);

  const refrescar = useCallback(async () => {
    setPendientes(await listarVentasOffline().catch(() => []));
  }, []);

  const sincronizar = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSincronizando(true);
    try {
      const fallas = await drenarColaOffline();
      setErrores(fallas);
      setEnLinea(!Object.values(fallas).includes("Sin conexión con el servidor."));
      await refrescar();
      if (Object.keys(fallas).length === 0) setMensaje("Ventas sincronizadas con el servidor central.");
    } finally {
      busy.current = false;
      setSincronizando(false);
    }
  }, [refrescar]);

  useEffect(() => {
    const inicial = setTimeout(() => {
      setEnLinea(navigator.onLine);
      void (async () => {
        if (offlineDbDisponible()) {
          const cat = await leerUltimoCatalogoOffline().catch(() => null);
          setCatalogo(cat);
          if (cat && cat.mediosPago.length > 0) {
            const efectivo = cat.mediosPago.find((m) => m.categoria === "efectivo") || cat.mediosPago[0];
            setPagos([{ medioPagoId: efectivo.id, monto: "", referencia: null }]);
          }
          await refrescar();
        }
        setCargado(true);
        if (navigator.onLine) void sincronizar();
      })();
    }, 0);
    const onOnline = () => {
      setEnLinea(true);
      void sincronizar();
    };
    const onOffline = () => setEnLinea(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearTimeout(inicial);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refrescar, sincronizar]);

  function agregarLinea(tipo: "servicio" | "producto", item: { id: string; nombre: string; precio: string }) {
    setMensaje(null);
    setLineas((prev) => {
      const idx = prev.findIndex((l) => l.tipo === tipo && l.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + 1 };
        return next;
      }
      return [...prev, { tipo, id: item.id, usuarioId: null, nombre: item.nombre, precio: item.precio, cantidad: 1 }];
    });
  }

  function cambiarCantidad(idx: number, delta: number) {
    setLineas((prev) =>
      prev
        .map((l, i) => (i === idx ? { ...l, cantidad: l.cantidad + delta } : l))
        .filter((l) => l.cantidad > 0)
    );
  }

  const esEfectivo = (medioPagoId: string) => catalogo?.mediosPago.find((m) => m.id === medioPagoId)?.categoria === "efectivo";
  const recibido = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const cambio = Math.max(recibido - total, 0);

  function fijarMontoPagoRapido(montoSugerido: number) {
    setPagos((prev) => {
      if (prev.length === 0) {
        const ef = catalogo?.mediosPago.find((m) => m.categoria === "efectivo")?.id ?? "";
        return [{ medioPagoId: ef, monto: montoSugerido.toFixed(2), referencia: null }];
      }
      return prev.map((p, idx) => (idx === 0 ? { ...p, monto: montoSugerido.toFixed(2) } : p));
    });
  }

  function registrar() {
    if (!catalogo) return;
    const error = validarPagosOffline(
      pagos
        .filter((p) => p.medioPagoId && Number(p.monto) > 0)
        .map((p) => ({ monto: p.monto, esEfectivo: catalogo.mediosPago.find((m) => m.id === p.medioPagoId)?.categoria === "efectivo" })),
      total,
    );
    if (lineas.length === 0) return setMensaje("Agrega al menos un servicio o producto al ticket.");
    if (error) return setMensaje(error);
    const pagosListos = pagos.filter((p) => p.medioPagoId && Number(p.monto) > 0);
    for (const pago of pagosListos) {
      const medio = catalogo.mediosPago.find((m) => m.id === pago.medioPagoId);
      if (medio && medio.categoria !== "efectivo" && !pago.referencia?.trim()) {
        return setMensaje(`El medio "${medio.nombre}" requiere clave o número de autorización.`);
      }
    }

    const claveVenta = crypto.randomUUID();
    const cobradaAt = new Date().toISOString();

    const venta: VentaOffline = {
      clave: claveVenta,
      organizacionId: catalogo.organizacionId,
      sucursalId: catalogo.sucursalId,
      cobradaAt,
      notas: nota.trim() || null,
      servicios: lineas
        .filter((l) => l.tipo === "servicio")
        .map((l) => ({ id: l.id, usuarioId: l.usuarioId, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
      productos: lineas
        .filter((l) => l.tipo === "producto")
        .map((l) => ({ id: l.id, usuarioId: l.usuarioId, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
      pagos: pagosListos.map((p) => ({ medioPagoId: p.medioPagoId, monto: Number(p.monto).toFixed(2), referencia: p.referencia?.trim() || null })),
    };

    const resumenImpresion: ResumenVentaImprimible = {
      folio: `OFF-${claveVenta.slice(0, 8).toUpperCase()}`,
      fecha: new Date(cobradaAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }),
      items: lineas.map((l) => ({
        nombre: l.nombre,
        cantidad: l.cantidad,
        precio: Number(l.precio),
        subtotal: Number(l.precio) * l.cantidad,
      })),
      total,
      pagos: pagosListos.map((p) => ({
        medioNombre: catalogo.mediosPago.find((m) => m.id === p.medioPagoId)?.nombre ?? "Pago",
        monto: Number(p.monto),
        referencia: p.referencia?.trim() || null,
      })),
      recibido,
      cambio,
      sucursalNombre: catalogo.sucursalNombre || "Melena Salón",
      nota: nota.trim() || null,
    };

    void encolarVentaOffline(venta)
      .then(refrescar)
      .then(() => {
        setUltimaVenta(resumenImpresion);
        setLineas([]);
        const efectivo = catalogo.mediosPago.find((m) => m.categoria === "efectivo") || catalogo.mediosPago[0];
        setPagos([{ medioPagoId: efectivo?.id ?? "", monto: "", referencia: null }]);
        setNota("");
        setMensaje("✓ Venta guardada con éxito en este dispositivo.");
        if (navigator.onLine) void sincronizar();
      })
      .catch(() => setMensaje("No se pudo guardar la venta en este dispositivo."));
  }

  // Filtrado de servicios y productos por texto de búsqueda
  const term = busqueda.trim().toLowerCase();
  const serviciosFiltrados = (catalogo?.servicios ?? []).filter(
    (s) => !term || s.nombre.toLowerCase().includes(term)
  );
  const productosFiltrados = (catalogo?.productos ?? []).filter(
    (p) => !term || p.nombre.toLowerCase().includes(term)
  );

  return (
    <div className="min-h-dvh bg-background px-4 py-6 text-foreground print:bg-white print:p-0">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #ticket-imprimible, #ticket-imprimible * {
            visibility: visible;
          }
          #ticket-imprimible {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 16px;
            color: black !important;
            background: white !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-4xl space-y-6 print:hidden">
        {/* Encabezado */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <Link
              className="inline-flex size-9 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
              href="/admin/pos"
              title="Volver al punto de venta normal"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">Venta Offline de Emergencia</h1>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    enLinea ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                  }`}
                >
                  {enLinea ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                  {enLinea ? "En línea" : "Modo offline"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {catalogo
                  ? `${catalogo.sucursalNombre || "Sucursal"} · Catálogo local actualizado`
                  : "Cargando catálogo guardado…"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
              disabled={sincronizando || !enLinea || pendientes.length === 0}
              onClick={() => void sincronizar()}
              type="button"
            >
              <RotateCcw className={`size-3.5 ${sincronizando ? "animate-spin" : ""}`} />
              {sincronizando ? "Sincronizando…" : `Sincronizar (${pendientes.length})`}
            </button>
          </div>
        </header>

        {/* Modal/Banner de venta recién registrada con comprobante */}
        {ultimaVenta ? (
          <div className="rounded-2xl border border-success/30 bg-success-soft/20 p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" />
                <h2 className="text-base font-semibold text-foreground">
                  Venta registrada con éxito ({ultimaVenta.folio})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="inline-flex items-center gap-1.5 rounded-xl bg-foreground text-background px-3 py-1.5 text-xs font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer"
                  onClick={() => window.print()}
                  type="button"
                >
                  <Printer className="size-3.5" />
                  Imprimir ticket provisional
                </button>
                <button
                  className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setUltimaVenta(null)}
                  type="button"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 text-xs font-mono max-w-sm mx-auto shadow-xs">
              <div className="text-center pb-2 border-b border-dashed border-border">
                <p className="font-bold text-sm">{ultimaVenta.sucursalNombre}</p>
                <p className="text-[11px] text-muted-foreground">Comprobante de contingencia</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{ultimaVenta.fecha} · Folio {ultimaVenta.folio}</p>
              </div>

              <div className="py-2.5 space-y-1 border-b border-dashed border-border">
                {ultimaVenta.items.map((it, idx) => (
                  <div className="flex justify-between" key={idx}>
                    <span>{it.cantidad}x {it.nombre}</span>
                    <span>${it.subtotal.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="py-2 space-y-1">
                <div className="flex justify-between font-bold text-sm">
                  <span>TOTAL:</span>
                  <span>${ultimaVenta.total.toFixed(2)}</span>
                </div>
                {ultimaVenta.pagos.map((p, idx) => (
                  <div className="flex justify-between text-[11px] text-muted-foreground" key={idx}>
                    <span>{p.medioNombre}:</span>
                    <span>${p.monto.toFixed(2)}</span>
                  </div>
                ))}
                {ultimaVenta.cambio > 0 ? (
                  <div className="flex justify-between text-success font-semibold text-[11px]">
                    <span>Cambio entregado:</span>
                    <span>${ultimaVenta.cambio.toFixed(2)}</span>
                  </div>
                ) : null}
              </div>

              <p className="text-center text-[10px] text-muted-foreground pt-2 border-t border-dashed border-border">
                Venta almacenada localmente. Se timbrará al restablecer la conexión.
              </p>
            </div>
          </div>
        ) : null}

        {!cargado ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Cargando base de datos local del navegador…
          </div>
        ) : null}

        {cargado && !catalogo ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive-soft/20 p-6 text-sm">
            <h2 className="text-base font-semibold text-destructive">No hay catálogo precargado en este dispositivo</h2>
            <p className="mt-1 text-muted-foreground">
              Para operar sin conexión, el navegador necesita haber visitado el punto de venta en línea al menos una vez hoy.
            </p>
            <div className="mt-4">
              <Link
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90"
                href="/admin/pos"
              >
                Abrir Punto de Venta en línea
              </Link>
            </div>
          </div>
        ) : null}

        {catalogo ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Columna Izquierda: Catálogo con buscador instantáneo */}
            <div className="lg:col-span-7 space-y-4">
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShoppingBag className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold text-foreground">Catálogo disponible</h2>
                  </div>
                  <div className="flex rounded-lg bg-muted p-0.5 text-xs font-medium">
                    <button
                      className={`rounded-md px-2.5 py-1 transition-colors ${
                        tabCatalogo === "todos" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setTabCatalogo("todos")}
                      type="button"
                    >
                      Todos
                    </button>
                    <button
                      className={`rounded-md px-2.5 py-1 transition-colors ${
                        tabCatalogo === "servicios" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setTabCatalogo("servicios")}
                      type="button"
                    >
                      Servicios ({catalogo.servicios.length})
                    </button>
                    <button
                      className={`rounded-md px-2.5 py-1 transition-colors ${
                        tabCatalogo === "productos" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setTabCatalogo("productos")}
                      type="button"
                    >
                      Productos ({catalogo.productos.length})
                    </button>
                  </div>
                </div>

                {/* Buscador */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input
                    aria-label="Buscar en el catálogo"
                    className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar servicio o producto por nombre…"
                    type="search"
                    value={busqueda}
                  />
                </div>

                {/* Lista de Servicios */}
                {(tabCatalogo === "todos" || tabCatalogo === "servicios") && serviciosFiltrados.length > 0 ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Servicios ({serviciosFiltrados.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {serviciosFiltrados.map((s) => (
                        <button
                          className="flex flex-col items-start justify-between rounded-xl border border-border bg-background p-2.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
                          key={s.id}
                          onClick={() => agregarLinea("servicio", s)}
                          type="button"
                        >
                          <span className="font-semibold text-foreground line-clamp-1">{s.nombre}</span>
                          <span className="mt-1 font-bold text-primary tabular-nums">
                            {formatMonto(Number(s.precio), moneda)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Lista de Productos */}
                {(tabCatalogo === "todos" || tabCatalogo === "productos") && productosFiltrados.length > 0 ? (
                  <div className="pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Productos de reventa ({productosFiltrados.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {productosFiltrados.map((p) => (
                        <button
                          className="flex flex-col items-start justify-between rounded-xl border border-border bg-background p-2.5 text-left text-xs transition-colors hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
                          key={p.id}
                          onClick={() => agregarLinea("producto", p)}
                          type="button"
                        >
                          <span className="font-semibold text-foreground line-clamp-1">{p.nombre}</span>
                          <span className="mt-1 font-bold text-primary tabular-nums">
                            {formatMonto(Number(p.precio), moneda)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {serviciosFiltrados.length === 0 && productosFiltrados.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    No encontramos ningún servicio o producto que coincida con &quot;{busqueda}&quot;.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Columna Derecha: Ticket, Pagos y Calculadora de Cambio */}
            <div className="lg:col-span-5 space-y-4">
              {/* Ticket actual */}
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Ticket actual</h2>
                  {lineas.length > 0 ? (
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      onClick={() => setLineas([])}
                      type="button"
                    >
                      Vaciar ticket
                    </button>
                  ) : null}
                </div>

                {lineas.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                    Toca servicios o productos a la izquierda para agregarlos al cobro.
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60 max-h-60 overflow-y-auto pr-1">
                    {lineas.map((linea, idx) => (
                      <li className="py-2.5 flex flex-col gap-1.5" key={`${linea.tipo}-${linea.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground flex-1 min-w-0 truncate">
                            {linea.nombre}
                          </span>
                          <span className="text-xs font-bold text-foreground tabular-nums shrink-0">
                            {formatMonto(Number(linea.precio) * linea.cantidad, moneda)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          {linea.tipo === "servicio" && catalogo.staff.length > 0 ? (
                            <select
                              aria-label="Profesional asignado"
                              className="rounded-md border border-input bg-background px-2 py-0.5 text-[11px] text-muted-foreground max-w-36"
                              onChange={(e) =>
                                setLineas((prev) =>
                                  prev.map((l, i) => (i === idx ? { ...l, usuarioId: e.target.value || null } : l))
                                )
                              }
                              value={linea.usuarioId ?? ""}
                            >
                              <option value="">Cualquier especialista</option>
                              {catalogo.staff.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nombre}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              {linea.tipo === "producto" ? "Producto" : "Servicio"}
                            </span>
                          )}

                          <div className="flex items-center gap-1.5">
                            <button
                              aria-label="Restar uno"
                              className="inline-flex size-6 items-center justify-center rounded-md border border-input bg-background text-xs hover:bg-muted"
                              onClick={() => cambiarCantidad(idx, -1)}
                              type="button"
                            >
                              <Minus className="size-3" />
                            </button>
                            <span className="w-5 text-center text-xs font-semibold tabular-nums">{linea.cantidad}</span>
                            <button
                              aria-label="Sumar uno"
                              className="inline-flex size-6 items-center justify-center rounded-md border border-input bg-background text-xs hover:bg-muted"
                              onClick={() => cambiarCantidad(idx, 1)}
                              type="button"
                            >
                              <Plus className="size-3" />
                            </button>
                            <button
                              aria-label="Eliminar item"
                              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive ml-1"
                              onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))}
                              type="button"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="border-t border-border pt-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Total a cobrar</span>
                  <span className="text-xl font-bold text-primary tabular-nums">
                    {formatMonto(total, moneda)}
                  </span>
                </div>
              </div>

              {/* Pagos y Calculadora de Cambio */}
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Banknote className="size-4 text-success" />
                    <h2 className="text-sm font-semibold text-foreground">Pago y cambio</h2>
                  </div>
                  {total > 0 ? (
                    <button
                      className="text-xs font-medium text-primary hover:underline cursor-pointer"
                      onClick={() => fijarMontoPagoRapido(total)}
                      type="button"
                    >
                      Pagar exacto (${total.toFixed(2)})
                    </button>
                  ) : null}
                </div>

                {/* Botones de billetes rápidos si es efectivo */}
                {total > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">Pago rápido con billete:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {BILLETES_RAPIDOS.map((montoBillete) => (
                        <button
                          className={`rounded-lg border px-2 py-1 text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                            recibido === montoBillete
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background hover:bg-muted"
                          }`}
                          key={montoBillete}
                          onClick={() => fijarMontoPagoRapido(montoBillete)}
                          type="button"
                        >
                          ${montoBillete}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Lista de pagos */}
                <div className="space-y-2 pt-1">
                  {pagos.map((pago, idx) => (
                    <div className="space-y-1.5 rounded-xl border border-border/70 p-2.5 bg-muted/20" key={idx}>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label="Medio de pago"
                          className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs font-medium"
                          onChange={(e) =>
                            setPagos((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, medioPagoId: e.target.value } : p))
                            )
                          }
                          value={pago.medioPagoId}
                        >
                          <option value="">Selecciona medio de pago…</option>
                          {catalogo.mediosPago.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre}
                            </option>
                          ))}
                        </select>
                        <div className="relative w-28">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">
                            $
                          </span>
                          <input
                            aria-label="Monto pagado"
                            className="w-full rounded-lg border border-input bg-background pl-6 pr-2 py-1.5 text-right text-xs font-semibold tabular-nums"
                            inputMode="decimal"
                            onChange={(e) =>
                              setPagos((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, monto: e.target.value } : p))
                              )
                            }
                            placeholder="0.00"
                            value={pago.monto}
                          />
                        </div>
                        {pagos.length > 1 ? (
                          <button
                            aria-label="Quitar pago"
                            className="text-xs text-destructive hover:underline"
                            onClick={() => setPagos((prev) => prev.filter((_, i) => i !== idx))}
                            type="button"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>

                      {pago.medioPagoId && !esEfectivo(pago.medioPagoId) ? (
                        <input
                          aria-label="Referencia o número de voucher"
                          className="w-full rounded-lg border border-input bg-background px-2.5 py-1 text-xs"
                          onChange={(e) =>
                            setPagos((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, referencia: e.target.value } : p))
                            )
                          }
                          placeholder="Referencia de voucher / terminal…"
                          value={pago.referencia ?? ""}
                        />
                      ) : null}
                    </div>
                  ))}

                  {pagos.length < 3 ? (
                    <button
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => setPagos((prev) => [...prev, { medioPagoId: "", monto: "", referencia: null }])}
                      type="button"
                    >
                      + Combinar con otro medio de pago
                    </button>
                  ) : null}
                </div>

                {/* Resumen de cambio */}
                {recibido > 0 && total > 0 ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-2.5 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total recibido:</span>
                      <span className="font-semibold tabular-nums">{formatMonto(recibido, moneda)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold">
                      <span className={cambio > 0 ? "text-success" : "text-foreground"}>
                        {cambio > 0 ? "Cambio a devolver:" : "Restante por cubrir:"}
                      </span>
                      <span className={cambio > 0 ? "text-success tabular-nums" : "text-destructive tabular-nums"}>
                        {cambio > 0 ? formatMonto(cambio, moneda) : formatMonto(total - recibido, moneda)}
                      </span>
                    </div>
                  </div>
                ) : null}

                <input
                  aria-label="Nota de la venta"
                  className="w-full rounded-xl border border-input bg-background px-3 py-1.5 text-xs"
                  maxLength={500}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Nota u observación de la venta (opcional)"
                  value={nota}
                />

                <button
                  className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
                  disabled={lineas.length === 0}
                  onClick={registrar}
                  type="button"
                >
                  Registrar cobro{enLinea ? "" : " (offline)"}
                </button>

                {mensaje ? (
                  <p className="text-xs font-medium text-center text-primary">{mensaje}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {/* Sección de cola pendiente de sincronización */}
        <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Cola de ventas en espera ({pendientes.length})
              </h2>
              <p className="text-xs text-muted-foreground">
                Se guardan en IndexedDB local y se transmiten al servidor central cuando hay conexión.
              </p>
            </div>
            <button
              className="rounded-xl border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors disabled:opacity-50 cursor-pointer"
              disabled={sincronizando || !enLinea || pendientes.length === 0}
              onClick={() => void sincronizar()}
              type="button"
            >
              {sincronizando ? "Sincronizando…" : "Sincronizar ahora"}
            </button>
          </div>

          {pendientes.length === 0 ? (
            <p className="text-xs text-muted-foreground italic py-1">
              No hay ventas pendientes por sincronizar en este dispositivo.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {pendientes.map((v) => {
                const tot = totalVentaOffline([...v.servicios, ...v.productos]);
                return (
                  <div className="py-2 flex items-center justify-between text-xs" key={v.clave}>
                    <div>
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatMonto(tot, moneda)}
                      </span>
                      <span className="text-muted-foreground ml-2">
                        {new Date(v.cobradaAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                        {` · ${v.servicios.length + v.productos.length} items`}
                      </span>
                      {errores[v.clave] ? (
                        <p className="text-destructive font-medium mt-0.5">{errores[v.clave]}</p>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-muted-foreground">En cola local</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Contenedor imprimible para comprobante térmico oficial */}
      {ultimaVenta ? (
        <div className="hidden print:block font-mono text-xs text-black" id="ticket-imprimible">
          <div className="text-center pb-3 border-b border-black">
            <h1 className="text-base font-bold uppercase">{ultimaVenta.sucursalNombre}</h1>
            <p className="text-xs">COMPROBANTE DE PAGO PROVISIONAL</p>
            <p className="text-[10px]">OPERACIÓN SIN CONEXIÓN A INTERNET</p>
            <p className="text-xs mt-1">Folio: {ultimaVenta.folio}</p>
            <p className="text-xs">Fecha: {ultimaVenta.fecha}</p>
          </div>

          <div className="py-3 border-b border-black space-y-1">
            <div className="flex justify-between font-bold border-b border-black/30 pb-1">
              <span>CANT / DESCRIPCIÓN</span>
              <span>IMPORTE</span>
            </div>
            {ultimaVenta.items.map((it, idx) => (
              <div className="flex justify-between" key={idx}>
                <span>{it.cantidad}x {it.nombre}</span>
                <span>${it.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className="py-3 border-b border-black space-y-1">
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL PAGADO:</span>
              <span>${ultimaVenta.total.toFixed(2)}</span>
            </div>
            {ultimaVenta.pagos.map((p, idx) => (
              <div className="flex justify-between" key={idx}>
                <span>{p.medioNombre}:</span>
                <span>${p.monto.toFixed(2)}</span>
              </div>
            ))}
            {ultimaVenta.cambio > 0 ? (
              <div className="flex justify-between font-bold">
                <span>CAMBIO:</span>
                <span>${ultimaVenta.cambio.toFixed(2)}</span>
              </div>
            ) : null}
          </div>

          <div className="text-center pt-3 text-[10px] space-y-1">
            <p>¡Gracias por su visita!</p>
            <p>Este ticket ampara su cobro mientras se restablece la conexión.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
