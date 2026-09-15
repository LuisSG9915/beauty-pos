"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function formatMonto(monto: number, moneda: string) {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).format(monto);
  } catch {
    return `$${monto.toFixed(2)}`;
  }
}

/**
 * Ticket de emergencia: arma una venta con el catálogo cacheado en IndexedDB
 * y la encola. La venta NO se da por cobrada — queda "por sincronizar" hasta
 * que `sincronizarVentaOffline` la confirme en el servidor (idempotente por
 * `clave`). Sin cliente, paquetes, membresías, promos ni anticipos offline.
 */
export function OfflineVenta() {
  const [catalogo, setCatalogo] = useState<OfflineCatalogo | null>(null);
  const [cargado, setCargado] = useState(false);
  const [lineas, setLineas] = useState<LineaTicket[]>([]);
  const [pagos, setPagos] = useState<PagoOffline[]>([{ medioPagoId: "", monto: "", referencia: null }]);
  const [nota, setNota] = useState("");
  const [pendientes, setPendientes] = useState<VentaOffline[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});
  // `navigator.onLine` no se lee al montar: en SSR/headless puede diferir del
  // cliente y romper la hidratación. Se corrige tras el primer render y con
  // los eventos online/offline (y tras un drenado exitoso del servidor).
  const [enLinea, setEnLinea] = useState(true);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
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
      // Si el servidor respondió (aunque sea con errores de negocio), hay red.
      setEnLinea(!Object.values(fallas).includes("Sin conexión con el servidor."));
      await refrescar();
      if (Object.keys(fallas).length === 0) setMensaje("Ventas sincronizadas con el servidor.");
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
          setCatalogo(await leerUltimoCatalogoOffline().catch(() => null));
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
    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, cantidad: Math.max(1, l.cantidad + delta) } : l)));
  }

  function registrar() {
    if (!catalogo) return;
    const error = validarPagosOffline(
      pagos
        .filter((p) => p.medioPagoId && Number(p.monto) > 0)
        .map((p) => ({ monto: p.monto, esEfectivo: catalogo.mediosPago.find((m) => m.id === p.medioPagoId)?.categoria === "efectivo" })),
      total,
    );
    if (lineas.length === 0) return setMensaje("Agrega al menos un servicio o producto.");
    if (error) return setMensaje(error);
    const pagosListos = pagos.filter((p) => p.medioPagoId && Number(p.monto) > 0);
    for (const pago of pagosListos) {
      const medio = catalogo.mediosPago.find((m) => m.id === pago.medioPagoId);
      if (medio && medio.categoria !== "efectivo" && !pago.referencia?.trim()) {
        return setMensaje(`El medio "${medio.nombre}" requiere referencia.`);
      }
    }
    const venta: VentaOffline = {
      clave: crypto.randomUUID(),
      organizacionId: catalogo.organizacionId,
      sucursalId: catalogo.sucursalId,
      cobradaAt: new Date().toISOString(),
      notas: nota.trim() || null,
      servicios: lineas
        .filter((l) => l.tipo === "servicio")
        .map((l) => ({ id: l.id, usuarioId: l.usuarioId, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
      productos: lineas
        .filter((l) => l.tipo === "producto")
        .map((l) => ({ id: l.id, usuarioId: l.usuarioId, nombre: l.nombre, precio: l.precio, cantidad: l.cantidad })),
      pagos: pagosListos.map((p) => ({ medioPagoId: p.medioPagoId, monto: Number(p.monto).toFixed(2), referencia: p.referencia?.trim() || null })),
    };
    void encolarVentaOffline(venta)
      .then(refrescar)
      .then(() => {
        setLineas([]);
        setPagos([{ medioPagoId: "", monto: "", referencia: null }]);
        setNota("");
        setMensaje("Venta registrada. Queda por sincronizar — no confirmes el cobro como hecho hasta verla en el sistema.");
        if (navigator.onLine) void sincronizar();
      })
      .catch(() => setMensaje("No se pudo guardar la venta en este dispositivo."));
  }

  const esEfectivo = (medioPagoId: string) => catalogo?.mediosPago.find((m) => m.id === medioPagoId)?.categoria === "efectivo";
  const recibido = pagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const cambio = Math.max(recibido - total, 0);

  return (
    <div className="min-h-dvh bg-[#faf9f7] px-4 py-6 text-[#2d2926]">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Venta sin conexión</h1>
            <p className="text-sm text-[#625b55]">
              {catalogo ? `${catalogo.sucursalNombre || "Sucursal"} · catálogo del ${new Date(catalogo.guardadoAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}` : "Ticket de emergencia"}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${enLinea ? "bg-[#e3efe3] text-[#2f6b3a]" : "bg-[#f6e3d9] text-[#9a4a1f]"}`}>
            {enLinea ? "En línea" : "Sin conexión"}
          </span>
        </header>

        {!cargado ? <p className="text-sm text-[#625b55]">Cargando catálogo guardado…</p> : null}
        {cargado && !catalogo ? (
          <div className="rounded-2xl border border-[#eee8e3] bg-white p-5 text-sm text-[#625b55]">
            <p className="font-medium text-[#2d2926]">No hay catálogo guardado en este dispositivo.</p>
            <p className="mt-1">Abre el punto de venta con conexión al menos una vez para que el catálogo quede disponible sin red.</p>
            <a className="mt-3 inline-block rounded-xl bg-[#8a5140] px-4 py-2 text-sm font-medium text-white" href="/admin/pos">
              Ir al punto de venta
            </a>
          </div>
        ) : null}

        {catalogo ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#eee8e3] bg-white p-4">
                <h2 className="text-sm font-semibold">Servicios</h2>
                <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                  {catalogo.servicios.map((s) => (
                    <button
                      className="rounded-xl border border-[#eee8e3] px-3 py-2 text-left text-xs transition-colors hover:bg-[#f7f2ee]"
                      key={s.id}
                      onClick={() => agregarLinea("servicio", s)}
                      type="button"
                    >
                      <span className="block font-medium">{s.nombre}</span>
                      <span className="text-[#8a817a]">{formatMonto(Number(s.precio), moneda)}</span>
                    </button>
                  ))}
                  {catalogo.servicios.length === 0 ? <p className="text-xs text-[#8a817a]">Sin servicios en el catálogo guardado.</p> : null}
                </div>
              </div>
              <div className="rounded-2xl border border-[#eee8e3] bg-white p-4">
                <h2 className="text-sm font-semibold">Productos</h2>
                <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                  {catalogo.productos.map((p) => (
                    <button
                      className="rounded-xl border border-[#eee8e3] px-3 py-2 text-left text-xs transition-colors hover:bg-[#f7f2ee]"
                      key={p.id}
                      onClick={() => agregarLinea("producto", p)}
                      type="button"
                    >
                      <span className="block font-medium">{p.nombre}</span>
                      <span className="text-[#8a817a]">{formatMonto(Number(p.precio), moneda)}</span>
                    </button>
                  ))}
                  {catalogo.productos.length === 0 ? <p className="text-xs text-[#8a817a]">Sin productos en el catálogo guardado.</p> : null}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#eee8e3] bg-white p-4">
              <h2 className="text-sm font-semibold">Ticket</h2>
              {lineas.length === 0 ? <p className="mt-2 text-sm text-[#8a817a]">Ticket vacío — toca servicios o productos para agregarlos.</p> : null}
              <ul className="mt-2 space-y-2">
                {lineas.map((linea, idx) => (
                  <li className="flex flex-wrap items-center gap-2 rounded-xl bg-[#faf9f7] px-3 py-2 text-sm" key={`${linea.tipo}-${linea.id}`}>
                    <span className="min-w-0 flex-1 truncate font-medium">{linea.nombre}</span>
                    {linea.tipo === "servicio" && catalogo.staff.length > 0 ? (
                      <select
                        aria-label="Profesional"
                        className="rounded-lg border border-[#e5ddd6] bg-white px-2 py-1 text-xs"
                        onChange={(e) => setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, usuarioId: e.target.value || null } : l)))}
                        value={linea.usuarioId ?? ""}
                      >
                        <option value="">Sin profesional</option>
                        {catalogo.staff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.nombre}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <span className="flex items-center gap-1">
                      <button aria-label="Quitar uno" className="size-7 rounded-lg border border-[#e5ddd6] text-sm" onClick={() => cambiarCantidad(idx, -1)} type="button">
                        −
                      </button>
                      <span className="w-6 text-center tabular-nums">{linea.cantidad}</span>
                      <button aria-label="Agregar uno" className="size-7 rounded-lg border border-[#e5ddd6] text-sm" onClick={() => cambiarCantidad(idx, 1)} type="button">
                        +
                      </button>
                    </span>
                    <span className="w-20 text-right tabular-nums">{formatMonto(Number(linea.precio) * linea.cantidad, moneda)}</span>
                    <button aria-label="Quitar línea" className="text-xs text-[#9a4a1f] underline" onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))} type="button">
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-right text-base font-semibold">Total {formatMonto(total, moneda)}</p>
            </section>

            <section className="rounded-2xl border border-[#eee8e3] bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Pagos</h2>
                {pagos.length < 4 ? (
                  <button
                    className="text-xs font-medium text-[#8a5140] underline"
                    onClick={() => setPagos((prev) => [...prev, { medioPagoId: "", monto: "", referencia: null }])}
                    type="button"
                  >
                    Agregar otro pago
                  </button>
                ) : null}
              </div>
              <div className="mt-2 space-y-2">
                {pagos.map((pago, idx) => (
                  <div className="flex flex-wrap items-center gap-2" key={idx}>
                    <select
                      aria-label="Medio de pago"
                      className="min-w-36 flex-1 rounded-xl border border-[#e5ddd6] bg-white px-3 py-2 text-sm"
                      onChange={(e) => setPagos((prev) => prev.map((p, i) => (i === idx ? { ...p, medioPagoId: e.target.value } : p)))}
                      value={pago.medioPagoId}
                    >
                      <option value="">Medio de pago…</option>
                      {catalogo.mediosPago.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Monto"
                      className="w-28 rounded-xl border border-[#e5ddd6] px-3 py-2 text-right text-sm tabular-nums"
                      inputMode="decimal"
                      onChange={(e) => setPagos((prev) => prev.map((p, i) => (i === idx ? { ...p, monto: e.target.value } : p)))}
                      placeholder="0.00"
                      value={pago.monto}
                    />
                    {pago.medioPagoId && !esEfectivo(pago.medioPagoId) ? (
                      <input
                        aria-label="Referencia"
                        className="min-w-32 flex-1 rounded-xl border border-[#e5ddd6] px-3 py-2 text-sm"
                        onChange={(e) => setPagos((prev) => prev.map((p, i) => (i === idx ? { ...p, referencia: e.target.value } : p)))}
                        placeholder="Referencia"
                        value={pago.referencia ?? ""}
                      />
                    ) : null}
                    {pagos.length > 1 ? (
                      <button aria-label="Quitar pago" className="text-xs text-[#9a4a1f] underline" onClick={() => setPagos((prev) => prev.filter((_, i) => i !== idx))} type="button">
                        Quitar
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {cambio > 0 ? <p className="mt-2 text-sm text-[#6d5320]">Cambio a devolver: {formatMonto(cambio, moneda)}</p> : null}
              <input
                aria-label="Nota de la venta"
                className="mt-3 w-full rounded-xl border border-[#e5ddd6] px-3 py-2 text-sm"
                maxLength={500}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Nota de la venta (opcional)"
                value={nota}
              />
              <button
                className="mt-3 w-full rounded-xl bg-[#8a5140] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#74422f] disabled:opacity-50"
                disabled={lineas.length === 0}
                onClick={registrar}
                type="button"
              >
                Registrar venta{enLinea ? "" : " (sin conexión)"}
              </button>
              {mensaje ? <p className="mt-2 text-sm font-medium text-[#8a5140]">{mensaje}</p> : null}
            </section>
          </>
        ) : null}

        <section className="rounded-2xl border border-[#eee8e3] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Por sincronizar ({pendientes.length})</h2>
            <button
              className="rounded-xl border border-[#8a5140] px-3 py-1.5 text-xs font-semibold text-[#8a5140] disabled:opacity-50"
              disabled={sincronizando || !enLinea || pendientes.length === 0}
              onClick={() => void sincronizar()}
              type="button"
            >
              {sincronizando ? "Sincronizando…" : "Sincronizar"}
            </button>
          </div>
          {pendientes.length === 0 ? <p className="mt-2 text-sm text-[#8a817a]">Sin ventas pendientes.</p> : null}
          <ul className="mt-2 space-y-1.5">
            {pendientes.map((v) => (
              <li className="rounded-xl bg-[#faf9f7] px-3 py-2 text-sm" key={v.clave}>
                <span className="font-medium tabular-nums">{formatMonto(totalVentaOffline([...v.servicios, ...v.productos]), moneda)}</span>
                <span className="text-[#8a817a]"> · {new Date(v.cobradaAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
                {errores[v.clave] ? <p className="mt-1 text-xs font-medium text-[#9a4a1f]">{errores[v.clave]}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
