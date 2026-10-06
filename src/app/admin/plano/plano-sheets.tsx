"use client";

import { Check, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  cambiarEstadoMobiliario,
  desactivarMobiliario,
  desactivarUbicacion,
  fijarCantidadUbicacion,
} from "@/app/admin/plano/actions";
import { MobiliarioFotoField } from "@/components/media-image-field";
import { StatusBadge } from "@/components/status-badge";
import { ToggleActivo } from "@/components/admin/toggle-activo";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { MOBILIARIO_ESTADOS } from "@/db/schema/plano";
import { formatCurrency, formatQuantity } from "@/lib/format";
import {
  MOBILIARIO_ESTADO_LABEL,
  MOBILIARIO_ESTADO_TONO,
  MOBILIARIO_TIPO_LABEL,
  UBICACION_TIPO_LABEL,
  type PlanoMobiliario,
  type PlanoProducto,
  type PlanoUbicacion,
  type PlanoUbicacionProducto,
} from "@/modules/plano";

const TURNO_ACCION = {
  ubicacion: {
    baja: "Quitar del plano",
    alta: "Reactivar",
    articulo: "la" as const,
    participioBaja: "quitada del plano",
    participioAlta: "reactivada",
  },
  mobiliario: {
    baja: "Quitar del plano",
    alta: "Reactivar",
    articulo: "el" as const,
    participioBaja: "quitado del plano",
    participioAlta: "reactivado",
  },
};

function totalAsignado(productos: PlanoUbicacionProducto[]): number {
  return productos.reduce((total, item) => total + Number(item.cantidad), 0);
}

/* ------------------------------------------------------------------ */
/* Fila producto ↔ ubicación con cantidad editable                      */
/* ------------------------------------------------------------------ */

function ProductoUbicacionRow({
  editable,
  item,
  organizationId,
  ubicacionId,
}: {
  editable: boolean;
  item: PlanoUbicacionProducto;
  organizationId: string;
  ubicacionId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [cantidad, setCantidad] = useState(item.cantidad);
  const [pending, startTransition] = useTransition();

  const guardar = (valor: number) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("ubicacionId", ubicacionId);
    data.set("productoId", item.productoId);
    data.set("cantidad", String(valor));
    startTransition(async () => {
      const result = await fijarCantidadUbicacion(data);
      if (result.error || !result.success) {
        toast.error("No se pudo guardar la cantidad.", result.error);
        setCantidad(item.cantidad);
        return;
      }
      toast.success(valor === 0 ? "Producto quitado de la ubicación." : "Cantidad actualizada.", item.nombre);
      router.refresh();
    });
  };

  return (
    <li className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.nombre}</p>
        <p className="text-xs text-muted-foreground">{item.sku}</p>
      </div>
      {editable ? (
        <div className="flex items-center gap-1.5">
          <Input
            aria-label={`Cantidad de ${item.nombre} en esta ubicación`}
            className="h-8 w-20 text-right tabular-nums"
            min={0}
            onChange={(event) => setCantidad(event.target.value)}
            step="0.001"
            type="number"
            value={cantidad}
          />
          <Button
            aria-label={`Guardar cantidad de ${item.nombre}`}
            data-action-id="plano.ubicacion.cantidad.guardar"
            disabled={pending || Number(cantidad) === Number(item.cantidad)}
            onClick={() => guardar(Number(cantidad))}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <Check aria-hidden="true" className="size-3.5" />
          </Button>
          {Number(item.cantidad) > 0 ? (
            <Button
              data-action-id="plano.ubicacion.producto.quitar"
              disabled={pending}
              onClick={() => guardar(0)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Quitar
            </Button>
          ) : null}
        </div>
      ) : (
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatQuantity(Number(item.cantidad))}
        </span>
      )}
    </li>
  );
}

