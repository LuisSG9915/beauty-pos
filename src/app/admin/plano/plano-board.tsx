"use client";

import {
  Armchair,
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CircleAlert,
  Droplets,
  Layers,
  Map as MapIcon,
  Maximize,
  Package,
  Plus,
  RectangleHorizontal,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Table,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  desactivarMobiliario,
  desactivarPiso,
  desactivarUbicacion,
  moverElemento,
  reordenarPiso,
} from "@/app/admin/plano/actions";
import { useArrastrePlano, type SoltarPlano, type TipoElementoPlano } from "@/app/admin/plano/plano-drag";
import {
  MobiliarioForm,
  PisoForm,
  UbicacionForm,
} from "@/app/admin/plano/plano-forms";
import { MobiliarioSheet, UbicacionSheet } from "@/app/admin/plano/plano-sheets";
import { AdminCard } from "@/components/admin/page-header";
import { ToggleActivo } from "@/components/admin/toggle-activo";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  type MobiliarioTipo,
  type UbicacionTipo,
} from "@/db/schema/plano";
import { formatQuantity } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  MOBILIARIO_ESTADO_LABEL,
  MOBILIARIO_TIPO_LABEL,
  UBICACION_TIPO_COLOR,
  UBICACION_TIPO_LABEL,
  type ElementoPlano,
  type PlanoDatos,
  type PlanoMobiliario,
  type PlanoPiso,
  type PlanoRect,
  type PlanoUbicacion,
} from "@/modules/plano";

/** 1 celda = 32 px en el viewBox (regla del plan). */
const CELDA = 32;
/** Niveles de zoom del lienzo (escala el ancho/alto del svg; el viewBox no cambia). */
const NIVELES_ZOOM = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2;

type FiltroPlano = "todo" | "mercancia" | "muebles";
type Seleccion = { tipo: TipoElementoPlano; id: string } | null;
type FormAbierto =
  | { tipo: "piso"; piso?: PlanoPiso }
  | { tipo: "ubicacion"; ubicacion?: PlanoUbicacion }
  | { tipo: "mobiliario"; mueble?: PlanoMobiliario; tipoInicial?: MobiliarioTipo }
  | null;

/** Icono lucide por tipo de mueble (vocabulario visual del plano). */
const MUEBLE_ICONO: Record<MobiliarioTipo, typeof Armchair> = {
  asiento: Armchair,
  mesa: Table,
  tocador: Sparkles,
  lavacabezas: Droplets,
  camilla: BedDouble,
  carrito: ShoppingCart,
  espejo: RectangleHorizontal,
  otro: Package,
};

const FILTROS: Array<{ id: FiltroPlano; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "mercancia", label: "Mercancía" },
  { id: "muebles", label: "Muebles" },
];

type RectMap = Record<string, PlanoRect>;

/**
 * Tablero del plano: barra de herramientas (pisos, búsqueda de producto,
 * filtros, zoom y altas), lienzo SVG con arrastre (mouse y pulsación larga
 * táctil) y panel lateral por elemento. Con `sucursales.editar` el plano es
 * editable siempre; sin él queda solo de consulta.
 */
