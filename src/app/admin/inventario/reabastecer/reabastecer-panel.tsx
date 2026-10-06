"use client";

import { ClipboardCopy, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  crearCompraDesdeReabasto,
} from "@/app/admin/inventario/reabastecer/actions";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatQuantity } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";
import {
  PRIORIDAD_REABASTO_LABEL,
  TENDENCIA_REABASTO_LABEL,
  type PrioridadReabasto,
  type TendenciaReabasto,
} from "@/modules/reportes/reabastecimiento";

export type FilaReabastoVista = {
  productoId: string;
  nombre: string;
  sku: string | null;
  stock: number;
  stockMinimo: number;
  vendePorDia: number;
  tendencia: TendenciaReabasto;
  /** Días que alcanza el stock; null cuando no hay demanda registrada. */
  cobertura: number | null;
  /** Texto ya listo para mostrar ("Hoy", "15 ene 2025", "Sin stock"). */
  seAgota: string | null;
  enCamino: number;
  sugerido: number;
  prioridad: PrioridadReabasto;
  costoUnitario: number;
  costoSugerido: number;
  motivo: string;
};

const PRIORIDAD_TONO: Record<PrioridadReabasto, StatusTone> = {
  agotado: "destructive",
  urgente: "warning",
  pronto: "info",
  minimo: "neutral",
  ok: "success",
};

/**
 * Tabla "Qué comprar" del plan 12: una fila por producto que necesita compra,
 * con checkbox + cantidad editable. "Crear compra con lo seleccionado" genera
 * una compra `borrador` del plan 10 y navega a su detalle; sin permiso
 * `compras.editar` se ofrece "Copiar lista" como respaldo.
 */