/** Combobox + cantidad para agregar un producto a la ubicación. */
function AgregarProductoUbicacion({
  disponibles,
  organizationId,
  ubicacionId,
}: {
  disponibles: PlanoProducto[];
  organizationId: string;
  ubicacionId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [productoId, setProductoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState("1");
  const [pending, startTransition] = useTransition();

  const agregar = () => {
    if (!productoId) return;
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("ubicacionId", ubicacionId);
    data.set("productoId", productoId);
    data.set("cantidad", cantidad);
    startTransition(async () => {
      const result = await fijarCantidadUbicacion(data);
      if (result.error || !result.success) {
        toast.error("No se pudo asignar el producto.", result.error);
        return;
      }
      toast.success("Producto asignado a la ubicación.");
      setProductoId(null);
      setCantidad("1");
      router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-dashed border-border p-3">
      <Field>
        <FieldLabel>Agregar producto a esta ubicación</FieldLabel>
        <Combobox
          clearable
          emptyMessage="Sin productos activos por asignar."
          items={disponibles.map((producto) => ({
            value: producto.id,
            label: producto.nombre,
            description: producto.sku,
            keywords: [producto.sku],
          }))}
          onValueChange={(value) => setProductoId(value)}
          placeholder="Busca por nombre o clave…"
          value={productoId}
        />
      </Field>
      <div className="mt-2 flex items-center gap-2">
        <Input
          aria-label="Cantidad a asignar"
          className="h-9 w-24 text-right tabular-nums"
          min={0}
          onChange={(event) => setCantidad(event.target.value)}
          step="0.001"
          type="number"
          value={cantidad}
        />
        <Button
          data-action-id="plano.ubicacion.producto.agregar"
          disabled={pending || !productoId || Number(cantidad) <= 0}
          onClick={agregar}
          size="sm"
          type="button"
        >
          Asignar
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel de ubicación                                                   */
/* ------------------------------------------------------------------ */

export function UbicacionSheet({
  onClose,
  onEditar,
  organizationId,
  puedeEditarCantidades,
  puedeEditarPlano,
  productos,
  ubicacion,
}: {
  organizationId: string;
  productos: PlanoProducto[];
  puedeEditarCantidades: boolean;
  puedeEditarPlano: boolean;
  ubicacion: PlanoUbicacion | null;
  onClose: () => void;
  /** Abre el formulario de edición (nombre/tipo). */
  onEditar: (ubicacion: PlanoUbicacion) => void;
}) {
  const asignados = ubicacion?.productos ?? [];
  const asignadosIds = new Set(asignados.map((item) => item.productoId));
  const disponibles = productos.filter((producto) => !asignadosIds.has(producto.id));

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={Boolean(ubicacion)}>
      <SheetContent>
        {ubicacion ? (
          <>
            <SheetHeader>
              <SheetTitle>{ubicacion.nombre}</SheetTitle>
              <SheetDescription>
                {UBICACION_TIPO_LABEL[ubicacion.tipo as keyof typeof UBICACION_TIPO_LABEL] ?? ubicacion.tipo}
                {" · "}
                {formatQuantity(totalAsignado(asignados))} pieza(s) asignadas en total.
              </SheetDescription>
            </SheetHeader>

            <section aria-label="Mercancía en esta ubicación" className="space-y-2">
              {asignados.length === 0 ? (
                <p className="rounded-xl bg-muted/60 px-4 py-3 text-xs text-muted-foreground">
                  Sin mercancía asignada todavía.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {asignados.map((item) => (
                    <ProductoUbicacionRow
                      editable={puedeEditarCantidades}
                      item={item}
                      key={item.productoId}
                      organizationId={organizationId}
                      ubicacionId={ubicacion.id}
                    />
                  ))}
                </ul>
              )}
              {puedeEditarCantidades && disponibles.length > 0 ? (
                <AgregarProductoUbicacion
                  disponibles={disponibles}
                  organizationId={organizationId}
                  ubicacionId={ubicacion.id}
                />
              ) : null}
              <p className="text-xs leading-5 text-muted-foreground">
                Las cantidades por ubicación son informativas: las ventas siguen
                descontando del stock de la sucursal.
              </p>
            </section>

            {puedeEditarPlano ? (
              <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  data-action-id="plano.ubicacion.editar"
                  onClick={() => onEditar(ubicacion)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Pencil aria-hidden="true" className="size-3.5" /> Editar datos
                </Button>
                <ToggleActivo
                  action={desactivarUbicacion}
                  activo
                  confirmHint="Si todavía tiene mercancía asignada, habrá que pasarla a otra ubicación primero."
                  entidad="ubicación"
                  id={ubicacion.id}
                  labels={TURNO_ACCION.ubicacion}
                  nombre={ubicacion.nombre}
                  organizationId={organizationId}
                  telemetryBase="plano.ubicacion"
                />
              </div>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Panel de mueble                                                      */
/* ------------------------------------------------------------------ */

export function MobiliarioSheet({
  moneda,
  mueble,
  onClose,
  onEditar,
  organizationId,
  puedeEditarPlano,
}: {
  organizationId: string;
  mueble: PlanoMobiliario | null;
  /** Código de moneda de la organización para mostrar el costo. */
  moneda: string;
  puedeEditarPlano: boolean;
  onClose: () => void;
  onEditar: (mueble: PlanoMobiliario) => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const cambiarEstado = (estado: string) => {
    if (!mueble || estado === mueble.estado) return;
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("id", mueble.id);
    data.set("estado", estado);
    startTransition(async () => {
      const result = await cambiarEstadoMobiliario(data);
      if (result.error || !result.success) {
        toast.error("No se pudo actualizar el estado.", result.error);
        return;
      }
      toast.success("Estado actualizado.", mueble.nombre);
      router.refresh();
    });
  };

  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={Boolean(mueble)}>
      <SheetContent>
        {mueble ? (
          <>
            <SheetHeader>
              <SheetTitle>{mueble.nombre}</SheetTitle>
              <SheetDescription>
                {MOBILIARIO_TIPO_LABEL[mueble.tipo as keyof typeof MOBILIARIO_TIPO_LABEL] ?? mueble.tipo}
                {mueble.pisoId ? "" : " · sin colocar en el plano"}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-4">
              {mueble.fotoClaveR2 ? (
                // eslint-disable-next-line @next/next/no-img-element -- la ruta exige sesión; next/image no reenvía cookies
                <img
                  alt={`Foto de ${mueble.nombre}`}
                  className="aspect-video w-full rounded-xl border border-border object-cover"
                  src={`/api/medios/${encodeURI(mueble.fotoClaveR2)}`}
                />
              ) : null}

              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-muted-foreground">Estado</dt>
                  <dd>
                    <StatusBadge
                      tone={MOBILIARIO_ESTADO_TONO[mueble.estado as keyof typeof MOBILIARIO_ESTADO_TONO] ?? "neutral"}
                    >
                      {MOBILIARIO_ESTADO_LABEL[mueble.estado as keyof typeof MOBILIARIO_ESTADO_LABEL] ?? mueble.estado}
                    </StatusBadge>
                  </dd>
                </div>
                {mueble.recursoNombre ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Recurso de agenda</dt>
                    <dd className="text-right text-sm font-medium text-foreground">{mueble.recursoNombre}</dd>
                  </div>
                ) : null}
                {mueble.fechaAdquisicion ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Adquisición</dt>
                    <dd className="text-sm text-foreground">{mueble.fechaAdquisicion}</dd>
                  </div>
                ) : null}
                {mueble.costo != null ? (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-muted-foreground">Costo</dt>
                    <dd className="text-sm tabular-nums text-foreground">
                      {formatCurrency(Number(mueble.costo), { currency: moneda })}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {mueble.notas ? (
                <div className="rounded-xl bg-muted/60 px-4 py-3 text-sm leading-6 text-foreground">
                  {mueble.notas}
                </div>
              ) : null}

              {puedeEditarPlano ? (
                <>
                  <Field>
                    <FieldLabel>Cambiar estado</FieldLabel>
                    <div className="flex flex-wrap gap-1.5" role="group">
                      {MOBILIARIO_ESTADOS.map((estado) => (
                        <Button
                          aria-pressed={mueble.estado === estado}
                          data-action-id={`plano.mobiliario.estado.${estado}`}
                          disabled={pending || mueble.estado === estado}
                          key={estado}
                          onClick={() => cambiarEstado(estado)}
                          size="sm"
                          type="button"
                          variant={mueble.estado === estado ? "secondary" : "outline"}
                        >
                          {MOBILIARIO_ESTADO_LABEL[estado]}
                        </Button>
                      ))}
                    </div>
                  </Field>

                  <Field>
                    <FieldLabel>Foto del mueble</FieldLabel>
                    <MobiliarioFotoField
                      claveInicial={mueble.fotoClaveR2}
                      muebleId={mueble.id}
                      muebleNombre={mueble.nombre}
                      organizacionId={organizationId}
                    />
                  </Field>
                </>
              ) : null}
            </div>

            {puedeEditarPlano ? (
              <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  data-action-id="plano.mobiliario.editar"
                  onClick={() => onEditar(mueble)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Pencil aria-hidden="true" className="size-3.5" /> Editar datos
                </Button>
                <ToggleActivo
                  action={desactivarMobiliario}
                  activo
                  confirmHint="Dejará de verse en el plano; su recurso de agenda ligado no se toca."
                  entidad="mueble"
                  id={mueble.id}
                  labels={TURNO_ACCION.mobiliario}
                  nombre={mueble.nombre}
                  organizationId={organizationId}
                  telemetryBase="plano.mobiliario"
                />
              </div>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