export function PlanoBoard({
  datos,
  moneda = "MXN",
  organizationId,
  puedeEditarCantidades,
  puedeEditarPlano,
  productoInicial,
  sucursalId,
}: {
  datos: PlanoDatos;
  /** Moneda para mostrar el costo de muebles. */
  moneda?: string;
  organizationId: string;
  puedeEditarCantidades: boolean;
  puedeEditarPlano: boolean;
  productoInicial?: string;
  sucursalId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [pisoActivoId, setPisoActivoId] = useState<string | null>(datos.pisos[0]?.id ?? null);
  const [filtro, setFiltro] = useState<FiltroPlano>("todo");
  const [productoId, setProductoId] = useState<string | null>(productoInicial ?? null);
  const [zoom, setZoom] = useState(1);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [formAbierto, setFormAbierto] = useState<FormAbierto>(null);

  // Si el piso activo desaparece (otro usuario lo quitó), se cae al primero.
  const piso = useMemo(
    () => datos.pisos.find((item) => item.id === pisoActivoId) ?? datos.pisos[0] ?? null,
    [datos.pisos, pisoActivoId],
  );

  const ubicacionesPiso = useMemo(
    () => datos.ubicaciones.filter((item) => item.pisoId === piso?.id),
    [datos.ubicaciones, piso],
  );
  const mobiliarioPiso = useMemo(
    () => datos.mobiliario.filter((item) => item.pisoId === piso?.id),
    [datos.mobiliario, piso],
  );
  const mueblesSinColocar = useMemo(
    () => datos.mobiliario.filter((item) => !item.pisoId),
    [datos.mobiliario],
  );

  /** Elementos del piso activo para validar encimados durante el arrastre. */
  const elementosPiso: ElementoPlano[] = useMemo(
    () => [
      ...ubicacionesPiso.map((u) => ({ id: u.id, x: u.x, y: u.y, ancho: u.ancho, alto: u.alto })),
      ...mobiliarioPiso.map((m) => ({ id: m.id, x: m.x, y: m.y, ancho: m.ancho, alto: m.alto })),
    ],
    [ubicacionesPiso, mobiliarioPiso],
  );

  /* Posiciones optimistas: el arrastre mueve el rectángulo de inmediato y la
     acción lo confirma; si el servidor rechaza, vuelve a su sitio. */
  const rectsBase = useMemo<RectMap>(() => {
    const mapa: RectMap = {};
    for (const u of datos.ubicaciones) mapa[`u:${u.id}`] = { x: u.x, y: u.y, ancho: u.ancho, alto: u.alto };
    for (const m of datos.mobiliario) mapa[`m:${m.id}`] = { x: m.x, y: m.y, ancho: m.ancho, alto: m.alto };
    return mapa;
  }, [datos]);
  const [rectsOpt, aplicarRect] = useOptimistic(
    rectsBase,
    (mapa: RectMap, parche: { clave: string; rect: PlanoRect }) => ({ ...mapa, [parche.clave]: parche.rect }),
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /** FormData de un rectángulo para `moverElemento` (mover y deshacer). */
  const dataDeRect = (id: string, tipo: string, rect: PlanoRect) => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("tipo", tipo);
    data.set("id", id);
    data.set("x", String(rect.x));
    data.set("y", String(rect.y));
    data.set("ancho", String(rect.ancho));
    data.set("alto", String(rect.alto));
    return data;
  };

  const onSoltar = (soltado: SoltarPlano) => {
    const clave = `${soltado.tipo === "ubicacion" ? "u" : "m"}:${soltado.id}`;
    startTransition(async () => {
      aplicarRect({ clave, rect: soltado.rect });
      const result = await moverElemento(dataDeRect(soltado.id, soltado.tipo, soltado.rect));
      if (!result.success) {
        toast.error("No se pudo mover el elemento.", result.error);
        aplicarRect({ clave, rect: soltado.origen });
        return;
      }
      // Deshacer: regresa la figura a su rectángulo de origen.
      let toastId = "";
      toastId = toast.show({
        title: "Elemento movido.",
        type: "success",
        timeout: 5000,
        actionProps: {
          children: "Deshacer",
          onClick: () => {
            toast.close(toastId);
            startTransition(async () => {
              aplicarRect({ clave, rect: soltado.origen });
              const reverso = await moverElemento(dataDeRect(soltado.id, soltado.tipo, soltado.origen));
              if (!reverso.success) {
                toast.error("No se pudo deshacer el movimiento.", reverso.error);
                aplicarRect({ clave, rect: soltado.rect });
              }
            });
          },
        },
      });
    });
  };

  const { arrastre, iniciarGesto, consumirClick } = useArrastrePlano({
    svgRef,
    scrollRef,
    columnas: piso?.columnas ?? 0,
    filas: piso?.filas ?? 0,
    elementos: elementosPiso,
    disabled: !puedeEditarPlano,
    onSoltar,
  });

  const productoSel = productoId ? datos.productos.find((p) => p.id === productoId) : undefined;
  /** Ubicaciones que contienen el producto buscado (para el anillo de acento). */
  const ubicacionesConProducto = useMemo(() => {
    if (!productoId) return new Set<string>();
    return new Set(
      datos.ubicaciones
        .filter((u) => u.productos.some((item) => item.productoId === productoId))
        .map((u) => u.id),
    );
  }, [datos.ubicaciones, productoId]);
  const sinUbicar = productoSel ? Number(productoSel.stock) - Number(productoSel.ubicado) : null;

  /* ---- Reordenar pisos (botones ← → del sheet de piso) ---- */
  const reordenar = (pisoId: string, direccion: "izquierda" | "derecha") => {
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("pisoId", pisoId);
    data.set("direccion", direccion);
    startTransition(async () => {
      const result = await reordenarPiso(data);
      if (!result.success) {
        toast.error("No se pudo reordenar el piso.", result.error);
        return;
      }
      router.refresh();
    });
  };

  /* ---- Supr sobre un elemento enfocado lo quita del plano ---- */
  const teclaElemento = (
    event: ReactKeyboardEvent<SVGGElement>,
    elemento: { id: string; tipo: TipoElementoPlano; nombre: string },
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSeleccion({ tipo: elemento.tipo, id: elemento.id });
      return;
    }
    if (!puedeEditarPlano || (event.key !== "Delete" && event.key !== "Backspace")) return;
    event.preventDefault();
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("id", elemento.id);
    data.set("activar", "false");
    const accion = elemento.tipo === "ubicacion" ? desactivarUbicacion : desactivarMobiliario;
    startTransition(async () => {
      const result = await accion(data);
      if (result.error) {
        toast.error(`No se pudo quitar ${elemento.tipo === "ubicacion" ? "la ubicación" : "el mueble"}.`, result.error);
        return;
      }
      toast.success(`${elemento.nombre} quitado del plano.`);
      router.refresh();
    });
  };

  const clickElemento = (tipo: TipoElementoPlano, id: string) => {
    if (consumirClick()) return;
    setSeleccion({ tipo, id });
  };

  const ubicacionSel =
    seleccion?.tipo === "ubicacion"
      ? (datos.ubicaciones.find((u) => u.id === seleccion.id) ?? null)
      : null;
  const muebleSel =
    seleccion?.tipo === "mobiliario"
      ? (datos.mobiliario.find((m) => m.id === seleccion.id) ?? null)
      : null;

  const verUbicaciones = filtro !== "muebles";
  const verMuebles = filtro !== "mercancia";

  /* --------------------------- figuras SVG --------------------------- */

  const figuraUbicacion = (u: PlanoUbicacion) => {
    const clave = `u:${u.id}`;
    const base = rectsOpt[clave] ?? { x: u.x, y: u.y, ancho: u.ancho, alto: u.alto };
    const esArrastrado = arrastre?.id === u.id;
    const rect = esArrastrado ? arrastre.rect : base;
    const color = UBICACION_TIPO_COLOR[u.tipo as UbicacionTipo] ?? "var(--chart-5)";
    const resaltada = ubicacionesConProducto.has(u.id);
    const piezas = u.productos.reduce((total, item) => total + Number(item.cantidad), 0);
    const nombreVisible = u.nombre.slice(0, Math.max(4, Math.floor((rect.ancho * CELDA - 14) / 6.2)));
    return (
      <g
        aria-label={`${u.nombre}, ${UBICACION_TIPO_LABEL[u.tipo as UbicacionTipo] ?? u.tipo}`}
        className={cn("outline-none", esArrastrado && "opacity-60")}
        key={u.id}
        onClick={() => clickElemento("ubicacion", u.id)}
        onKeyDown={(event) => teclaElemento(event, { id: u.id, tipo: "ubicacion", nombre: u.nombre })}
        onPointerDown={(event: ReactPointerEvent<SVGGElement>) =>
          iniciarGesto(event, { id: u.id, tipo: "ubicacion", x: u.x, y: u.y, ancho: u.ancho, alto: u.alto }, "mover")
        }
        role="button"
        style={puedeEditarPlano ? { touchAction: "pan-x pan-y", cursor: "grab" } : { cursor: "pointer" }}
        tabIndex={0}
        transform={`translate(${rect.x * CELDA} ${rect.y * CELDA})`}
      >
        <rect
          className={resaltada ? "anim-pulso-svg" : undefined}
          height={rect.alto * CELDA - 6}
          rx={8}
          style={{
            fill: `color-mix(in srgb, ${color} 20%, var(--card))`,
            stroke: resaltada ? "var(--primary)" : color,
            strokeWidth: resaltada ? 2.5 : 1.4,
          }}
          width={rect.ancho * CELDA - 6}
          x={3}
          y={3}
        />
        <text
          aria-hidden="true"
          className="select-none"
          fontSize={11}
          fontWeight={600}
          style={{ fill: "var(--foreground)", pointerEvents: "none" }}
          x={8}
          y={15}
        >
          {nombreVisible}
        </text>
        {piezas > 0 && rect.alto > 1 ? (
          <text
            aria-hidden="true"
            className="select-none"
            fontSize={10}
            style={{ fill: "var(--muted-foreground)", pointerEvents: "none" }}
            x={8}
            y={rect.alto * CELDA - 12}
          >
            {formatQuantity(piezas)} pzas
          </text>
        ) : null}
        {puedeEditarPlano ? (
          <rect
            aria-label={`Cambiar tamaño de ${u.nombre}`}
            height={18}
            onPointerDown={(event) =>
              iniciarGesto(
                event,
                { id: u.id, tipo: "ubicacion", x: u.x, y: u.y, ancho: u.ancho, alto: u.alto },
                "redimensionar",
              )
            }
            rx={4}
            style={{ fill: "var(--primary)", cursor: "nwse-resize", touchAction: "none" }}
            width={18}
            x={rect.ancho * CELDA - 22}
            y={rect.alto * CELDA - 22}
          />
        ) : null}
      </g>
    );
  };

  const figuraMueble = (m: PlanoMobiliario) => {
    const clave = `m:${m.id}`;
    const base = rectsOpt[clave] ?? { x: m.x, y: m.y, ancho: m.ancho, alto: m.alto };
    const esArrastrado = arrastre?.id === m.id;
    const rect = esArrastrado ? arrastre.rect : base;
    const Icono = MUEBLE_ICONO[m.tipo as MobiliarioTipo] ?? Package;
    const nombreVisible = m.nombre.slice(0, Math.max(4, Math.floor((rect.ancho * CELDA - 14) / 6.2)));
    const enMantenimiento = m.estado === "mantenimiento";
    const deBaja = m.estado === "baja";
    const sesion = m.sesionActiva;
    const ocupado = Boolean(sesion);
    const enPose = Boolean(sesion?.poseMinutos);
    const listoCobro = sesion?.ventaEstado === "en_proceso" || (sesion?.estado === "completada" && Boolean(sesion?.ventaId));

    const fillColor = enMantenimiento
      ? "var(--warning-soft)"
      : enPose
        ? "var(--warning-soft)"
        : listoCobro
          ? "var(--info-soft, #e0f2fe)"
          : ocupado
            ? "var(--success-soft)"
            : "var(--muted)";

    const strokeColor = enMantenimiento
      ? "var(--warning)"
      : enPose
        ? "var(--warning)"
        : listoCobro
          ? "var(--info, #0284c7)"
          : ocupado
            ? "var(--success)"
            : "var(--muted-foreground)";

    const strokeOpacity = enMantenimiento || ocupado || enPose || listoCobro ? 0.95 : 0.45;
    const strokeWidth = ocupado || enPose || listoCobro ? 2 : 1.4;

    const labelEstadoVivo = enPose
      ? `En pose (${sesion?.clienteNombre ?? ""})`
      : listoCobro
        ? `Listo para cobro (${sesion?.clienteNombre ?? ""})`
        : ocupado
          ? `En atención (${sesion?.clienteNombre ?? ""})`
          : MOBILIARIO_ESTADO_LABEL[m.estado as keyof typeof MOBILIARIO_ESTADO_LABEL] ?? m.estado;

    return (
      <g
        aria-label={`${m.nombre}, ${MOBILIARIO_TIPO_LABEL[m.tipo as MobiliarioTipo] ?? m.tipo}, ${labelEstadoVivo}`}
        className={cn("outline-none", esArrastrado && "opacity-60", deBaja && "opacity-45")}
        key={m.id}
        onClick={() => clickElemento("mobiliario", m.id)}
        onKeyDown={(event) => teclaElemento(event, { id: m.id, tipo: "mobiliario", nombre: m.nombre })}
        onPointerDown={(event: ReactPointerEvent<SVGGElement>) =>
          iniciarGesto(event, { id: m.id, tipo: "mobiliario", x: m.x, y: m.y, ancho: m.ancho, alto: m.alto }, "mover")
        }
        role="button"
        style={puedeEditarPlano ? { touchAction: "pan-x pan-y", cursor: "grab" } : { cursor: "pointer" }}
        tabIndex={0}
        transform={`translate(${rect.x * CELDA} ${rect.y * CELDA})`}
      >
        <rect
          height={rect.alto * CELDA - 6}
          rx={8}
          style={{
            fill: fillColor,
            stroke: strokeColor,
            strokeOpacity,
            strokeWidth,
            strokeDasharray: deBaja ? "5 3" : undefined,
          }}
          width={rect.ancho * CELDA - 6}
          x={3}
          y={3}
        />
        <Icono
          aria-hidden="true"
          height={14}
          style={{ color: enMantenimiento || enPose ? "var(--warning)" : ocupado ? "var(--success)" : "var(--muted-foreground)" }}
          width={14}
          x={8}
          y={7}
        />
        <text
          aria-hidden="true"
          className="select-none"
          fontSize={11}
          fontWeight={600}
          style={{ fill: "var(--foreground)", pointerEvents: "none" }}
          x={26}
          y={18}
        >
          {nombreVisible}
        </text>
        {ocupado && sesion?.clienteNombre && rect.alto >= 1.5 ? (
          <text
            aria-hidden="true"
            className="select-none font-medium truncate"
            fontSize={9.5}
            style={{
              fill: enPose ? "var(--warning)" : ocupado ? "var(--success)" : "var(--foreground)",
              pointerEvents: "none",
            }}
            x={8}
            y={Math.min(rect.alto * CELDA - 10, 32)}
          >
            {enPose ? `⏱️ Pose: ${sesion.clienteNombre}` : sesion.clienteNombre}
          </text>
        ) : null}
        {puedeEditarPlano ? (
          <rect
            aria-label={`Cambiar tamaño de ${m.nombre}`}
            height={18}
            onPointerDown={(event) =>
              iniciarGesto(
                event,
                { id: m.id, tipo: "mobiliario", x: m.x, y: m.y, ancho: m.ancho, alto: m.alto },
                "redimensionar",
              )
            }
            rx={4}
            style={{ fill: "var(--primary)", cursor: "nwse-resize", touchAction: "none" }}
            width={18}
            x={rect.ancho * CELDA - 22}
            y={rect.alto * CELDA - 22}
          />
        ) : null}
      </g>
    );
  };

  /* ----------------------------- render ------------------------------ */

  if (datos.pisos.length === 0) {
    return (
      <>
        <EmptyState
          action={
            puedeEditarPlano ? (
              <Button
                data-action-clave="1"
                data-action-id="plano.piso.abrir_formulario"
                onClick={() => setFormAbierto({ tipo: "piso" })}
                size="lg"
              >
                <Plus aria-hidden="true" /> Agregar piso
              </Button>
            ) : undefined
          }
          description={
            puedeEditarPlano
              ? "Crea el primer piso de la sucursal para colocar ubicaciones de mercancía y muebles."
              : "La sucursal aún no tiene un plano configurado."
          }
          icon={MapIcon}
          title="Sin plano todavía"
        />
        {formulario()}
      </>
    );
  }

  function formulario() {
    if (!formAbierto) return null;
    const cerrar = () => setFormAbierto(null);
    if (formAbierto.tipo === "piso") {
      const pisoEdit = formAbierto.piso ?? null;
      const idx = datos.pisos.findIndex((item) => item.id === pisoEdit?.id);
      return (
        <Sheet onOpenChange={(open) => !open && cerrar()} open>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{formAbierto.piso ? "Editar piso" : "Agregar piso"}</SheetTitle>
              <SheetDescription>
                La cuadrícula se mide en celdas; cada celda son 32 px en pantalla.
              </SheetDescription>
            </SheetHeader>
            <PisoForm
              onGuardado={cerrar}
              organizationId={organizationId}
              piso={formAbierto.piso}
              sucursalId={sucursalId}
            />
            {pisoEdit ? (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                {datos.pisos.length > 1 ? (
                  <div>
                    <p className="mb-2 text-op-xs font-medium text-muted-foreground">Orden en las pestañas</p>
                    <div className="flex gap-2">
                      <Button
                        data-action-id="plano.piso.reordenar.izquierda"
                        disabled={pending || idx <= 0}
                        onClick={() => reordenar(pisoEdit.id, "izquierda")}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <ArrowLeft aria-hidden="true" className="size-3.5" /> Mover antes
                      </Button>
                      <Button
                        data-action-id="plano.piso.reordenar.derecha"
                        disabled={pending || idx < 0 || idx >= datos.pisos.length - 1}
                        onClick={() => reordenar(pisoEdit.id, "derecha")}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Mover después <ArrowRight aria-hidden="true" className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}
                <ToggleActivo
                  action={desactivarPiso}
                  activo
                  confirmHint="No puede quitarse un piso que todavía tiene ubicaciones o muebles encima."
                  entidad="piso"
                  id={pisoEdit.id}
                  labels={{ baja: "Quitar piso", alta: "Reactivar", articulo: "el", participioBaja: "quitado", participioAlta: "reactivado" }}
                  nombre={pisoEdit.nombre}
                  organizationId={organizationId}
                  telemetryBase="plano.piso"
                />
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
      );
    }
    if (formAbierto.tipo === "ubicacion") {
      return (
        <Sheet onOpenChange={(open) => !open && cerrar()} open>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{formAbierto.ubicacion ? "Editar ubicación" : "Agregar ubicación"}</SheetTitle>
              <SheetDescription>
                {formAbierto.ubicacion
                  ? "Nombre y tipo; la posición se arrastra en el plano."
                  : "Aparece en la primera celda libre del piso; luego la arrastras a su lugar."}
              </SheetDescription>
            </SheetHeader>
            <UbicacionForm
              onGuardado={cerrar}
              organizationId={organizationId}
              pisos={datos.pisos}
              pisoInicial={piso?.id}
              sucursalId={sucursalId}
              ubicacion={formAbierto.ubicacion}
            />
          </SheetContent>
        </Sheet>
      );
    }
    return (
      <Sheet onOpenChange={(open) => !open && cerrar()} open>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{formAbierto.mueble ? "Editar mueble" : "Agregar mueble"}</SheetTitle>
            <SheetDescription>
              El mueble puede quedar sin colocar o aparecer en un piso del plano.
            </SheetDescription>
          </SheetHeader>
          <MobiliarioForm
            mueble={formAbierto.mueble}
            onGuardado={cerrar}
            organizationId={organizationId}
            pisos={datos.pisos}
            pisoInicial={piso?.id}
            recursos={datos.recursos}
            sucursalId={sucursalId}
            tipoInicial={formAbierto.tipoInicial}
          />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="space-y-4">
      {/* -------------------- barra de herramientas -------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div aria-label="Pisos del plano" className="flex items-center gap-1 rounded-xl border border-border bg-card p-1" role="group">
          {datos.pisos.map((item) => (
            <button
              aria-pressed={item.id === piso?.id}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
                item.id === piso?.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              data-action-id="plano.piso.cambiar"
              key={item.id}
              onClick={() => setPisoActivoId(item.id)}
              type="button"
            >
              <Layers aria-hidden="true" className="size-3.5" />
              {item.nombre}
            </button>
          ))}
          {puedeEditarPlano ? (
            <>
              <button
                aria-label="Agregar piso"
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-primary transition-colors hover:bg-accent/60"
                data-action-id="plano.piso.abrir_formulario"
                onClick={() => setFormAbierto({ tipo: "piso" })}
                type="button"
              >
                <Plus aria-hidden="true" className="size-3.5" /> Piso
              </button>
              {piso ? (
                <button
                  aria-label={`Editar piso ${piso.nombre}`}
                  className="inline-flex min-h-9 items-center rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  data-action-id="plano.piso.editar"
                  onClick={() => setFormAbierto({ tipo: "piso", piso })}
                  type="button"
                >
                  <Settings aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="min-w-52 flex-1 sm:max-w-xs">
          <Combobox
            clearable
            emptyMessage="Sin productos activos."
            items={datos.productos.map((producto) => ({
              value: producto.id,
              label: producto.nombre,
              description: producto.sku,
              keywords: [producto.sku],
            }))}
            onValueChange={(value) => setProductoId(value)}
            placeholder="Buscar producto en el plano…"
            value={productoId}
          />
        </div>

        <div aria-label="Qué mostrar en el plano" className="flex items-center gap-1 rounded-xl border border-border bg-card p-1" role="group">
          {FILTROS.map((item) => (
            <button
              aria-pressed={filtro === item.id}
              className={cn(
                "inline-flex min-h-9 items-center rounded-lg px-3 text-op-xs font-medium transition-colors",
                filtro === item.id
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              data-action-id={`plano.filtro.${item.id}`}
              key={item.id}
              onClick={() => setFiltro(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div aria-label="Zoom del plano" className="flex items-center gap-1 rounded-xl border border-border bg-card p-1" role="group">
          <button
            aria-label="Alejar"
            className="inline-flex min-h-9 items-center rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
            data-action-id="plano.zoom.menos"
            disabled={Boolean(arrastre) || zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, NIVELES_ZOOM.filter((n) => n < z - 0.001).pop() ?? ZOOM_MIN))}
            type="button"
          >
            <ZoomOut aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Restablecer zoom al 100%"
            className="inline-flex min-h-9 min-w-12 items-center justify-center rounded-lg px-1 text-op-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            data-action-id="plano.zoom.restablecer"
            onClick={() => setZoom(1)}
            type="button"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            aria-label="Acercar"
            className="inline-flex min-h-9 items-center rounded-lg px-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
            data-action-id="plano.zoom.mas"
            disabled={Boolean(arrastre) || zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, NIVELES_ZOOM.find((n) => n > z + 0.001) ?? ZOOM_MAX))}
            type="button"
          >
            <ZoomIn aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Ajustar el piso completo en pantalla"
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-op-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
            data-action-id="plano.zoom.ajustar"
            disabled={Boolean(arrastre) || !piso}
            onClick={() => {
              const contenedor = scrollRef.current;
              if (!contenedor || !piso) return;
              const ajuste = (contenedor.clientWidth - 24) / (piso.columnas * CELDA);
              setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, ajuste)));
            }}
            type="button"
          >
            <Maximize aria-hidden="true" className="size-3.5" /> Ajustar
          </button>
        </div>

        {puedeEditarPlano ? (
          <div className="flex items-center gap-2" role="group" aria-label="Agregar al plano">
            <Button
              data-action-clave="1"
              data-action-id="plano.ubicacion.abrir_formulario"
              disabled={pending || !piso}
              onClick={() => setFormAbierto({ tipo: "ubicacion" })}
              size="sm"
            >
              <Plus aria-hidden="true" className="size-3.5" /> Ubicación
            </Button>
            <Button
              data-action-id="plano.mobiliario.abrir_formulario"
              disabled={pending}
              onClick={() => setFormAbierto({ tipo: "mobiliario" })}
              size="sm"
              variant="outline"
            >
              <Plus aria-hidden="true" className="size-3.5" /> Mueble
            </Button>
          </div>
        ) : null}
      </div>

      {/* Guía de gestos: táctil con pulsación larga; escritorio arrastra directo. */}
      {puedeEditarPlano ? (
        <p className="rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-op-xs text-muted-foreground">
          <span className="md:hidden">Mantén presionado un elemento para moverlo; toca uno para ver sus opciones.</span>
          <span className="hidden md:inline">Arrastra los elementos para moverlos, tira de la esquina azul para cambiar el tamaño; con Supr sobre un elemento seleccionado lo quitas.</span>
        </p>
      ) : (
        <p className="rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-op-xs text-muted-foreground">
          Puedes ver el plano y consultar cada elemento; para modificarlo se necesita permiso de Sucursales.
        </p>
      )}

      {/* Resumen del producto buscado: stock real, ubicado y sin ubicar. */}
      {productoSel && sinUbicar !== null ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <Search aria-hidden="true" className="size-4 text-primary" />
          <p className="text-sm font-medium text-foreground">{productoSel.nombre}</p>
          <p className="text-op-xs text-muted-foreground">
            Stock {formatQuantity(Number(productoSel.stock))}
            {productoSel.unidad ? ` ${productoSel.unidad}` : ""} · en ubicaciones{" "}
            {formatQuantity(Number(productoSel.ubicado))}
          </p>
          <StatusBadge tone={sinUbicar < 0 ? "warning" : "neutral"}>
            {`Sin ubicar: ${formatQuantity(sinUbicar)}`}
          </StatusBadge>
          {sinUbicar < 0 ? (
            <p className="flex items-center gap-1.5 text-op-xs font-medium text-warning" role="alert">
              <CircleAlert aria-hidden="true" className="size-3.5" />
              Las cantidades por ubicación están desactualizadas: súbelas o reubícalas.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------- lienzo ---------------------------- */}
      {piso ? (
        <div
          className="relative overflow-auto rounded-2xl border border-border bg-card"
          ref={scrollRef}
          style={{ maxHeight: "min(72vh, 42rem)" }}
        >
          <svg
            aria-label={`Plano de ${piso.nombre}: ${piso.columnas} por ${piso.filas} celdas`}
            className="block"
            height={piso.filas * CELDA * zoom}
            ref={svgRef}
            role="img"
            viewBox={`0 0 ${piso.columnas * CELDA} ${piso.filas * CELDA}`}
            width={piso.columnas * CELDA * zoom}
          >
            <defs>
              <pattern height={CELDA} id="plano-cuadricula" patternUnits="userSpaceOnUse" width={CELDA}>
                <path
                  d={`M ${CELDA} 0 L 0 0 0 ${CELDA}`}
                  fill="none"
                  style={{ stroke: "var(--border)" }}
                  strokeOpacity={arrastre ? 0.85 : 0.55}
                  strokeWidth={1}
                />
              </pattern>
            </defs>
            <rect
              height={piso.filas * CELDA}
              style={{ fill: "var(--card)" }}
              width={piso.columnas * CELDA}
            />
            <rect fill="url(#plano-cuadricula)" height={piso.filas * CELDA} width={piso.columnas * CELDA} />
            {verUbicaciones ? ubicacionesPiso.map(figuraUbicacion) : null}
            {verMuebles ? mobiliarioPiso.map(figuraMueble) : null}
            {/* Fantasma de validez sobre el origen mientras se arrastra. */}
            {arrastre ? (
              <rect
                aria-hidden="true"
                height={arrastre.rect.alto * CELDA - 6}
                rx={8}
                style={{
                  fill: "none",
                  stroke: arrastre.valido ? "var(--success)" : "var(--destructive)",
                  strokeDasharray: "6 4",
                  strokeWidth: 2,
                  pointerEvents: "none",
                }}
                width={arrastre.rect.ancho * CELDA - 6}
                x={arrastre.rect.x * CELDA + 3}
                y={arrastre.rect.y * CELDA + 3}
              />
            ) : null}
          </svg>
          {/* Guía cuando el piso no tiene elementos: el lienzo se veía "roto". */}
          {ubicacionesPiso.length === 0 && mobiliarioPiso.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto mx-4 max-w-xs rounded-2xl border border-border bg-card/95 px-5 py-4 text-center shadow-sm">
                <MapIcon aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">Este piso está vacío</p>
                <p className="mt-1 text-op-xs text-muted-foreground">
                  {puedeEditarPlano
                    ? "Agrega una ubicación para tu mercancía o un mueble, y acomódalo arrastrándolo."
                    : "Todavía no hay ubicaciones ni muebles en este piso."}
                </p>
                {puedeEditarPlano ? (
                  <div className="mt-3 flex justify-center gap-2">
                    <Button
                      data-action-id="plano.ubicacion.abrir_formulario.vacio"
                      onClick={() => setFormAbierto({ tipo: "ubicacion" })}
                      size="sm"
                    >
                      <Plus aria-hidden="true" className="size-3.5" /> Ubicación
                    </Button>
                    <Button
                      data-action-id="plano.mobiliario.abrir_formulario.vacio"
                      onClick={() => setFormAbierto({ tipo: "mobiliario" })}
                      size="sm"
                      variant="outline"
                    >
                      <Plus aria-hidden="true" className="size-3.5" /> Mueble
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Muebles registrados sin colocar en el plano. */}
      {mueblesSinColocar.length > 0 ? (
        <AdminCard
          description="Están registrados pero no aparecen en el mapa; asígnales un piso desde su panel."
          title="Muebles sin colocar"
        >
          <ul className="flex flex-wrap gap-2">
            {mueblesSinColocar.map((mueble) => (
              <li className="flex items-center gap-1" key={mueble.id}>
                <button
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-op-xs font-medium text-foreground transition-colors hover:bg-muted/60"
                  data-action-id="plano.mobiliario.ver"
                  onClick={() => setSeleccion({ tipo: "mobiliario", id: mueble.id })}
                  type="button"
                >
                  <Package aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  {mueble.nombre}
                </button>
                {puedeEditarPlano ? (
                  <ToggleActivo
                    action={desactivarMobiliario}
                    activo
                    entidad="mueble"
                    id={mueble.id}
                    labels={{ baja: "Quitar", alta: "Reactivar", articulo: "el", participioBaja: "quitado", participioAlta: "reactivado" }}
                    nombre={mueble.nombre}
                    organizationId={organizationId}
                    telemetryBase="plano.mobiliario"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </AdminCard>
      ) : null}

      {/* --------------------- vista como lista (a11y) ------------------- */}
      <details className="anim-entrada rounded-2xl border border-border bg-card p-5">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          Ver como lista
        </summary>
        {piso ? (
          <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
            <section aria-label={`Ubicaciones de ${piso.nombre}`}>
              <h3 className="text-op-xs font-semibold uppercase tracking-wide text-primary">Mercancía</h3>
              {ubicacionesPiso.length === 0 ? (
                <p className="mt-2 text-op-xs text-muted-foreground">Sin ubicaciones en este piso.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {ubicacionesPiso.map((u) => (
                    <li className="flex items-start gap-1.5" key={u.id}>
                      <button
                        className="w-full rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-muted/60"
                        data-action-id="plano.ubicacion.ver"
                        onClick={() => setSeleccion({ tipo: "ubicacion", id: u.id })}
                        type="button"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{u.nombre}</span>
                            <span className="block text-op-xs text-muted-foreground">
                              {UBICACION_TIPO_LABEL[u.tipo as UbicacionTipo] ?? u.tipo}
                              {u.productos.length > 0
                                ? ` · ${u.productos.map((p) => p.nombre).join(", ")}`
                                : " · sin mercancía"}
                            </span>
                          </span>
                          <span className="shrink-0 text-op-xs tabular-nums text-muted-foreground">
                            {formatQuantity(u.productos.reduce((t, p) => t + Number(p.cantidad), 0))} pzas
                          </span>
                        </span>
                      </button>
                      {puedeEditarPlano ? (
                        <ToggleActivo
                          action={desactivarUbicacion}
                          activo
                          confirmHint="Si todavía tiene mercancía asignada, habrá que pasarla a otra ubicación primero."
                          entidad="ubicación"
                          id={u.id}
                          labels={{ baja: "Quitar", alta: "Reactivar", articulo: "la", participioBaja: "quitada", participioAlta: "reactivada" }}
                          nombre={u.nombre}
                          organizationId={organizationId}
                          telemetryBase="plano.ubicacion"
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label={`Muebles de ${piso.nombre}`}>
              <h3 className="text-op-xs font-semibold uppercase tracking-wide text-primary">Muebles</h3>
              {mobiliarioPiso.length === 0 && mueblesSinColocar.length === 0 ? (
                <p className="mt-2 text-op-xs text-muted-foreground">Sin muebles registrados.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {mobiliarioPiso.map((m) => (
                    <li className="flex items-start gap-1.5" key={m.id}>
                      <button
                        className="w-full rounded-xl border border-border px-3 py-2 text-left transition-colors hover:bg-muted/60"
                        data-action-id="plano.mobiliario.ver"
                        onClick={() => setSeleccion({ tipo: "mobiliario", id: m.id })}
                        type="button"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{m.nombre}</span>
                            <span className="block text-op-xs text-muted-foreground">
                              {MOBILIARIO_TIPO_LABEL[m.tipo as MobiliarioTipo] ?? m.tipo}
                              {m.recursoNombre ? ` · ${m.recursoNombre}` : ""}
                            </span>
                          </span>
                          <StatusBadge
                            tone={m.estado === "mantenimiento" ? "warning" : m.estado === "baja" ? "neutral" : "success"}
                          >
                            {MOBILIARIO_ESTADO_LABEL[m.estado as keyof typeof MOBILIARIO_ESTADO_LABEL] ?? m.estado}
                          </StatusBadge>
                        </span>
                      </button>
                      {puedeEditarPlano ? (
                        <ToggleActivo
                          action={desactivarMobiliario}
                          activo
                          confirmHint="Dejará de verse en el plano; su recurso de agenda ligado no se toca."
                          entidad="mueble"
                          id={m.id}
                          labels={{ baja: "Quitar", alta: "Reactivar", articulo: "el", participioBaja: "quitado", participioAlta: "reactivado" }}
                          nombre={m.nombre}
                          organizationId={organizationId}
                          telemetryBase="plano.mobiliario"
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </details>

      {/* --------------------- paneles laterales ------------------------ */}
      <UbicacionSheet
        onClose={() => setSeleccion(null)}
        onEditar={(ubicacion) => setFormAbierto({ tipo: "ubicacion", ubicacion })}
        organizationId={organizationId}
        puedeEditarCantidades={puedeEditarCantidades}
        puedeEditarPlano={puedeEditarPlano}
        productos={datos.productos}
        ubicacion={ubicacionSel}
      />
      <MobiliarioSheet
        moneda={moneda}
        mueble={muebleSel}
        onClose={() => setSeleccion(null)}
        onEditar={(mueble) => setFormAbierto({ tipo: "mobiliario", mueble })}
        organizationId={organizationId}
        puedeEditarPlano={puedeEditarPlano}
      />
      {formulario()}
    </div>
  );
}
