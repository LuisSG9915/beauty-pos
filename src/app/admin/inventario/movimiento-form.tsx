"use client";

import { useActionState } from "react";

import { registrarMovimiento, type MovimientoActionState } from "@/app/admin/inventario/actions";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from "@/components/ui/field";
import { ActionFeedback } from "@/components/ui/toast";
import { fieldError, initialActionState } from "@/lib/action-state";

export function MovimientoForm({
  organizationId,
  sucursalId,
  productos,
}: {
  organizationId: string;
  sucursalId: string;
  productos: Array<{ id: string; sku: string; nombre: string; unidad?: string | null }>;
}) {
  const [state, action, pending] = useActionState<MovimientoActionState, FormData>(
    registrarMovimiento,
    initialActionState as MovimientoActionState,
  );

  return (
    <form action={action} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />
      <Combobox
        error={fieldError(state, "productoId")}
        items={productos.map((producto) => ({
          value: producto.id,
          label: `${producto.sku} · ${producto.nombre}`,
          description: producto.unidad ? `Unidad: ${producto.unidad}` : undefined,
          keywords: [producto.sku, producto.nombre],
        }))}
        label="Producto o insumo"
        name="productoId"
        placeholder="Buscar por clave o nombre"
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="movimiento-tipo" required>Tipo de movimiento</FieldLabel>
          <Select className="min-h-11" defaultValue="entrada" id="movimiento-tipo" invalid={Boolean(fieldError(state, "tipo"))} name="tipo" required>
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
            <option value="ajuste">Ajuste por conteo físico</option>
          </Select>
          <FieldError error={fieldError(state, "tipo")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="movimiento-cantidad" required>Cantidad</FieldLabel>
          <Input
            className="min-h-11"
            id="movimiento-cantidad"
            invalid={Boolean(fieldError(state, "cantidad"))}
            min="0"
            name="cantidad"
            required
            step="0.001"
            type="number"
          />
          <FieldError error={fieldError(state, "cantidad")} />
          <FieldDescription>
            En ajuste, escribe el stock físico contado; el sistema registra el delta.
          </FieldDescription>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="movimiento-notas">Notas</FieldLabel>
        <Textarea
          id="movimiento-notas"
          invalid={Boolean(fieldError(state, "notas"))}
          name="notas"
          placeholder="Compra a proveedor, merma, conteo físico…"
        />
        <FieldError error={fieldError(state, "notas")} />
        <FieldDescription>Obligatorias para salidas y ajustes.</FieldDescription>
      </Field>
      <ActionFeedback state={state} />
      <Button className="w-full rounded-xl min-h-11" data-action-clave="1" size="lg" data-action-id="inventario.movimiento.registrar" disabled={pending || !sucursalId || productos.length === 0} type="submit">
        {pending ? "Registrando…" : "Registrar movimiento"}
      </Button>
    </form>
  );
}
