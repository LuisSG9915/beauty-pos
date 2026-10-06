"use client";

import { useActionState, useEffect } from "react";

import {
  guardarMobiliario,
  guardarPiso,
  guardarUbicacion,
} from "@/app/admin/plano/actions";
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
import { Button } from "@/components/ui/button";
import { ActionFeedback } from "@/components/ui/toast";
import {
  MOBILIARIO_ESTADOS,
  MOBILIARIO_TIPOS,
  PISO_MAX_COLUMNAS,
  PISO_MAX_FILAS,
  PISO_MIN_COLUMNAS,
  PISO_MIN_FILAS,
  UBICACION_TIPOS,
} from "@/db/schema/plano";
import { initialActionState } from "@/lib/action-state";
import {
  MOBILIARIO_ESTADO_LABEL,
  MOBILIARIO_TIPO_LABEL,
  UBICACION_TIPO_LABEL,
  type PlanoMobiliario,
  type PlanoPiso,
  type PlanoRecurso,
  type PlanoUbicacion,
} from "@/modules/plano";

type FormProps = {
  organizationId: string;
  sucursalId: string;
  /** Se dispara tras un guardado exitoso (la página ya se refrescó). */
  onGuardado?: () => void;
};

/** Cierra el sheet ~0.5 s después del guardado para que el aviso verde se lea. */
function useCerrarAlGuardar(success: boolean | undefined, onGuardado?: () => void) {
  useEffect(() => {
    if (!success || !onGuardado) return;
    const timer = setTimeout(onGuardado, 500);
    return () => clearTimeout(timer);
  }, [success, onGuardado]);
}

/** Alta/edición de piso: nombre y tamaño de la cuadrícula. */
export function PisoForm({ organizationId, sucursalId, piso, onGuardado }: FormProps & { piso?: PlanoPiso | null }) {
  const [state, action, pending] = useActionState(guardarPiso, initialActionState);
  useCerrarAlGuardar(state.success, onGuardado);
  return (
    <form action={action} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />
      {piso ? <input name="pisoId" type="hidden" value={piso.id} /> : null}

      <Field>
        <FieldLabel required>Nombre del piso</FieldLabel>
        <Input
          defaultValue={piso?.nombre ?? ""}
          invalid={Boolean(state.fieldErrors?.nombre)}
          name="nombre"
          placeholder="Planta baja, Planta alta…"
          required
        />
        <FieldError error={state.fieldErrors?.nombre?.[0]} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel required>Columnas</FieldLabel>
          <Input
            defaultValue={piso?.columnas ?? 24}
            invalid={Boolean(state.fieldErrors?.columnas)}
            max={PISO_MAX_COLUMNAS}
            min={PISO_MIN_COLUMNAS}
            name="columnas"
            required
            type="number"
          />
          <FieldDescription>{`${PISO_MIN_COLUMNAS} a ${PISO_MAX_COLUMNAS} celdas de ancho.`}</FieldDescription>
          <FieldError error={state.fieldErrors?.columnas?.[0]} />
        </Field>
        <Field>
          <FieldLabel required>Filas</FieldLabel>
          <Input
            defaultValue={piso?.filas ?? 16}
            invalid={Boolean(state.fieldErrors?.filas)}
            max={PISO_MAX_FILAS}
            min={PISO_MIN_FILAS}
            name="filas"
            required
            type="number"
          />
          <FieldDescription>{`${PISO_MIN_FILAS} a ${PISO_MAX_FILAS} celdas de alto.`}</FieldDescription>
          <FieldError error={state.fieldErrors?.filas?.[0]} />
        </Field>
      </div>

      {piso ? (
        <FieldDescription>
          Si reduces el tamaño, los elementos que queden fuera impiden guardar:
          muévelos o quítalos primero.
        </FieldDescription>
      ) : null}

      <ActionFeedback state={state} />
      <div className="flex justify-end gap-2">
        <Button data-action-id="plano.piso.guardar" disabled={pending} type="submit">
          {pending ? "Guardando…" : piso ? "Guardar piso" : "Agregar piso"}
        </Button>
      </div>
    </form>
  );
}

