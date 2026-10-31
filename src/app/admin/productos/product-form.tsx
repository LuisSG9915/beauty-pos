"use client";

import { Camera, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { saveProduct, type ProductActionState } from "@/app/admin/productos/actions";
import { ProductImageField } from "@/components/media-image-field";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, Input, Select, Textarea } from "@/components/ui/field";
import { ActionFeedback, useToast } from "@/components/ui/toast";
import {
  CAMPO_FORM_POR_CAMPO_IA,
  type CapturaProductoRespuesta,
  fusionarBorrador,
} from "@/lib/ia/borrador";
import { formatCurrency } from "@/lib/format";
import { buildAdminHref } from "@/lib/url-context";

/** Compresión de la foto de captura IA: JPEG ≤1280px, calidad 0.8 (plan 08). */
const CAPTURA_MAX_DIMENSION = 1280;
const CAPTURA_MAX_BYTES = 1.5 * 1024 * 1024;

type ProductData = {
  id?: string;
  organizacionId: string;
  categoriaId?: string | null;
  unidadMedidaId?: string | null;
  sku: string;
  codigoBarras?: string | null;
  nombre: string;
  descripcion?: string | null;
  tipo: string;
  costo: string;
  precioVenta: string;
  stockMinimo: string;
  visiblePos: boolean;
  /** Llave R2 de la foto principal (null si aún no tiene). */
  imagenClaveR2?: string | null;
};

type Option = { id: string; nombre: string };

/** Renglón de "Últimas compras" (plan 10), ya formateado para mostrarse. */
export type UltimaCompra = {
  proveedor: string;
  fecha: string;
  cantidad: string;
  costo: string;
};

type FotoCaptura = { blob: Blob; ancho?: number; alto?: number };

/**
 * Comprime a JPEG ≤1280px q0.8 — a diferencia de la compresión WebP de
 * `media-image-field`, la captura IA usa JPEG por compatibilidad del modelo.
 */
async function comprimirParaCaptura(
  file: File,
): Promise<{ blob: Blob; ancho: number; alto: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, CAPTURA_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.max(1, Math.round(bitmap.width * escala));
    const alto = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const contexto = canvas.getContext("2d");
    if (!contexto) {
      bitmap.close();
      return null;
    }
    contexto.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    return blob ? { blob, ancho, alto } : null;
  } catch {
    return null;
  }
}

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};

/**
 * `BarcodeDetector` nativo (Chrome/Android): si el navegador lo trae, lee el
 * código de barras de la foto y ese valor gana sobre el que lea la IA.
 */
