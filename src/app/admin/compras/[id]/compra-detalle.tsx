/* eslint-disable @next/next/no-img-element -- El ticket se sirve desde
   /api/medios con sesión del usuario; next/image no reenvía cookies. */
"use client";

import {
  CircleAlert,
  Loader2,
  PackagePlus,
  ScanText,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  cancelarCompra,
  guardarDatosCompra,
  guardarLineaCompra,
  quitarLineaCompra,
  recibirCompra,
  resolverObservacion,
} from "@/app/admin/compras/actions";
import { ProductForm } from "@/app/admin/productos/product-form";
import { AdminCard } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel, Input, Textarea } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import type { CompraEstado } from "@/db/schema/compras";
import { formatCurrency, formatDate, formatQuantity } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import { cn } from "@/lib/utils";
import {
  COMPRA_ESTADO_INFO,
  COMPRA_ESTADOS_EDITABLES,
  emparejarLineaProducto,
  type ProductoCatalogo,
} from "@/modules/compras";

type ProveedorOpcion = { id: string; nombre: string };
type Opcion = { id: string; nombre: string };

export type CompraLineaVista = {
  id: string;
  productoId: string | null;
  productoNombre: string | null;
  descripcion: string;
  cantidad: string;
  cantidadRecibida: string | null;
  costoUnitario: string;
  importe: string;
  observacion: string | null;
  origen: string;
};

export type CompraVista = {
  id: string;
  sucursalId: string;
  estado: CompraEstado;
  proveedorId: string | null;
  proveedorNombre: string | null;
  proveedorTexto: string | null;
  folio: string | null;
  fechaCompra: string | null;
  totalTicket: string | null;
  totalCalculado: string;
  medioUrl: string | null;
  analisisError: string | null;
  observaciones: string | null;
  actualizarCostos: boolean;
  recibidaPorNombre: string | null;
  recibidaAt: string | null;
  creadaAt: string;
  dudas: string[];
};

/** Borrador editable de una línea; `id: null` = todavía no persistida. */
type LineaDraft = {
  key: string;
  id: string | null;
  descripcion: string;
  productoId: string | null;
  cantidad: string;
  costo: string;
  importe: string;
  observacion: string;
  /** Cantidad recibida ya persistida (null = aún no se recibe la compra). */
  recibidaOriginal: string | null;
  /** Valor editable de la columna "Recibido" en la recepción. */
  recibida: string;
};

function aDraft(linea: CompraLineaVista): LineaDraft {
  return {
    key: linea.id,
    id: linea.id,
    descripcion: linea.descripcion,
    productoId: linea.productoId,
    cantidad: linea.cantidad,
    costo: linea.costoUnitario,
    importe: linea.importe,
    observacion: linea.observacion ?? "",
    recibidaOriginal: linea.cantidadRecibida,
    // Recepción: default = cantidad pedida (o lo ya capturado en otro intento).
    recibida: linea.cantidadRecibida ?? linea.cantidad,
  };
}

const aNumero = (texto: string) => {
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
};

const redondear2 = (valor: number) => Math.round(valor * 100) / 100;

/**
 * Detalle operativo de la compra (plan 10): foto del ticket con zoom a la
 * izquierda en escritorio (colapsable en móvil) y, a la derecha, datos del
 * documento, líneas editables con sugerencias de emparejamiento, el alta
 * rápida de producto (plan 03) en sheet y la recepción que da entrada al
 * inventario una sola vez.
 */