export function ReabastecerPanel({
  filas,
  dias,
  organizacionId,
  sucursalId,
  puedeCrearCompra,
  currency,
}: {
  filas: FilaReabastoVista[];
  dias: number;
  organizacionId: string;
  sucursalId: string;
  puedeCrearCompra: boolean;
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  // productoId → { marcada, cantidad }. Se seleccionan de entrada las filas
  // con sugerido > 0; la cantidad editable arranca en la sugerida.
  const estadoInicial = (lista: FilaReabastoVista[]) =>
    Object.fromEntries(
      lista.map((fila) => [
        fila.productoId,
        { marcada: fila.sugerido > 0, cantidad: String(fila.sugerido) },
      ]),
    );
  const [seleccion, setSeleccion] = useState<Record<string, { marcada: boolean; cantidad: string }>>(
    () => estadoInicial(filas),
  );

  // Re-sincroniza cuando la lista cambia (nuevo ?dias=, stock actualizado):
  // ajuste de estado durante el render, patrón oficial de React — igual que
  // compra-detalle.tsx, no en un effect.
  const filasKey = filas.map((fila) => fila.productoId).join(",");
  const [filasKeyPrev, setFilasKeyPrev] = useState(filasKey);
  if (filasKey !== filasKeyPrev) {
    setFilasKeyPrev(filasKey);
    setSeleccion(estadoInicial(filas));
  }

  const estadoVacio = { marcada: false, cantidad: "0" };
  const estadoDe = (productoId: string) => seleccion[productoId] ?? estadoVacio;

  const actualizar = (productoId: string, cambios: Partial<{ marcada: boolean; cantidad: string }>) =>
    setSeleccion((actual) => ({
      ...actual,
      [productoId]: { ...(actual[productoId] ?? estadoVacio), ...cambios },
    }));

  const seleccionadas = filas.filter((fila) => {
    const estado = estadoDe(fila.productoId);
    return estado.marcada && Number(estado.cantidad) > 0;
  });

  const crearCompra = () => {
    startTransition(async () => {
      const data = new FormData();
      data.set("organizacionId", organizacionId);
      data.set("sucursalId", sucursalId);
      data.set(
        "lineas",
        JSON.stringify(
          seleccionadas.map((fila) => ({
            productoId: fila.productoId,
            cantidad: Number(estadoDe(fila.productoId).cantidad),
          })),
        ),
      );
      const state = await crearCompraDesdeReabasto(data);
      if (state.success && state.data?.compraId) {
        toast.success(state.message ?? "Compra creada como borrador.");
        router.push(
          buildAdminHref(`/compras/${state.data.compraId}`, {
            organizationId: organizacionId,
            sucursalId,
          }),
        );
      } else {
        toast.error(state.error ?? "No se pudo crear la compra.");
      }
    });
  };

  const copiarLista = async () => {
    const lineas = [
      `Qué comprar — para ${dias} días`,
      ...seleccionadas.map((fila) => {
        const estado = estadoDe(fila.productoId);
        return `- ${fila.nombre}: ${estado.cantidad} (${fila.motivo}) ≈ ${formatCurrency(
          Number(estado.cantidad) * fila.costoUnitario,
          { currency },
        )}`;
      }),
      `Total estimado: ${formatCurrency(
        seleccionadas.reduce(
          (total, fila) => total + Number(estadoDe(fila.productoId).cantidad) * fila.costoUnitario,
          0,
        ),
        { currency },
      )}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(lineas);
      toast.success("Lista copiada al portapapeles.");
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.");
    }
  };

  const acciones = (primaria: boolean) => (
    <div
      className={`flex flex-wrap items-center gap-2 ${
        primaria
          ? "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:border-t max-lg:border-border max-lg:bg-card max-lg:px-4 max-lg:py-3 max-lg:shadow-[0_-4px_12px_rgba(0,0,0,0.08)]"
          : ""
      }`}
    >
      {puedeCrearCompra ? (
        <Button
          {...(primaria ? { "data-action-clave": "1" } : {})}
          data-action-id="reabastecer.compra.crear"
          disabled={pending || seleccionadas.length === 0}
          onClick={crearCompra}
          size="lg"
          type="button"
        >
          <ShoppingCart aria-hidden="true" className="size-4" />
          Crear compra con lo seleccionado
        </Button>
      ) : (
        <Button
          {...(primaria ? { "data-action-clave": "1" } : {})}
          data-action-id="reabastecer.lista.copiar"
          disabled={seleccionadas.length === 0}
          onClick={copiarLista}
          size="lg"
          type="button"
          variant="outline"
        >
          <ClipboardCopy aria-hidden="true" className="size-4" />
          Copiar lista
        </Button>
      )}
      <span className="text-xs text-muted-foreground">
        {seleccionadas.length} de {filas.length} producto(s) seleccionados
      </span>
    </div>
  );

  if (filas.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Todo cubierto: nada que comprar con el objetivo de {dias} días.
        </p>
        {acciones(true)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {acciones(true)}

      {/* Móvil: tarjetas */}
      <div className="space-y-3 md:hidden">
        {filas.map((fila) => {
          const estado = estadoDe(fila.productoId);
          return (
            <article className="rounded-xl border border-border p-4" key={fila.productoId}>
              <div className="flex items-start justify-between gap-3">
                <label className="flex min-h-11 min-w-0 items-start gap-3">
                  <input
                    checked={estado.marcada}
                    className="mt-1"
                    data-action-id="reabastecer.fila.seleccionar"
                    onChange={(event) => actualizar(fila.productoId, { marcada: event.target.checked })}
                    type="checkbox"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-5 text-foreground">
                      {fila.nombre}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {fila.sku ? `${fila.sku} · ` : ""}
                      {fila.motivo}
                    </span>
                  </span>
                </label>
                <StatusBadge tone={PRIORIDAD_TONO[fila.prioridad]}>
                  {PRIORIDAD_REABASTO_LABEL[fila.prioridad]}
                </StatusBadge>
              </div>
              <dl className="mt-3 space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="shrink-0 text-xs text-muted-foreground">Stock</dt>
                  <dd className="min-w-0 text-right font-medium tabular-nums text-foreground">
                    {formatQuantity(fila.stock)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="shrink-0 text-xs text-muted-foreground">Vende por día</dt>
                  <dd className="min-w-0 text-right tabular-nums text-foreground">
                    {fila.vendePorDia.toFixed(1)}
                    <span className="ml-1 text-xs text-muted-foreground">{TENDENCIA_REABASTO_LABEL[fila.tendencia]}</span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="shrink-0 text-xs text-muted-foreground">Te alcanza para</dt>
                  <dd className="min-w-0 text-right text-xs tabular-nums text-muted-foreground">
                    {fila.cobertura === null
                      ? "—"
                      : `${formatQuantity(Math.round(fila.cobertura * 10) / 10, { maximumFractionDigits: 1 })} días${fila.seAgota ? ` · ${fila.seAgota}` : ""}`}
                  </dd>
                </div>
                {fila.enCamino > 0 ? (
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="shrink-0 text-xs text-muted-foreground">En camino</dt>
                    <dd className="min-w-0 text-right text-xs tabular-nums text-muted-foreground">
                      {formatQuantity(fila.enCamino)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="shrink-0 text-xs text-muted-foreground">Sugerido</dt>
                  <dd className="flex min-w-0 items-center justify-end gap-2">
                    <Input
                      aria-label={`Cantidad a comprar de ${fila.nombre}`}
                      className="h-9 w-24 text-right tabular-nums"
                      min="0"
                      onChange={(event) => actualizar(fila.productoId, { cantidad: event.target.value })}
                      step="1"
                      type="number"
                      value={estado.cantidad}
                    />
                    <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                      {formatCurrency(Number(estado.cantidad || 0) * fila.costoUnitario, { currency })}
                    </span>
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>

      {/* Escritorio: tabla */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-3 font-medium">
                <span className="sr-only">Seleccionar</span>
              </th>
              <th className="px-4 py-3 font-medium">Producto</th>
              <th className="px-4 py-3 font-medium">Prioridad</th>
              <th className="px-4 py-3 text-right font-medium">Stock</th>
              <th className="px-4 py-3 text-right font-medium">Vende/día</th>
              <th className="px-4 py-3 font-medium">Tendencia</th>
              <th className="px-4 py-3 text-right font-medium">Te alcanza</th>
              <th className="px-4 py-3 text-right font-medium">En camino</th>
              <th className="px-4 py-3 text-right font-medium">Sugerido</th>
              <th className="px-4 py-3 text-right font-medium">Costo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map((fila) => {
              const estado = estadoDe(fila.productoId);
              return (
                <tr className="align-top hover:bg-muted/60" key={fila.productoId}>
                  <td className="px-4 py-3">
                    <input
                      aria-label={`Seleccionar ${fila.nombre}`}
                      checked={estado.marcada}
                      className="size-6 cursor-pointer align-middle"
                      data-action-id="reabastecer.fila.seleccionar"
                      onChange={(event) => actualizar(fila.productoId, { marcada: event.target.checked })}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-medium leading-5">{fila.nombre}</span>
                    <span className="block text-xs leading-5 text-muted-foreground">
                      {fila.sku ? `${fila.sku} · ` : ""}
                      {fila.motivo}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={PRIORIDAD_TONO[fila.prioridad]}>
                      {PRIORIDAD_REABASTO_LABEL[fila.prioridad]}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatQuantity(fila.stock)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fila.vendePorDia.toFixed(1)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{TENDENCIA_REABASTO_LABEL[fila.tendencia]}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fila.cobertura === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span>
                        {formatQuantity(Math.round(fila.cobertura * 10) / 10, { maximumFractionDigits: 1 })} días
                        {fila.seAgota ? (
                          <span className="block text-xs text-muted-foreground">{fila.seAgota}</span>
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {fila.enCamino > 0 ? formatQuantity(fila.enCamino) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      aria-label={`Cantidad a comprar de ${fila.nombre}`}
                      className="ml-auto h-9 w-24 text-right tabular-nums"
                      min="0"
                      onChange={(event) => actualizar(fila.productoId, { cantidad: event.target.value })}
                      step="1"
                      type="number"
                      value={estado.cantidad}
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(Number(estado.cantidad || 0) * fila.costoUnitario, { currency })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {acciones(false)}
      <p className="text-xs text-muted-foreground">
        Cantidades redondeadas hacia arriba. El costo usa el último costo del catálogo; la compra se
        crea como borrador y no mueve el inventario hasta que la recibas en Compras.
      </p>
      {/* En móvil la barra de acciones queda fija abajo: espacio para no tapar el pie. */}
      <div aria-hidden="true" className="h-16 lg:hidden" />
    </div>
  );
}