/** Edición de nombre/tipo de una ubicación (la posición se arrastra en el plano). */
export function UbicacionForm({
  organizationId,
  sucursalId,
  ubicacion,
  onGuardado,
}: FormProps & { ubicacion: PlanoUbicacion }) {
  const [state, action, pending] = useActionState(guardarUbicacion, initialActionState);
  useCerrarAlGuardar(state.success, onGuardado);
  return (
    <form action={action} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />
      <input name="ubicacionId" type="hidden" value={ubicacion.id} />
      <input name="pisoId" type="hidden" value={ubicacion.pisoId} />

      <Field>
        <FieldLabel required>Nombre</FieldLabel>
        <Input
          defaultValue={ubicacion.nombre}
          invalid={Boolean(state.fieldErrors?.nombre)}
          name="nombre"
          required
        />
        <FieldError error={state.fieldErrors?.nombre?.[0]} />
      </Field>

      <Field>
        <FieldLabel required>Tipo</FieldLabel>
        <Select defaultValue={ubicacion.tipo} name="tipo">
          {UBICACION_TIPOS.map((tipo) => (
            <option key={tipo} value={tipo}>
              {UBICACION_TIPO_LABEL[tipo]}
            </option>
          ))}
        </Select>
        <FieldError error={state.fieldErrors?.tipo?.[0]} />
      </Field>

      <ActionFeedback state={state} />
      <div className="flex justify-end">
        <Button data-action-id="plano.ubicacion.guardar" disabled={pending} type="submit">
          {pending ? "Guardando…" : "Guardar ubicación"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Alta/edición de mueble: datos del activo, piso donde se coloca (o "Sin
 * colocar") y enlace opcional a un recurso agendable de la agenda. La foto se
 * administra desde el panel del mueble una vez guardado (la API la fija
 * directo en `foto_id`).
 */
export function MobiliarioForm({
  organizationId,
  pisos,
  recursos,
  sucursalId,
  mueble,
  tipoInicial,
  onGuardado,
}: FormProps & {
  pisos: PlanoPiso[];
  recursos: PlanoRecurso[];
  mueble?: PlanoMobiliario | null;
  /** Tipo pre-elegido desde la paleta del editor. */
  tipoInicial?: string;
}) {
  const [state, action, pending] = useActionState(guardarMobiliario, initialActionState);
  useCerrarAlGuardar(state.success, onGuardado);
  const tipoValido = (MOBILIARIO_TIPOS as readonly string[]).includes(tipoInicial ?? "")
    ? tipoInicial
    : "otro";
  return (
    <form action={action} className="space-y-4">
      <input name="organizacionId" type="hidden" value={organizationId} />
      <input name="sucursalId" type="hidden" value={sucursalId} />
      {mueble ? <input name="mobiliarioId" type="hidden" value={mueble.id} /> : null}

      <Field>
        <FieldLabel required>Nombre del mueble</FieldLabel>
        <Input
          defaultValue={mueble?.nombre ?? ""}
          invalid={Boolean(state.fieldErrors?.nombre)}
          name="nombre"
          placeholder="Silla de manicura 1, Camilla facial…"
          required
        />
        <FieldError error={state.fieldErrors?.nombre?.[0]} />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Tipo</FieldLabel>
          <Select defaultValue={mueble?.tipo ?? tipoValido} name="tipo">
            {MOBILIARIO_TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {MOBILIARIO_TIPO_LABEL[tipo]}
              </option>
            ))}
          </Select>
          <FieldError error={state.fieldErrors?.tipo?.[0]} />
        </Field>
        <Field>
          <FieldLabel required>Estado</FieldLabel>
          <Select defaultValue={mueble?.estado ?? "bueno"} name="estado">
            {MOBILIARIO_ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {MOBILIARIO_ESTADO_LABEL[estado]}
              </option>
            ))}
          </Select>
          <FieldError error={state.fieldErrors?.estado?.[0]} />
        </Field>
      </div>

      <Field>
        <FieldLabel>Piso del plano</FieldLabel>
        <Select defaultValue={mueble?.pisoId ?? ""} name="pisoId">
          <option value="">Sin colocar (no aparece en el mapa)</option>
          {pisos.map((piso) => (
            <option key={piso.id} value={piso.id}>
              {piso.nombre}
            </option>
          ))}
        </Select>
        <FieldDescription>
          Al cambiar de piso el mueble se coloca en la primera celda libre; luego lo arrastras.
        </FieldDescription>
        <FieldError error={state.fieldErrors?.pisoId?.[0]} />
      </Field>

      <Field>
        <FieldLabel>Recurso de agenda ligado</FieldLabel>
        <Combobox
          clearable
          defaultValue={mueble?.recursoId ?? null}
          emptyMessage="Sin recursos activos en esta sucursal."
          items={recursos.map((recurso) => ({
            value: recurso.id,
            label: recurso.nombre,
            keywords: [recurso.tipo],
          }))}
          name="recursoId"
          placeholder="Ninguno"
        />
        <FieldDescription>
          Opcional: si el mueble también se aparta en las citas (una cabina, una silla de manicura).
        </FieldDescription>
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel>Fecha de adquisición</FieldLabel>
          <Input
            defaultValue={mueble?.fechaAdquisicion ?? ""}
            invalid={Boolean(state.fieldErrors?.fechaAdquisicion)}
            name="fechaAdquisicion"
            type="date"
          />
          <FieldError error={state.fieldErrors?.fechaAdquisicion?.[0]} />
        </Field>
        <Field>
          <FieldLabel>Costo</FieldLabel>
          <Input
            defaultValue={mueble?.costo ?? ""}
            invalid={Boolean(state.fieldErrors?.costo)}
            min={0}
            name="costo"
            step="0.01"
            type="number"
          />
          <FieldError error={state.fieldErrors?.costo?.[0]} />
        </Field>
      </div>

      <Field>
        <FieldLabel>Notas</FieldLabel>
        <Textarea
          defaultValue={mueble?.notas ?? ""}
          invalid={Boolean(state.fieldErrors?.notas)}
          name="notas"
          placeholder="Medidas, proveedor, mantenimiento pendiente…"
        />
        <FieldError error={state.fieldErrors?.notas?.[0]} />
      </Field>

      <ActionFeedback state={state} />
      <div className="flex justify-end">
        <Button data-action-id="plano.mobiliario.guardar" disabled={pending} type="submit">
          {pending ? "Guardando…" : mueble ? "Guardar mueble" : "Agregar mueble"}
        </Button>
      </div>
    </form>
  );
}