export function CompraDetalle({
  compra,
  lineas: lineasIniciales,
  productos: productosIniciales,
  proveedores,
  categories,
  units,
  organizacionId,
  sucursalId,
  puedeEditar,
  puedeRecibir,
  puedeCrearProducto,
  capturaIa,
  autoAnalizar,
  currency,
}: {
  compra: CompraVista;
  lineas: CompraLineaVista[];
  productos: ProductoCatalogo[];
  proveedores: ProveedorOpcion[];
  categories: Opcion[];
  units: Opcion[];
  organizacionId: string;
  sucursalId: string;
  puedeEditar: boolean;
  puedeRecibir: boolean;
  /** `catalogos.editar` — habilita el "Crear producto" del alta rápida. */
  puedeCrearProducto: boolean;
  /** Hay binding de Workers AI (se pasa también al alta rápida de producto). */
  capturaIa: boolean;
  /** `?analizar=1` llegó desde la captura: dispara la lectura al montar. */
  autoAnalizar: boolean;
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const editable = COMPRA_ESTADOS_EDITABLES.includes(compra.estado) && puedeEditar;
  const recibible = compra.estado === "por_verificar" && puedeRecibir;
  const info = COMPRA_ESTADO_INFO[compra.estado];

  // ── Líneas ───────────────────────────────────────────────────────────────
  const [lineas, setLineas] = useState<LineaDraft[]>(() => lineasIniciales.map(aDraft));
  // Re-sincroniza cuando el servidor devuelve líneas distintas (post-mutación):
  // ajuste de estado durante el render (patrón oficial de React para
  // "resetear estado al cambiar una prop"), no en un effect.
  const lineasKey = JSON.stringify(lineasIniciales);
  const [lineasKeyPrev, setLineasKeyPrev] = useState(lineasKey);
  if (lineasKey !== lineasKeyPrev) {
    setLineasKeyPrev(lineasKey);
    setLineas(lineasIniciales.map(aDraft));
  }

  // ── Lectura del ticket con IA ────────────────────────────────────────────
  const [leyendo, setLeyendo] = useState(false);
  const [modoAsistido, setModoAsistido] = useState(
    Boolean(
      compra.analisisError ||
        (compra.medioUrl && lineasIniciales.length === 0 && compra.estado === "borrador"),
    ),
  );
  const activoAsistido = modoAsistido || Boolean(compra.analisisError);
  const lanzadoRef = useRef(false);
  const primeraFilaRef = useRef<HTMLInputElement>(null);

  const analizar = async () => {
    setLeyendo(true);
    try {
      const response = await fetch(`/api/compras/${compra.id}/analizar`, { method: "POST" });
      const resultado = (await response.json().catch(() => ({}))) as { error?: string };
      if (response.ok) {
        toast.success("Ticket leído. Revisa las líneas antes de recibir.");
      } else {
        setModoAsistido(true);
        setLineas((actuales) => {
          if (actuales.length === 0) {
            return [
              {
                key: crypto.randomUUID(),
                id: null,
                descripcion: "",
                productoId: null,
                cantidad: "1",
                costo: "",
                importe: "",
                observacion: "",
                recibidaOriginal: null,
                recibida: "1",
              },
            ];
          }
          return actuales;
        });
        toast.error(resultado.error ?? "No pudimos leer el ticket.");
      }
    } catch {
      setModoAsistido(true);
      setLineas((actuales) => {
        if (actuales.length === 0) {
          return [
            {
              key: crypto.randomUUID(),
              id: null,
              descripcion: "",
              productoId: null,
              cantidad: "1",
              costo: "",
              importe: "",
              observacion: "",
              recibidaOriginal: null,
              recibida: "1",
            },
          ];
        }
        return actuales;
      });
      toast.error("No pudimos leer el ticket. Intenta de nuevo.");
    } finally {
      setLeyendo(false);
      router.refresh();
    }
  };
  useEffect(() => {
    if (autoAnalizar && !lanzadoRef.current) {
      lanzadoRef.current = true;
      void analizar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar.
  }, []);

  // ── Datos generales ──────────────────────────────────────────────────────
  const [proveedorId, setProveedorId] = useState(compra.proveedorId);
  const [proveedorNuevo, setProveedorNuevo] = useState("");
  const [folio, setFolio] = useState(compra.folio ?? "");
  const [fechaCompra, setFechaCompra] = useState(compra.fechaCompra ?? "");
  const [observaciones, setObservaciones] = useState(compra.observaciones ?? "");

  const guardarDatos = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("organizacionId", organizacionId);
      data.set("compraId", compra.id);
      data.set("proveedorId", proveedorId ?? "");
      data.set("proveedorNuevo", proveedorNuevo);
      data.set("folio", folio);
      data.set("fechaCompra", fechaCompra);
      data.set("observaciones", observaciones);
      const state = await guardarDatosCompra(data);
      if (state.success) {
        setProveedorNuevo("");
        toast.success(state.message ?? "Datos guardados.");
        router.refresh();
      } else {
        toast.error(state.error ?? "No se pudieron guardar los datos.");
      }
    });
  };

  useEffect(() => {
    if (activoAsistido) {
      primeraFilaRef.current?.focus();
    }
  }, [activoAsistido, lineas.length]);

  // El catálogo crece cuando se crea un producto desde el alta rápida y se
  // re-sincroniza igual que las líneas tras `router.refresh()`.
  const [productos, setProductos] = useState<ProductoCatalogo[]>(productosIniciales);
  const productosKey = JSON.stringify(productosIniciales);
  const [productosKeyPrev, setProductosKeyPrev] = useState(productosKey);
  if (productosKey !== productosKeyPrev) {
    setProductosKeyPrev(productosKey);
    setProductos(productosIniciales);
  }

  const itemsBase = useMemo(
    () =>
      productos.map((producto) => ({
        value: producto.id,
        label: producto.sku ? `${producto.sku} · ${producto.nombre}` : producto.nombre,
        keywords: [producto.nombre, producto.sku ?? "", producto.codigoBarras ?? ""],
      })),
    [productos],
  );

  /** Candidatos del emparejamiento arriba; el resto del catálogo debajo. */
  const itemsParaLinea = (linea: LineaDraft) => {
    const { candidatos } = emparejarLineaProducto({ descripcion: linea.descripcion }, productos);
    const topIds = new Set(candidatos.map((candidato) => candidato.productoId));
    const sugeridos = candidatos.map((candidato) => ({
      value: candidato.productoId,
      label: candidato.nombre,
      description: "Sugerencia del ticket",
      keywords: [candidato.nombre],
    }));
    return [...sugeridos, ...itemsBase.filter((item) => !topIds.has(item.value))];
  };

  const actualizarLinea = (key: string, cambios: Partial<LineaDraft>) => {
    setLineas((actuales) =>
      actuales.map((linea) => {
        if (linea.key !== key) return linea;
        const siguiente = { ...linea, ...cambios };
        // Importe derivado mientras se captura: costo × cantidad salvo que la
        // persona haya tocado el importe a mano después.
        if (cambios.cantidad !== undefined || cambios.costo !== undefined) {
          siguiente.importe = String(redondear2(aNumero(siguiente.costo) * aNumero(siguiente.cantidad)));
        }
        return siguiente;
      }),
    );
  };

  const guardarLinea = (linea: LineaDraft) => {
    startTransition(async () => {
      const data = new FormData();
      data.set("organizacionId", organizacionId);
      data.set("compraId", compra.id);
      data.set("lineaId", linea.id ?? "");
      data.set("descripcion", linea.descripcion);
      data.set("productoId", linea.productoId ?? "");
      data.set("cantidad", linea.cantidad);
      data.set("costoUnitario", linea.costo);
      data.set("importe", linea.importe);
      data.set("observacion", linea.observacion);
      const state = await guardarLineaCompra(data);
      if (state.success) {
        toast.success(state.message ?? "Línea guardada.");
        router.refresh();
      } else {
        toast.error(state.error ?? "No se pudo guardar la línea.");
      }
    });
  };

  const quitarLinea = (linea: LineaDraft) => {
    const lineaId = linea.id;
    if (!lineaId) {
      setLineas((actuales) => actuales.filter((actual) => actual.key !== linea.key));
      return;
    }
    startTransition(async () => {
      const data = new FormData();
      data.set("organizacionId", organizacionId);
      data.set("compraId", compra.id);
      data.set("lineaId", lineaId);
      const state = await quitarLineaCompra(data);
      if (state.success) {
        toast.success("Línea quitada.");
        router.refresh();
      } else {
        toast.error(state.error ?? "No se pudo quitar la línea.");
      }
    });
  };

  const agregarLinea = () => {
    setLineas((actuales) => [
      ...actuales,
      {
        key: crypto.randomUUID(),
        id: null,
        descripcion: "",
        productoId: null,
        cantidad: "1",
        costo: "",
        importe: "",
        observacion: "",
        recibidaOriginal: null,
        recibida: "1",
      },
    ]);
  };

  // ── Alta rápida de producto (plan 03) ────────────────────────────────────
  const [creandoPara, setCreandoPara] = useState<LineaDraft | null>(null);

  // ── Recepción / resolución / cancelación ─────────────────────────────────
  const [actualizarCostos, setActualizarCostos] = useState(compra.actualizarCostos);
  const [notaResolucion, setNotaResolucion] = useState("");

  const recibir = () => {
    const persistidas = lineas.filter((linea) => linea.id);
    const sinEmparejar = persistidas.filter(
      (linea) => aNumero(linea.recibida) > 0 && !linea.productoId,
    );
    if (sinEmparejar.length > 0) {
      toast.error("Empareja todas las líneas o pon recibido 0.");
      return;
    }
    startTransition(async () => {
      const data = new FormData();
      data.set("organizacionId", organizacionId);
      data.set("compraId", compra.id);
      data.set("actualizarCostos", String(actualizarCostos));
      data.set(
        "lineas",
        JSON.stringify(
          persistidas.map((linea) => ({
            id: linea.id,
            cantidadRecibida: aNumero(linea.recibida),
            observacion: linea.observacion,
          })),
        ),
      );
      const state = await recibirCompra(data);
      if (state.success) {
        toast.success(state.message ?? "Compra recibida.");
        router.refresh();
      } else {
        toast.error(state.error ?? "No se pudo registrar la recepción.");
      }
    });
  };

  const resolver = () => {
    if (!notaResolucion.trim()) {
      toast.error("Escribe cómo se resolvió la observación.");
      return;
    }
    startTransition(async () => {
      const data = new FormData();
      data.set("organizacionId", organizacionId);
      data.set("compraId", compra.id);
      data.set("nota", notaResolucion);
      const state = await resolverObservacion(data);
      if (state.success) {
        toast.success(state.message ?? "Compra verificada.");
        router.refresh();
      } else {
        toast.error(state.error ?? "No se pudo marcar como verificada.");
      }
    });
  };

  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const cancelar = () => {
    setConfirmandoCancelar(false);
    startTransition(async () => {
      const data = new FormData();
      data.set("organizacionId", organizacionId);
      data.set("compraId", compra.id);
      const state = await cancelarCompra(data);
      if (state.success) {
        toast.success("Compra cancelada.");
        router.push(buildAdminHref("/compras", { organizationId: organizacionId, sucursalId }));
      } else {
        toast.error(state.error ?? "No se pudo cancelar la compra.");
      }
    });
  };

  // ── Foto con zoom ────────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const panelFoto = compra.medioUrl ? (
    <div className="space-y-3">
      {activoAsistido ? (
        <div
          className="rounded-xl border border-warning/40 bg-warning/10 p-3.5 text-sm text-foreground"
          role="status"
        >
          <div className="flex items-start gap-2">
            <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="font-medium leading-snug">
              Nota manuscrita o parcial detectada: completa o corrige los renglones abajo mirando tu foto
            </p>
          </div>
          {editable ? (
            <Button
              className="mt-2.5 w-full text-xs font-semibold"
              data-action-id="compras.linea.captura_asistida"
              onClick={agregarLinea}
              size="sm"
              type="button"
              variant="outline"
            >
              + Agregar renglón manual
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          aria-label="Alejar"
          data-action-id="compras.ticket.zoom_out"
          disabled={zoom <= 1}
          onClick={() => setZoom((actual) => Math.max(1, actual - 0.5))}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ZoomOut aria-hidden="true" className="size-4" />
        </Button>
        <Button
          aria-label="Acercar"
          data-action-id="compras.ticket.zoom_in"
          disabled={zoom >= 3}
          onClick={() => setZoom((actual) => Math.min(3, actual + 0.5))}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ZoomIn aria-hidden="true" className="size-4" />
        </Button>
        <span className="text-op-xs text-muted-foreground">
          Desplázate por la foto para leer el detalle
        </span>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-border bg-muted/40">
        <img
          alt="Foto del ticket de compra"
          className="block max-w-none transition-[width] duration-150"
          src={compra.medioUrl}
          style={{ width: `${zoom * 100}%` }}
        />
      </div>
    </div>
  ) : (
    <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      Esta compra no tiene foto del ticket.
    </p>
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* Foto del ticket: colapsable en móvil, columna fija en escritorio. */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        {compra.medioUrl ? (
          <details className="lg:hidden" open={compra.estado === "borrador" || activoAsistido}>
            <summary className="cursor-pointer list-none rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground">
              Foto del ticket
            </summary>
            <div className="mt-2">{panelFoto}</div>
          </details>
        ) : null}
        <div className={compra.medioUrl ? "hidden lg:block" : ""}>{panelFoto}</div>
      </div>

      <div className="space-y-6">
        {/* Estado + lectura IA */}
        <AdminCard
          description={
            compra.recibidaPorNombre && compra.recibidaAt
              ? `Recibió ${compra.recibidaPorNombre} el ${formatDate(compra.recibidaAt)}.`
              : undefined
          }
          title="Estado de la compra"
        >
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={info.tone}>{info.label}</StatusBadge>
            {leyendo ? (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-4 animate-spin text-primary" />
                Leyendo ticket…
              </span>
            ) : null}
            {!leyendo && compra.medioUrl && COMPRA_ESTADOS_EDITABLES.includes(compra.estado) && puedeEditar ? (
              <Button
                data-action-id="compras.ticket.analizar"
                disabled={pending}
                onClick={() => void analizar()}
                size="sm"
                type="button"
                variant="outline"
              >
                <ScanText aria-hidden="true" className="size-4" />
                {compra.analisisError ? "Reintentar lectura" : "Leer ticket con IA"}
              </Button>
            ) : null}
          </div>
          {compra.analisisError ? (
            <p className="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground" role="alert">
              {compra.analisisError} Puedes reintentar o capturar las líneas a mano.
            </p>
          ) : null}
          {compra.dudas.length > 0 ? (
            <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">Revisa estos puntos del ticket:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {compra.dudas.map((duda) => (
                  <li key={duda}>{duda}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </AdminCard>

        {/* Datos del documento */}
        <AdminCard
          actions={
            editable ? (
              <Button
                data-action-clave={recibible ? undefined : "1"}
                data-action-id="compras.datos.guardar"
                disabled={pending}
                onClick={guardarDatos}
                size={recibible ? "default" : "lg"}
                type="button"
              >
                Guardar datos
              </Button>
            ) : null
          }
          description="Proveedor, folio y fecha tal como vienen en el ticket."
          title="Datos del documento"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Combobox
              disabled={!editable}
              emptyMessage="Sin proveedores registrados"
              items={proveedores.map((proveedor) => ({
                value: proveedor.id,
                label: proveedor.nombre,
                keywords: [proveedor.nombre],
              }))}
              label="Proveedor"
              onValueChange={(valor) => setProveedorId(valor)}
              placeholder="Buscar proveedor"
              value={proveedorId}
            />
            {editable && !proveedorId ? (
              <Field>
                <FieldLabel>Nuevo proveedor</FieldLabel>
                <Input
                  onChange={(event) => setProveedorNuevo(event.target.value)}
                  placeholder="Nombre tal como viene en el ticket"
                  value={proveedorNuevo}
                />
                <FieldDescription>Se registra en el catálogo al guardar.</FieldDescription>
              </Field>
            ) : null}
            {compra.proveedorTexto && !proveedorId ? (
              <p className="text-op-xs text-muted-foreground sm:col-span-2">
                En el ticket dice “{compra.proveedorTexto}”.
              </p>
            ) : null}
            <Field>
              <FieldLabel>Folio</FieldLabel>
              <Input
                disabled={!editable}
                onChange={(event) => setFolio(event.target.value)}
                placeholder="Número de ticket o nota"
                value={folio}
              />
            </Field>
            <Field>
              <FieldLabel>Fecha de la compra</FieldLabel>
              <Input
                disabled={!editable}
                onChange={(event) => setFechaCompra(event.target.value)}
                type="date"
                value={fechaCompra}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel>Observaciones</FieldLabel>
              <Textarea
                disabled={!editable}
                onChange={(event) => setObservaciones(event.target.value)}
                placeholder="Notas sobre el ticket o la entrega"
                value={observaciones}
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">
                Total del ticket:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(compra.totalTicket, { currency })}
                </span>
              </p>
              <p className="text-muted-foreground">
                Suma de las líneas:{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {formatCurrency(compra.totalCalculado, { currency })}
                </span>
              </p>
              {compra.totalTicket !== null &&
              Math.abs(Number(compra.totalTicket) - Number(compra.totalCalculado)) > 1 ? (
                <p className="inline-flex items-center gap-1.5 text-op-xs font-medium text-warning">
                  <CircleAlert aria-hidden="true" className="size-3.5" />
                  La suma de las líneas difiere del ticket por más de $1.
                </p>
              ) : null}
            </div>
          </div>
        </AdminCard>

        {/* Líneas */}
        <AdminCard
          actions={
            editable ? (
              <Button
                data-action-id="compras.linea.agregar"
                onClick={agregarLinea}
                size="sm"
                type="button"
                variant="outline"
              >
                Agregar línea
              </Button>
            ) : null
          }
          description={`${lineas.length} renglón(es). Empareja cada línea con un producto para darle entrada al inventario.`}
          title="Líneas de la compra"
        >
          {activoAsistido ? (
            <div
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
              role="status"
            >
              <div className="flex items-center gap-2">
                <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-warning" />
                <span className="font-medium">
                  Nota manuscrita o parcial detectada: completa o corrige los renglones abajo mirando tu foto
                </span>
              </div>
              {editable ? (
                <Button
                  className="text-xs font-semibold"
                  data-action-id="compras.linea.captura_asistida"
                  onClick={agregarLinea}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  + Agregar renglón
                </Button>
              ) : null}
            </div>
          ) : null}
          {lineas.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Sin líneas todavía. Lee el ticket con IA o agrega una línea a mano.
            </p>
          ) : (
            <ul className="space-y-4">
              {lineas.map((linea, index) => (
                <li className="rounded-xl border border-border p-4" key={linea.key}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field className="sm:col-span-2">
                      <FieldLabel required>Descripción del renglón</FieldLabel>
                      <Input
                        ref={index === 0 ? primeraFilaRef : undefined}
                        disabled={!editable}
                        onChange={(event) => actualizarLinea(linea.key, { descripcion: event.target.value })}
                        placeholder="Texto del ticket o nombre del producto"
                        value={linea.descripcion}
                      />
                    </Field>
                    <div className="flex items-end gap-2">
                      <Combobox
                        className="flex-1"
                        disabled={!editable}
                        emptyMessage="Sin productos que coincidan"
                        items={itemsParaLinea(linea)}
                        label="Producto del catálogo"
                        onValueChange={(valor) => actualizarLinea(linea.key, { productoId: valor })}
                        placeholder="Emparejar con un producto"
                        value={linea.productoId}
                      />
                      {editable && puedeCrearProducto ? (
                        <Button
                          aria-label="Crear producto"
                          data-action-id="compras.linea.crear_producto"
                          onClick={() => setCreandoPara(linea)}
                          size="icon"
                          title="Crear producto"
                          type="button"
                          variant="outline"
                        >
                          <PackagePlus aria-hidden="true" className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Field>
                        <FieldLabel required>Cantidad</FieldLabel>
                        <Input
                          disabled={!editable}
                          min="0"
                          onChange={(event) => actualizarLinea(linea.key, { cantidad: event.target.value })}
                          step="0.001"
                          type="number"
                          value={linea.cantidad}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Costo unitario</FieldLabel>
                        <Input
                          disabled={!editable}
                          min="0"
                          onChange={(event) => actualizarLinea(linea.key, { costo: event.target.value })}
                          step="0.01"
                          type="number"
                          value={linea.costo}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Importe</FieldLabel>
                        <Input
                          disabled={!editable}
                          min="0"
                          onChange={(event) => actualizarLinea(linea.key, { importe: event.target.value })}
                          step="0.01"
                          type="number"
                          value={linea.importe}
                        />
                      </Field>
                    </div>
                    {recibible ? (
                      <Field>
                        <FieldLabel>Recibido</FieldLabel>
                        <Input
                          min="0"
                          onChange={(event) => actualizarLinea(linea.key, { recibida: event.target.value })}
                          step="0.001"
                          type="number"
                          value={linea.recibida}
                        />
                        {!linea.productoId ? (
                          <FieldDescription className="font-medium text-warning">
                            Sin producto: emparéjala o pon recibido 0.
                          </FieldDescription>
                        ) : null}
                      </Field>
                    ) : null}
                    {!recibible && linea.recibidaOriginal !== null ? (
                      <Field>
                        <FieldLabel>Recibido</FieldLabel>
                        <p className="flex h-10 items-center text-sm tabular-nums text-foreground">
                          {formatQuantity(linea.recibidaOriginal)}
                        </p>
                      </Field>
                    ) : null}
                    <Field className={cn(recibible ? "" : "sm:col-span-2")}>
                      <FieldLabel>Observación</FieldLabel>
                      <Input
                        disabled={!editable && !recibible}
                        onChange={(event) => actualizarLinea(linea.key, { observacion: event.target.value })}
                        placeholder="Vino abierto, caducado, pieza de menos…"
                        value={linea.observacion}
                      />
                    </Field>
                  </div>
                  {editable ? (
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button
                        data-action-id="compras.linea.quitar"
                        disabled={pending}
                        onClick={() => quitarLinea(linea)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" className="size-4 text-destructive" /> Quitar
                      </Button>
                      <Button
                        data-action-id="compras.linea.guardar"
                        disabled={pending || !linea.descripcion.trim()}
                        onClick={() => guardarLinea(linea)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {linea.id ? "Guardar línea" : "Agregar a la compra"}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        {/* Recepción */}
        {recibible ? (
          <AdminCard
            description="Confirma lo que llegó. La entrada al inventario se registra una sola vez con las cantidades recibidas."
            title="Confirmar recepción"
          >
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
              <input
                checked={actualizarCostos}
                onChange={(event) => setActualizarCostos(event.target.checked)}
                type="checkbox"
              />
              Actualizar costo de los productos
            </label>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                data-action-clave="1"
                data-action-id="compras.recibir"
                disabled={pending || lineas.filter((linea) => linea.id).length === 0}
                onClick={recibir}
                size="lg"
                type="button"
              >
                {pending ? "Registrando…" : "Confirmar recepción"}
              </Button>
            </div>
          </AdminCard>
        ) : null}

        {/* Resolución de observación */}
        {compra.estado === "con_observacion" && puedeRecibir ? (
          <AdminCard
            description="La compra quedó con observación. Escribe cómo se resolvió para marcarla como verificada (no vuelve a mover el inventario)."
            title="Resolver observación"
          >
            <Field>
              <FieldLabel required>Cómo se resolvió</FieldLabel>
              <Textarea
                onChange={(event) => setNotaResolucion(event.target.value)}
                placeholder="Ej. El proveedor repuso la pieza faltante el día…"
                value={notaResolucion}
              />
            </Field>
            <div className="mt-4 flex justify-end">
              <Button
                data-action-clave="1"
                data-action-id="compras.observacion.resolver"
                disabled={pending || !notaResolucion.trim()}
                onClick={resolver}
                type="button"
              >
                {pending ? "Guardando…" : "Marcar como verificada"}
              </Button>
            </div>
          </AdminCard>
        ) : null}

        {/* Cancelar */}
        {puedeEditar && ["borrador", "por_verificar", "con_observacion"].includes(compra.estado) ? (
          <div className="flex justify-end">
            <Button
              data-action-id="compras.cancelar"
              disabled={pending}
              onClick={() => setConfirmandoCancelar(true)}
              type="button"
              variant="destructive"
            >
              Cancelar compra
            </Button>
          </div>
        ) : null}
      </div>

      {/* Alta rápida de producto (plan 03) en sheet. */}
      {creandoPara ? (
        <Sheet onOpenChange={(open) => !open && setCreandoPara(null)} open>
          <SheetContent className="w-[min(100vw,44rem)]">
            <SheetHeader>
              <SheetTitle>Nuevo producto</SheetTitle>
              <SheetDescription>
                Se crea en el catálogo y se empareja con la línea al guardar.
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 [&>form]:rounded-none [&>form]:border-0 [&>form]:bg-transparent [&>form]:p-0 [&>form]:shadow-none [&>form>h2]:sr-only [&>form>p]:sr-only">
              <ProductForm
                capturaIa={capturaIa}
                categories={categories}
                initial={{
                  organizacionId,
                  nombre: creandoPara.descripcion.slice(0, 160),
                  sku: "",
                  tipo: "producto",
                  costo: creandoPara.costo || "0",
                  precioVenta: "",
                  stockMinimo: "",
                  visiblePos: true,
                }}
                onCreated={(producto) => {
                  setProductos((actuales) => [
                    ...actuales,
                    { id: producto.id, nombre: producto.nombre, sku: null, codigoBarras: null },
                  ]);
                  actualizarLinea(creandoPara.key, { productoId: producto.id });
                  setCreandoPara(null);
                  toast.success("Producto creado y emparejado con la línea.");
                }}
                organizationId={organizacionId}
                units={units}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      <ConfirmDialog
        cancelLabel="Volver"
        confirmLabel="Sí, cancelar compra"
        description="La compra queda cancelada y no se puede deshacer. El inventario no cambia."
        onConfirm={cancelar}
        onOpenChange={(open) => {
          if (!open) setConfirmandoCancelar(false);
        }}
        open={confirmandoCancelar}
        title="Cancelar compra"
      />
    </div>
  );
}