async function detectarCodigoBarras(blob: Blob): Promise<string | null> {
  try {
    if (!("BarcodeDetector" in window)) return null;
    const Detector = (
      window as unknown as {
        BarcodeDetector: new (options?: {
          formats?: string[];
        }) => BarcodeDetectorLike;
      }
    ).BarcodeDetector;
    const detector = new Detector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
    });
    const bitmap = await createImageBitmap(blob);
    try {
      const codigos = await detector.detect(bitmap);
      return codigos.find((codigo) => codigo.rawValue)?.rawValue ?? null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/** Estilo de advertencia para campos marcados como dudosos por la IA. */
const CLASE_DUDOSA = "border-warning focus:border-warning focus:ring-warning/30";

export function ProductForm({
  organizationId,
  categories,
  units,
  initial,
  capturaIa = false,
  onCreated,
  ultimasCompras,
  puedeVerFinanzas = true,
}: {
  organizationId: string;
  categories: Option[];
  units: Option[];
  initial?: ProductData;
  /** `true` cuando el binding de Workers AI existe (servidor, `getAi()`). */
  capturaIa?: boolean;
  /**
   * Aviso tras un alta exitosa (alta rápida desde otra pantalla, p. ej. el
   * "Crear producto" del detalle de compra del plan 10). Recibe el id nuevo y
   * el nombre capturado en este envío; no corre en ediciones.
   */
  onCreated?: (producto: { id: string; nombre: string }) => void;
  /**
   * Plan 10: últimas 5 líneas de compras verificadas que recibieron este
   * producto (proveedor, fecha y costo). Solo llega en edición.
   */
  ultimasCompras?: UltimaCompra[];
  /**
   * `false` cuando el rol no tiene `reportes.financieros`: el servidor ya
   * envía `costo` neutro y sin `ultimasCompras`; aquí solo se ocultan los
   * campos financieros del formulario.
   */
  puedeVerFinanzas?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ProductActionState, FormData>(saveProduct, {});
  const value = (key: keyof ProductData) => initial?.[key] ?? "";
  const tipo = (initial?.tipo ?? "producto") as "producto" | "insumo" | "ambos";
  const toast = useToast();
  // Nombre del último submit: `ActionState` no lo trae y `onCreated` lo
  // necesita para seleccionar el producto nuevo en la línea de la compra.
  const nombreEnviadoRef = useRef("");

  // Refs para prellenar los campos no controlados con el borrador de la IA.
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const precioRef = useRef<HTMLInputElement>(null);
  const categoriaRef = useRef<HTMLSelectElement>(null);
  const codigoBarrasRef = useRef<HTMLInputElement>(null);
  const descripcionRef = useRef<HTMLTextAreaElement>(null);
  const avanzadasRef = useRef<HTMLDetailsElement>(null);

  const [leyendoFoto, setLeyendoFoto] = useState(false);
  const [previewFoto, setPreviewFoto] = useState<string | null>(null);
  const [fotoParaGuardar, setFotoParaGuardar] = useState<FotoCaptura | null>(null);
  // Ref (no estado): solo evita re-subir la foto tras el alta; no pinta nada.
  const fotoSubidaRef = useRef(false);
  /** Campos del form marcados por la IA como de lectura dudosa. */
  const [dudosos, setDudosos] = useState<string[]>([]);
  const [precioEtiqueta, setPrecioEtiqueta] = useState<number | null>(null);
  const [duplicado, setDuplicado] = useState<{ id: string; nombre: string } | null>(null);

  // "Más opciones" arranca abierto solo cuando la edición ya trae datos no
  // básicos, para que el usuario vea lo que había llenado antes.
  const tieneAvanzadas = Boolean(
    initial &&
      (initial.descripcion ||
        initial.codigoBarras ||
        initial.unidadMedidaId ||
        initial.tipo !== "producto" ||
        Number(initial.costo) > 0 ||
        Number(initial.stockMinimo) > 0 ||
        !initial.visiblePos),
  );

  // Revoca el object URL de la miniatura al reemplazarla o desmontar.
  useEffect(() => {
    return () => {
      if (previewFoto?.startsWith("blob:")) URL.revokeObjectURL(previewFoto);
    };
  }, [previewFoto]);

  // La foto de la captura queda como imagen principal del producto al guardar
  // (plan 07): tras el alta se sube a /api/medios con el `entidadId` nuevo.
  useEffect(() => {
    const entidadId = state.createdId;
    if (!state.success || !entidadId || !fotoParaGuardar || fotoSubidaRef.current) return;
    fotoSubidaRef.current = true;
    const data = new FormData();
    data.set("organizacionId", organizationId);
    data.set("entidad", "producto");
    data.set("entidadId", entidadId);
    data.set("archivo", fotoParaGuardar.blob, "foto.jpg");
    if (fotoParaGuardar.ancho) data.set("ancho", String(fotoParaGuardar.ancho));
    if (fotoParaGuardar.alto) data.set("alto", String(fotoParaGuardar.alto));
    void fetch("/api/medios", { method: "POST", body: data })
      .then((response) => {
        if (response.ok) toast.success("Foto del producto guardada.");
      })
      .catch(() => {
        // La foto es un extra: el producto ya quedó guardado.
      });
  }, [state.success, state.createdId, fotoParaGuardar, organizationId, toast]);

  // Alta rápida embebida (compras): avisa al padre con el producto creado.
  useEffect(() => {
    if (state.success && state.createdId && !initial?.id) {
      onCreated?.({ id: state.createdId, nombre: nombreEnviadoRef.current });
    }
  }, [state.success, state.createdId, initial?.id, onCreated]);

  const aplicarBorrador = (captura: CapturaProductoRespuesta) => {
    const { valores, aplicados } = fusionarBorrador(
      {
        nombre: nombreRef.current?.value ?? "",
        descripcion: descripcionRef.current?.value ?? "",
        codigoBarras: codigoBarrasRef.current?.value ?? "",
        categoriaId: categoriaRef.current?.value ?? "",
      },
      {
        nombre: captura.nombreSugerido ?? captura.nombre,
        descripcion: captura.descripcion,
        codigoBarras: captura.codigoBarras,
        categoriaId: captura.categoriaId,
      },
    );
    if (nombreRef.current) nombreRef.current.value = valores.nombre;
    if (descripcionRef.current) descripcionRef.current.value = valores.descripcion;
    if (codigoBarrasRef.current) codigoBarrasRef.current.value = valores.codigoBarras;
    if (categoriaRef.current) categoriaRef.current.value = valores.categoriaId;

    // Descripción y código de barras viven en "Más opciones": abrirlo para
    // que la recepcionista vea lo que se rellenó.
    if (
      aplicados.some((campo) => campo === "descripcion" || campo === "codigoBarras") &&
      avanzadasRef.current
    ) {
      avanzadasRef.current.open = true;
    }

    setDudosos(
      [
        ...new Set(
          captura.camposDudosos
            .map((campo) => CAMPO_FORM_POR_CAMPO_IA[campo])
            .filter((campo): campo is string => Boolean(campo)),
        ),
      ],
    );
    setPrecioEtiqueta(captura.precioEtiqueta);
    setDuplicado(captura.duplicado);
  };

  const procesarCaptura = async (file?: File) => {
    if (!file || leyendoFoto) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona una foto del producto.");
      return;
    }
    setLeyendoFoto(true);
    setDuplicado(null);
    try {
      // JPEG ≤1280px; si el navegador no puede comprimir, se acepta el
      // original solo cuando ya es JPG/PNG dentro del límite.
      const comprimida = await comprimirParaCaptura(file);
      let blob: Blob | null = comprimida && comprimida.blob.size <= CAPTURA_MAX_BYTES
        ? comprimida.blob
        : null;
      if (
        !blob &&
        (file.type === "image/jpeg" || file.type === "image/png") &&
        file.size <= CAPTURA_MAX_BYTES
      ) {
        blob = file;
      }
      if (!blob) {
        toast.error("No pudimos leer la foto. Llena los datos a mano.");
        return;
      }
      const fotoBlob = blob;

      setPreviewFoto((previa) => {
        if (previa?.startsWith("blob:")) URL.revokeObjectURL(previa);
        return URL.createObjectURL(fotoBlob);
      });
      setFotoParaGuardar(
        comprimida && comprimida.blob === fotoBlob
          ? { blob: fotoBlob, ancho: comprimida.ancho, alto: comprimida.alto }
          : { blob: fotoBlob },
      );

      const codigoBarras = await detectarCodigoBarras(fotoBlob);

      const data = new FormData();
      data.set("organizacionId", organizationId);
      data.set("foto", fotoBlob, "captura.jpg");
      if (codigoBarras) data.set("codigoBarras", codigoBarras);

      const response = await fetch("/api/ia/producto", { method: "POST", body: data });
      const resultado = (await response.json().catch(() => ({}))) as
        Partial<CapturaProductoRespuesta> & { error?: string };
      if (!response.ok) {
        // 429/502/503: el mensaje del server guía a la persona; el form sigue.
        toast.error(resultado.error ?? "No pudimos leer la foto. Llena los datos a mano.");
        return;
      }
      aplicarBorrador(resultado as CapturaProductoRespuesta);
      toast.success("Listo. Revisa los datos que se llenaron.");
    } catch {
      toast.error("No pudimos leer la foto. Llena los datos a mano.");
    } finally {
      setLeyendoFoto(false);
      if (fotoInputRef.current) fotoInputRef.current.value = "";
    }
  };

  const marcaDudoso = (campo: string) => (dudosos.includes(campo) ? CLASE_DUDOSA : undefined);
  const avisoDudoso = (campo: string) =>
    dudosos.includes(campo) ? (
      <FieldDescription className="font-medium text-warning">Revisa este dato.</FieldDescription>
    ) : null;

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
      onSubmit={(event) => {
        nombreEnviadoRef.current = String(
          new FormData(event.currentTarget).get("nombre") ?? "",
        );
      }}
    >
      <input name="id" type="hidden" value={initial?.id ?? ""} />
      <input name="organizacionId" type="hidden" value={organizationId} />
      <h2 className="text-xl font-semibold">{initial ? "Editar producto" : "Nuevo producto o insumo"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {initial
          ? "Ajusta los datos del producto o insumo."
          : "Con nombre y precio basta para empezar; el resto queda en Más opciones."}
      </p>

      {!initial ? (
        <div className="mt-4 rounded-xl border border-dashed border-input bg-muted/40 p-3">
          <input
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => void procesarCaptura(event.target.files?.[0])}
            ref={fotoInputRef}
            type="file"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              data-action-id="productos.ia.capturar"
              disabled={leyendoFoto || !capturaIa}
              onClick={() => fotoInputRef.current?.click()}
              type="button"
              variant="outline"
            >
              {leyendoFoto ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Camera aria-hidden="true" className="size-4" />
              )}
              {leyendoFoto ? "Leyendo la foto…" : "Llenar con foto"}
            </Button>
            {previewFoto ? (
              /* eslint-disable-next-line @next/next/no-img-element -- miniatura local de la foto recién tomada (blob:). */
              <img
                alt="Foto capturada del producto"
                className="size-12 rounded-lg border border-border object-cover"
                src={previewFoto}
              />
            ) : null}
            {!capturaIa ? (
              <span className="text-op-xs text-muted-foreground">No disponible en este entorno</span>
            ) : null}
            {leyendoFoto ? (
              <span className="text-op-xs text-muted-foreground">Leyendo la foto…</span>
            ) : null}
          </div>
          {duplicado ? (
            <p className="mt-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning-soft-foreground">
              Este producto ya está registrado como “{duplicado.nombre}”.{" "}
              <Link
                className="font-medium underline"
                href={buildAdminHref("/productos", {
                  organizationId,
                  extra: { edit: duplicado.id },
                })}
              >
                Editar el existente
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel required>Nombre</FieldLabel>
          <Input className={marcaDudoso("nombre")} defaultValue={String(value("nombre"))} name="nombre" placeholder="Shampoo reparador 300ml" ref={nombreRef} required />
          {avisoDudoso("nombre")}
        </Field>
        <Field>
          <FieldLabel required>Precio de venta (MXN)</FieldLabel>
          <Input className={marcaDudoso("precioVenta")} defaultValue={String(value("precioVenta"))} min="0" name="precioVenta" placeholder="0.00" ref={precioRef} required step="0.01" type="number" />
          {avisoDudoso("precioVenta")}
          {precioEtiqueta !== null ? (
            <FieldDescription>
              En la etiqueta dice {formatCurrency(precioEtiqueta)}.{" "}
              <button
                className="font-medium text-primary underline"
                data-action-id="productos.ia.usar_precio"
                onClick={() => {
                  if (precioRef.current) precioRef.current.value = String(precioEtiqueta);
                }}
                type="button"
              >
                Usar
              </button>
            </FieldDescription>
          ) : null}
        </Field>
        <Field>
          <FieldLabel>Categoría</FieldLabel>
          <Select className={marcaDudoso("categoriaId")} defaultValue={String(value("categoriaId"))} name="categoriaId" ref={categoriaRef}>
            <option value="">Sin categoría</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}
          </Select>
          {avisoDudoso("categoriaId")}
        </Field>
        {!initial ? (
          <Field>
            <FieldLabel>Stock inicial</FieldLabel>
            <Input min="0" name="stockInicial" placeholder="0" step="0.001" type="number" />
            <FieldDescription>Se registra en tu sucursal seleccionada; puedes dejarlo en cero.</FieldDescription>
          </Field>
        ) : null}
        <Field className="sm:col-span-2">
          <FieldLabel>Foto</FieldLabel>
          {initial?.id ? (
            <ProductImageField
              claveInicial={initial.imagenClaveR2}
              entidad="producto"
              entidadId={initial.id}
              organizacionId={organizationId}
            />
          ) : (
            <FieldDescription>
              {fotoParaGuardar
                ? "La foto de la captura se guardará como imagen del producto."
                : "Guarda el producto primero; después podrás tomarle una foto desde Editar."}
            </FieldDescription>
          )}
          {initial?.id ? (
            <FieldDescription>Aparece en el punto de venta al elegir el producto.</FieldDescription>
          ) : null}
        </Field>
      </div>

      <details className="mt-5 rounded-xl border border-border bg-muted/60 px-4 py-3" open={tieneAvanzadas} ref={avanzadasRef}>
        <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground hover:text-primary">
          Más opciones
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {puedeVerFinanzas ? (
            <Field>
              <FieldLabel>Costo (MXN)</FieldLabel>
              <Input defaultValue={String(value("costo") || "0")} min="0" name="costo" placeholder="0.00" step="0.01" type="number" />
            </Field>
          ) : null}
          <Field>
            <FieldLabel>Código de barras</FieldLabel>
            <Input className={marcaDudoso("codigoBarras")} defaultValue={String(value("codigoBarras"))} name="codigoBarras" placeholder="7501234567890" ref={codigoBarrasRef} />
            {avisoDudoso("codigoBarras")}
          </Field>
          <Field>
            <FieldLabel>Unidad de medida</FieldLabel>
            <Select defaultValue={String(value("unidadMedidaId"))} name="unidadMedidaId">
              <option value="">Sin unidad</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.nombre}</option>)}
            </Select>
          </Field>
          <Field>
            <FieldLabel>Tipo</FieldLabel>
            <Select defaultValue={tipo} name="tipo">
              <option value="producto">Producto (se vende)</option>
              <option value="insumo">Insumo (se consume)</option>
              <option value="ambos">Ambos (se vende y se consume)</option>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Stock mínimo</FieldLabel>
            <Input defaultValue={String(value("stockMinimo") || "0")} min="0" name="stockMinimo" placeholder="0" step="0.001" type="number" />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>Descripción</FieldLabel>
            <Textarea className={marcaDudoso("descripcion")} defaultValue={String(value("descripcion"))} name="descripcion" ref={descripcionRef} />
            {avisoDudoso("descripcion")}
          </Field>
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm sm:col-span-2">
            <input defaultChecked={initial ? initial.visiblePos : true} name="visiblePos" type="checkbox" value="true" /> Visible en POS
          </label>
          {initial ? (
            <Field className="sm:col-span-2">
              <FieldLabel>Clave</FieldLabel>
              <Input name="sku" placeholder={initial.sku} />
              <FieldDescription>Déjalo vacío para conservar la clave actual.</FieldDescription>
            </Field>
          ) : null}
        </div>
        {puedeVerFinanzas && ultimasCompras && ultimasCompras.length > 0 ? (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-sm font-medium text-foreground">Últimas compras</h3>
            <ul className="mt-2 space-y-1.5">
              {ultimasCompras.map((compra, index) => (
                <li
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                  key={`${compra.fecha}-${index}`}
                >
                  <span className="min-w-0 truncate text-foreground">{compra.proveedor}</span>
                  <span className="text-op-xs text-muted-foreground">
                    {compra.fecha} · {compra.cantidad} pza(s) · {compra.costo}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>

      <div className="mt-4">
        <ActionFeedback state={state} successMessage="Producto guardado correctamente." />
      </div>
      <Button className="mt-6 rounded-xl" data-action-clave="1" data-action-id="catalogo.productos.guardar" disabled={pending} size="lg" type="submit">
        {pending ? "Guardando…" : "Guardar producto"}
      </Button>
    </form>
  );
}
