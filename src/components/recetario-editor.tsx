"use client";

import { Copy, Plus, Sparkles, Timer, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { getCatalogoInsumos, getHistorialFormulasCliente } from "@/app/admin/client-actions";
import { AntesDespuesFotosField } from "@/components/media-image-field";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { FichaInsumo } from "@/db/schema/operations";
import { formatDate } from "@/lib/format";
import { iniciarPoseTimerEnNavegador } from "@/components/pose-timer-bar";
import { crearPoseTimer } from "@/modules/agenda/temporizador";
import {
  formatearResumenFormula,
  UNIDADES_INSUMO,
  type UnidadInsumo,
} from "@/modules/expedientes/formulas";

type CatalogoItem = {
  id: string;
  nombre: string;
  sku: string;
  tipo: string;
};

type HistorialItem = {
  id: string;
  tipo: string;
  formula: string | null;
  insumos: FichaInsumo[];
  tiempoPoseMinutos: number | null;
  createdAt: Date | string;
  servicioNombre: string | null;
  autorNombre: string | null;
};

const PROPORCIONES_RAPIDAS = ["1:1", "1:1.5", "1:2"];
const TIEMPOS_POSE_RAPIDOS = [20, 30, 35, 45];

export function RecetarioEditor({
  citaId,
  clienteId,
  clienteNombre,
  entidadId,
  initialTiempoPose,
  onInsumosChange,
  organizationId,
  servicioNombre,
}: {
  citaId?: string;
  clienteId: string;
  clienteNombre?: string;
  entidadId: string;
  initialTiempoPose?: number | null;
  onInsumosChange?: (resumen: string) => void;
  organizationId: string;
  servicioNombre?: string;
}) {
  const toast = useToast();
  const [insumos, setInsumos] = useState<FichaInsumo[]>([
    {
      id: crypto.randomUUID(),
      nombre: "",
      cantidad: 40,
      unidad: "g",
      proporcion: "1:1",
      descontarStock: true,
    },
  ]);
  const [tiempoPose, setTiempoPose] = useState<string>(
    initialTiempoPose ? String(initialTiempoPose) : "",
  );
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [historial, setHistorial] = useState<HistorialItem[]>([]);
  const [modoTextoLibre, setModoTextoLibre] = useState(false);
  const [formulaTextoLibre, setFormulaTextoLibre] = useState("");

  // Cargar catálogo de productos para autocompletado de insumos
  useEffect(() => {
    let activo = true;
    void getCatalogoInsumos(organizationId).then((res) => {
      if (activo && res.success && res.data) {
        setCatalogo(res.data);
      }
    });
    return () => {
      activo = false;
    };
  }, [organizationId]);

  // Cargar historial previo de fórmulas del cliente
  useEffect(() => {
    if (!clienteId) return;
    let activo = true;
    void getHistorialFormulasCliente(organizationId, clienteId, 3).then((res) => {
      if (activo && res.success && res.data) {
        setHistorial(res.data as HistorialItem[]);
      }
    });
    return () => {
      activo = false;
    };
  }, [clienteId, organizationId]);

  const agregarInsumo = () => {
    setInsumos((actuales) => [
      ...actuales,
      {
        id: crypto.randomUUID(),
        nombre: "",
        cantidad: 40,
        unidad: "g",
        proporcion: null,
        descontarStock: true,
      },
    ]);
  };

  const actualizarInsumo = (id: string, cambios: Partial<FichaInsumo>) => {
    setInsumos((actuales) =>
      actuales.map((item) => (item.id === id ? { ...item, ...cambios } : item)),
    );
  };

  const quitarInsumo = (id: string) => {
    setInsumos((actuales) => (actuales.length > 1 ? actuales.filter((i) => i.id !== id) : actuales));
  };

  const seleccionarProductoCatalogo = (insumoId: string, productoId: string) => {
    const prod = catalogo.find((p) => p.id === productoId);
    if (!prod) return;
    actualizarInsumo(insumoId, {
      productoId: prod.id,
      nombre: prod.nombre,
      descontarStock: true,
    });
  };

  const replicarFormula = (item: HistorialItem) => {
    if (item.insumos && item.insumos.length > 0) {
      setInsumos(
        item.insumos.map((i) => ({
          ...i,
          id: crypto.randomUUID(),
          descontarStock: true,
        })),
      );
    } else if (item.formula) {
      setModoTextoLibre(true);
      setFormulaTextoLibre(item.formula);
    }
    if (item.tiempoPoseMinutos) {
      setTiempoPose(String(item.tiempoPoseMinutos));
    }
  };

  const insumosValidos = insumos.filter((i) => i.nombre.trim().length > 0 && i.cantidad > 0);
  const formulaResumen = formatearResumenFormula(
    modoTextoLibre ? [] : insumosValidos,
    modoTextoLibre ? formulaTextoLibre : undefined,
  );

  useEffect(() => {
    onInsumosChange?.(formulaResumen);
  }, [formulaResumen, onInsumosChange]);

  const ultimaFormula = historial[0];

  return (
    <div className="space-y-4">
      {/* Banner de última fórmula previa del cliente con botón Replicar */}
      {ultimaFormula ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-op-xs">
          <div className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-semibold text-primary">
              <Sparkles aria-hidden="true" className="size-3.5" /> Última fórmula del cliente
              <span className="text-muted-foreground font-normal">
                ({formatDate(ultimaFormula.createdAt)})
              </span>
            </span>
            <p className="mt-0.5 truncate font-mono text-foreground">
              {ultimaFormula.formula || "Sin fórmula resumida"}
              {ultimaFormula.tiempoPoseMinutos ? ` · Pose ${ultimaFormula.tiempoPoseMinutos} min` : ""}
            </p>
          </div>
          <Button
            className="h-8 gap-1 rounded-lg text-op-xs"
            onClick={() => replicarFormula(ultimaFormula)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Copy aria-hidden="true" className="size-3.5" /> Replicar en hoy
          </Button>
        </div>
      ) : null}

      {/* Selector modo recetario estructurado vs texto libre */}
      <div className="flex items-center justify-between">
        <span className="text-op-xs font-semibold uppercase tracking-wide text-foreground">
          {modoTextoLibre ? "Fórmula en texto libre" : "Recetario de mezcla al gramo"}
        </span>
        <button
          className="text-op-xs font-medium text-primary hover:underline"
          onClick={() => setModoTextoLibre(!modoTextoLibre)}
          type="button"
        >
          {modoTextoLibre ? "Cambiar a recetario guiado" : "Escribir texto libre"}
        </button>
      </div>

      {modoTextoLibre ? (
        <Field>
          <FieldLabel>Fórmula / mezcla química</FieldLabel>
          <Textarea
            name="formula"
            onChange={(e) => setFormulaTextoLibre(e.target.value)}
            placeholder="Ej. 60g 7.1 + 60ml oxidante 20 vol [1:1]"
            rows={3}
            value={formulaTextoLibre}
          />
        </Field>
      ) : (
        <div className="space-y-3">
          {insumos.map((insumo, index) => (
            <div
              className="relative space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-sm transition-all"
              key={insumo.id}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-op-xs font-semibold text-muted-foreground">
                  Insumo #{index + 1}
                </span>
                {insumos.length > 1 ? (
                  <Button
                    aria-label="Quitar insumo"
                    className="size-7 text-destructive hover:text-destructive"
                    onClick={() => quitarInsumo(insumo.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </Button>
                ) : null}
              </div>

              {/* Autocompletar desde catálogo o texto libre */}
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <Input
                    list={`catalogo-insumos-${insumo.id}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      const encontrado = catalogo.find(
                        (p) => p.nombre.toLowerCase() === val.toLowerCase(),
                      );
                      if (encontrado) {
                        seleccionarProductoCatalogo(insumo.id, encontrado.id);
                      } else {
                        actualizarInsumo(insumo.id, { nombre: val, productoId: null });
                      }
                    }}
                    placeholder="Tinte, decolorante, peróxido..."
                    value={insumo.nombre}
                  />
                  <datalist id={`catalogo-insumos-${insumo.id}`}>
                    {catalogo.map((prod) => (
                      <option key={prod.id} value={prod.nombre}>
                        {prod.sku ? `[${prod.sku}]` : ""} {prod.nombre}
                      </option>
                    ))}
                  </datalist>
                </div>

                {/* Proporción rápida */}
                <div className="flex items-center gap-1">
                  {PROPORCIONES_RAPIDAS.map((prop) => (
                    <button
                      className={`h-9 rounded-lg border px-2 text-op-xs font-medium transition-colors ${
                        insumo.proporcion === prop
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input bg-background text-muted-foreground hover:bg-muted"
                      }`}
                      key={prop}
                      onClick={() =>
                        actualizarInsumo(insumo.id, {
                          proporcion: insumo.proporcion === prop ? null : prop,
                        })
                      }
                      type="button"
                    >
                      {prop}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cantidad y Unidad */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-24">
                  <Input
                    min="0"
                    onChange={(e) =>
                      actualizarInsumo(insumo.id, {
                        cantidad: Number(e.target.value) || 0,
                      })
                    }
                    step="0.5"
                    type="number"
                    value={insumo.cantidad || ""}
                  />
                </div>
                <div className="w-24">
                  <Select
                    onChange={(e) =>
                      actualizarInsumo(insumo.id, {
                        unidad: e.target.value as UnidadInsumo,
                      })
                    }
                    value={insumo.unidad}
                  >
                    {UNIDADES_INSUMO.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Botones de incremento rápido (+10, +20) */}
                <div className="flex items-center gap-1">
                  {[10, 20, 30].map((step) => (
                    <button
                      className="h-8 rounded-md bg-muted px-2 text-op-xs font-semibold text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      key={step}
                      onClick={() =>
                        actualizarInsumo(insumo.id, {
                          cantidad: (insumo.cantidad || 0) + step,
                        })
                      }
                      type="button"
                    >
                      +{step}
                    </button>
                  ))}
                </div>

                {/* Descontar de inventario si está vinculado a producto */}
                <label className="ml-auto flex items-center gap-1.5 text-op-xs text-muted-foreground select-none">
                  <input
                    checked={Boolean(insumo.descontarStock)}
                    className="size-3.5 accent-primary"
                    onChange={(e) =>
                      actualizarInsumo(insumo.id, {
                        descontarStock: e.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  Descontar stock
                </label>
              </div>
            </div>
          ))}

          <Button
            className="w-full gap-1.5 rounded-xl border-dashed"
            onClick={agregarInsumo}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus aria-hidden="true" className="size-4" /> Agregar otro insumo / matiz
          </Button>

          {/* Resumen dinámico resultante */}
          {formulaResumen ? (
            <div className="rounded-xl bg-muted/60 px-3 py-2 text-op-xs">
              <span className="font-semibold text-muted-foreground">Fórmula resultante: </span>
              <span className="font-mono text-foreground font-medium">{formulaResumen}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Tiempo de pose */}
      <Field>
        <div className="flex items-center justify-between">
          <FieldLabel>Tiempo de pose (minutos)</FieldLabel>
          <div className="flex items-center gap-1">
            {TIEMPOS_POSE_RAPIDOS.map((m) => (
              <button
                className={`rounded-md px-2 py-0.5 text-op-xs font-medium transition-colors ${
                  tiempoPose === String(m)
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
                key={m}
                onClick={() => setTiempoPose(String(m))}
                type="button"
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
        <Input
          min="0"
          name="tiempoPoseMinutos"
          onChange={(e) => setTiempoPose(e.target.value)}
          placeholder="Ej. 35"
          step="1"
          type="number"
          value={tiempoPose}
        />
        {Number(tiempoPose) > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-op-xs text-amber-800 dark:text-amber-200">
            <span className="flex items-center gap-1.5 font-medium">
              <Timer aria-hidden="true" className="size-3.5 text-amber-600 dark:text-amber-400" />
              Tiempo de pose: <strong>{tiempoPose} min</strong>
            </span>
            <Button
              className="h-8 gap-1.5 rounded-lg border-amber-500/40 bg-card text-op-xs font-semibold text-foreground hover:bg-amber-500/20"
              onClick={() => {
                const min = Number(tiempoPose);
                if (!min || min <= 0) return;
                const nuevo = crearPoseTimer({
                  citaId: citaId ?? `cliente-${clienteId}`,
                  clienteNombre: clienteNombre || "Cliente",
                  servicioNombre:
                    servicioNombre ||
                    (formulaResumen ? `Pose: ${formulaResumen.slice(0, 24)}...` : "Coloración / Pose"),
                  minutos: min,
                });
                iniciarPoseTimerEnNavegador(nuevo);
                toast.success(`Cronómetro iniciado (${min} min)`);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              <Timer aria-hidden="true" className="size-3.5 text-primary" />
              Activar cronómetro
            </Button>
          </div>
        ) : null}
      </Field>

      {/* Captura fotográfica dual: Antes y Después */}
      <Field>
        <FieldLabel>Registro visual (Antes y Después)</FieldLabel>
        <AntesDespuesFotosField entidadId={entidadId} organizacionId={organizationId} />
      </Field>

      {/* Inputs ocultos serializados */}
      <input
        name="insumos"
        type="hidden"
        value={modoTextoLibre ? "[]" : JSON.stringify(insumosValidos)}
      />
      <input name="formula" type="hidden" value={formulaResumen} />
    </div>
  );
}
