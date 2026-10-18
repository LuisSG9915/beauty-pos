/* eslint-disable @next/next/no-img-element -- Las imágenes se sirven desde
   /api/medios con sesión del usuario; el optimizador de next/image no reenvía
   cookies al fetchear la URL interna y devolvería 401. */
"use client";

import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Tamaño máximo por lado tras la compresión en canvas (ahorra R2 y CPU). */
const MAX_DIMENSION = 1600;
const ACCEPT_IMAGEN = "image/jpeg,image/png,image/webp";
const MIMES_ACEPTADOS = new Set(ACCEPT_IMAGEN.split(","));
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FOTOS_FICHA = 6;

type EntidadImagen = "producto" | "servicio" | "ficha" | "compra" | "mobiliario";

/**
 * Comprime la imagen a WebP ≤1600px con canvas. Devuelve `null` cuando el
 * navegador no puede decodificarla; el caller decide si subir el original.
 */
async function comprimirImagen(
  file: File,
): Promise<{ blob: Blob; ancho: number; alto: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
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
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    return blob ? { blob, ancho, alto } : null;
  } catch {
    return null;
  }
}

export async function subirImagen({
  archivo,
  entidad,
  entidadId,
  organizacionId,
}: {
  archivo: File;
  entidad: EntidadImagen;
  entidadId: string;
  organizacionId: string;
}): Promise<{ claveR2: string; url: string; preview: string }> {
  if (!MIMES_ACEPTADOS.has(archivo.type)) {
    throw new Error("Formato no soportado: usa JPG, PNG o WebP.");
  }
  if (archivo.size > MAX_BYTES) {
    throw new Error("La imagen no puede superar 5 MB.");
  }

  const comprimida = await comprimirImagen(archivo);
  const cuerpo = comprimida?.blob ?? archivo;
  const data = new FormData();
  data.set("organizacionId", organizacionId);
  data.set("entidad", entidad);
  data.set("entidadId", entidadId);
  data.set("archivo", cuerpo, cuerpo instanceof File ? cuerpo.name : "foto.webp");
  if (comprimida) {
    data.set("ancho", String(comprimida.ancho));
    data.set("alto", String(comprimida.alto));
  }

  const response = await fetch("/api/medios", { method: "POST", body: data });
  const resultado = (await response.json().catch(() => ({}))) as {
    claveR2?: string;
    url?: string;
    error?: string;
  };
  if (!response.ok || !resultado.claveR2 || !resultado.url) {
    throw new Error(resultado.error ?? "No se pudo subir la imagen.");
  }
  return {
    claveR2: resultado.claveR2,
    url: resultado.url,
    preview: URL.createObjectURL(cuerpo),
  };
}

export async function eliminarImagen(claveR2: string): Promise<void> {
  const response = await fetch(`/api/medios/${encodeURI(claveR2)}`, { method: "DELETE" });
  if (!response.ok) {
    const resultado = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(resultado.error ?? "No se pudo eliminar la imagen.");
  }
}

function MensajeError({ error }: { error: string | null }) {
  return error ? (
    <p className="mt-1 text-op-xs font-medium text-destructive" role="alert">
      {error}
    </p>
  ) : null;
}

/**
 * Campo de foto principal de un producto o servicio: dropzone con
 * `capture="environment"` (cámara directa en móvil), compresión cliente,
 * preview y quitar. Solo se renderiza al editar (la subida requiere el
 * `entidadId` ya persistido).
 */
export function ProductImageField({
  claveInicial,
  entidad,
  entidadId,
  organizacionId,
}: {
  claveInicial?: string | null;
  entidad: "producto" | "servicio";
  entidadId: string;
  organizacionId: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [clave, setClave] = useState<string | null>(claveInicial ?? null);
  const [preview, setPreview] = useState<string | null>(
    claveInicial ? `/api/medios/${encodeURI(claveInicial)}` : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoca object URLs de previsualización al reemplazarlas o desmontar.
  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const procesarArchivo = async (file?: File) => {
    if (!file || pending) return;
    setPending(true);
    setError(null);
    try {
      const subida = await subirImagen({ archivo: file, entidad, entidadId, organizacionId });
      setClave(subida.claveR2);
      setPreview(subida.preview);
      toast.success("Foto guardada.");
    } catch (exception) {
      const mensaje = exception instanceof Error ? exception.message : "No se pudo subir la imagen.";
      setError(mensaje);
      toast.error(mensaje);
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const quitar = async () => {
    if (!clave || pending) return;
    setPending(true);
    setError(null);
    try {
      await eliminarImagen(clave);
      setClave(null);
      setPreview(null);
      toast.success("Foto eliminada.");
    } catch (exception) {
      const mensaje = exception instanceof Error ? exception.message : "No se pudo eliminar la imagen.";
      setError(mensaje);
      toast.error(mensaje);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <input
        accept={ACCEPT_IMAGEN}
        capture="environment"
        className="sr-only"
        onChange={(event) => procesarArchivo(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />
      {preview ? (
        <div className="flex items-start gap-3">
          <div className="relative">
            <img
              alt="Foto actual"
              className="size-28 rounded-xl border border-border object-cover"
              src={preview}
            />
            {pending ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary" />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Button
              data-action-id="medios.imagen.cambiar"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              Cambiar foto
            </Button>
            <Button
              data-action-id="medios.imagen.quitar"
              disabled={pending}
              onClick={quitar}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-4 text-destructive" /> Quitar
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed border-input bg-muted/60 px-4 py-4 text-center transition-colors hover:border-primary hover:bg-accent/50 disabled:cursor-wait disabled:opacity-60"
          data-action-id="medios.imagen.subir"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void procesarArchivo(event.dataTransfer.files[0]);
          }}
          type="button"
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary" />
          ) : (
            <>
              <Camera aria-hidden="true" className="size-6 text-primary" />
              <span className="mt-2 text-sm font-medium text-foreground">
                Tomar o elegir una foto
              </span>
              <span className="mt-1 text-op-xs text-muted-foreground">
                JPG, PNG o WebP · se ajusta sola al subir
              </span>
            </>
          )}
        </button>
      )}
      <MensajeError error={error} />
    </div>
  );
}

/**
 * Foto de un mueble del plano (plan 11). A diferencia de los campos de
 * catálogo, el servidor fija `mobiliario.foto_id` al subir, así que aquí solo
 * se refresca la ruta para que el plano muestre la foto nueva. Solo se usa
 * con muebles ya guardados (la API verifica que el mueble exista).
 */
export function MobiliarioFotoField({
  claveInicial,
  muebleId,
  muebleNombre,
  organizacionId,
}: {
  /** Llave R2 de la foto actual (`null` = sin foto). */
  claveInicial?: string | null;
  muebleId: string;
  /** Nombre del mueble para los textos alternativos. */
  muebleNombre: string;
  organizacionId: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [clave, setClave] = useState<string | null>(claveInicial ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const procesarArchivo = async (file?: File) => {
    if (!file || pending) return;
    setPending(true);
    setError(null);
    try {
      const subida = await subirImagen({
        archivo: file,
        entidad: "mobiliario",
        entidadId: muebleId,
        organizacionId,
      });
      setClave(subida.claveR2);
      toast.success("Foto guardada.", muebleNombre);
      router.refresh();
    } catch (exception) {
      const mensaje = exception instanceof Error ? exception.message : "No se pudo subir la imagen.";
      setError(mensaje);
      toast.error(mensaje);
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const quitar = async () => {
    if (!clave || pending) return;
    setPending(true);
    setError(null);
    try {
      await eliminarImagen(clave);
      setClave(null);
      toast.success("Foto eliminada.", muebleNombre);
      router.refresh();
    } catch (exception) {
      const mensaje = exception instanceof Error ? exception.message : "No se pudo eliminar la imagen.";
      setError(mensaje);
      toast.error(mensaje);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <input
        accept={ACCEPT_IMAGEN}
        capture="environment"
        className="sr-only"
        onChange={(event) => procesarArchivo(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />
      {clave ? (
        <div className="flex items-start gap-3">
          <div className="relative">
            <img
              alt={`Foto de ${muebleNombre}`}
              className="size-28 rounded-xl border border-border object-cover"
              src={`/api/medios/${encodeURI(clave)}`}
            />
            {pending ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/60">
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary" />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <Button
              data-action-id="plano.mobiliario.foto.cambiar"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              Cambiar foto
            </Button>
            <Button
              data-action-id="plano.mobiliario.foto.quitar"
              disabled={pending}
              onClick={quitar}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-4 text-destructive" /> Quitar
            </Button>
          </div>
        </div>
      ) : (
        <button
          className="flex min-h-24 w-full flex-col items-center justify-center rounded-xl border border-dashed border-input bg-muted/60 px-4 py-4 text-center transition-colors hover:border-primary hover:bg-accent/50 disabled:cursor-wait disabled:opacity-60"
          data-action-id="plano.mobiliario.foto.subir"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary" />
          ) : (
            <>
              <Camera aria-hidden="true" className="size-6 text-primary" />
              <span className="mt-2 text-sm font-medium text-foreground">
                Tomar o elegir una foto
              </span>
              <span className="mt-1 text-op-xs text-muted-foreground">
                JPG, PNG o WebP · se ajusta sola al subir
              </span>
            </>
          )}
        </button>
      )}
      <MensajeError error={error} />
    </div>
  );
}

/**
 * Fotos de ficha técnica (antes/después): miniaturas con quitar + botón para
 * agregar. Las llaves R2 viajan en el hidden `fotos` (JSON) y se guardan con
 * la ficha; `entidadId` es el uuid que el formulario generó para la ficha.
 */
export function FichaFotosField({
  entidadId,
  name = "fotos",
  organizacionId,
}: {
  /** uuid de la ficha (generado por el formulario antes de guardar). */
  entidadId: string;
  name?: string;
  organizacionId: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [claves, setClaves] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const procesarArchivo = async (file?: File) => {
    if (!file || pending) return;
    if (claves.length >= MAX_FOTOS_FICHA) {
      setError(`Máximo ${MAX_FOTOS_FICHA} fotos por registro.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const subida = await subirImagen({
        archivo: file,
        entidad: "ficha",
        entidadId,
        organizacionId,
      });
      setClaves((current) => [...current, subida.claveR2]);
    } catch (exception) {
      const mensaje = exception instanceof Error ? exception.message : "No se pudo subir la imagen.";
      setError(mensaje);
      toast.error(mensaje);
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const quitar = async (claveR2: string) => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await eliminarImagen(claveR2);
      setClaves((current) => current.filter((clave) => clave !== claveR2));
    } catch (exception) {
      const mensaje = exception instanceof Error ? exception.message : "No se pudo eliminar la imagen.";
      setError(mensaje);
      toast.error(mensaje);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <input name={name} type="hidden" value={JSON.stringify(claves)} />
      <input
        accept={ACCEPT_IMAGEN}
        capture="environment"
        className="sr-only"
        onChange={(event) => procesarArchivo(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />
      <div className="flex flex-wrap items-center gap-2">
        {claves.map((claveR2) => (
          <div className="relative" key={claveR2}>
            <img
              alt="Foto de la ficha"
              className="size-16 rounded-lg border border-border object-cover"
              src={`/api/medios/${encodeURI(claveR2)}`}
            />
            <button
              aria-label="Quitar foto"
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-card text-destructive shadow-sm"
              data-action-id="medios.ficha.foto_quitar"
              disabled={pending}
              onClick={() => void quitar(claveR2)}
              type="button"
            >
              <X aria-hidden="true" className="size-3" />
            </button>
          </div>
        ))}
        {claves.length < MAX_FOTOS_FICHA ? (
          <button
            aria-label="Agregar foto a la ficha"
            className={cn(
              "flex size-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-input bg-muted/60 text-muted-foreground transition-colors",
              "hover:border-primary hover:bg-accent/50 hover:text-primary disabled:cursor-wait disabled:opacity-60",
            )}
            data-action-id="medios.ficha.foto_agregar"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ImagePlus aria-hidden="true" className="size-4" />
            )}
            <span className="text-op-xs font-medium">Foto</span>
          </button>
        ) : null}
      </div>
      <MensajeError error={error} />
    </div>
  );
}

/**
 * Captura dual Antes / Después para la ficha técnica del servicio.
 * Permite capturar la foto inicial del cliente y la foto final del resultado,
 * guardándolas en R2 con compresión automática y emitiendo tanto el jsonb
 * compatible `fotos` (array de claves) como el jsonb estructurado `fotosDetalle`
 * (claves con rol "antes" y "despues").
 */
export function AntesDespuesFotosField({
  entidadId,
  nameFotos = "fotos",
  nameDetalle = "fotosDetalle",
  organizacionId,
}: {
  entidadId: string;
  nameFotos?: string;
  nameDetalle?: string;
  organizacionId: string;
}) {
  const toast = useToast();
  const inputAntesRef = useRef<HTMLInputElement>(null);
  const inputDespuesRef = useRef<HTMLInputElement>(null);
  const [fotoAntes, setFotoAntes] = useState<string | null>(null);
  const [fotoDespues, setFotoDespues] = useState<string | null>(null);
  const [pendingAntes, setPendingAntes] = useState(false);
  const [pendingDespues, setPendingDespues] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subirFoto = async (file: File | undefined, rol: "antes" | "despues") => {
    if (!file) return;
    const isAntes = rol === "antes";
    if (isAntes ? pendingAntes : pendingDespues) return;
    if (isAntes) setPendingAntes(true);
    else setPendingDespues(true);
    setError(null);
    try {
      const subida = await subirImagen({
        archivo: file,
        entidad: "ficha",
        entidadId,
        organizacionId,
      });
      if (isAntes) setFotoAntes(subida.claveR2);
      else setFotoDespues(subida.claveR2);
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : "No se pudo subir la foto.";
      setError(msg);
      toast.error(msg);
    } finally {
      if (isAntes) {
        setPendingAntes(false);
        if (inputAntesRef.current) inputAntesRef.current.value = "";
      } else {
        setPendingDespues(false);
        if (inputDespuesRef.current) inputDespuesRef.current.value = "";
      }
    }
  };

  const quitarFoto = async (claveR2: string, rol: "antes" | "despues") => {
    try {
      await eliminarImagen(claveR2);
      if (rol === "antes") setFotoAntes(null);
      else setFotoDespues(null);
    } catch (exc) {
      const msg = exc instanceof Error ? exc.message : "No se pudo eliminar la foto.";
      toast.error(msg);
    }
  };

  const claves = [fotoAntes, fotoDespues].filter((c): c is string => Boolean(c));
  const detalles = [
    fotoAntes ? { claveR2: fotoAntes, rol: "antes" as const } : null,
    fotoDespues ? { claveR2: fotoDespues, rol: "despues" as const } : null,
  ].filter((d): d is { claveR2: string; rol: "antes" | "despues" } => Boolean(d));

  return (
    <div className="space-y-2">
      <input name={nameFotos} type="hidden" value={JSON.stringify(claves)} />
      <input name={nameDetalle} type="hidden" value={JSON.stringify(detalles)} />

      <input
        accept={ACCEPT_IMAGEN}
        capture="environment"
        className="sr-only"
        onChange={(e) => void subirFoto(e.target.files?.[0], "antes")}
        ref={inputAntesRef}
        type="file"
      />
      <input
        accept={ACCEPT_IMAGEN}
        capture="environment"
        className="sr-only"
        onChange={(e) => void subirFoto(e.target.files?.[0], "despues")}
        ref={inputDespuesRef}
        type="file"
      />

      <div className="grid grid-cols-2 gap-3">
        {/* Ranura Antes */}
        <div className="flex flex-col gap-1.5">
          <span className="text-op-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Antes
          </span>
          {fotoAntes ? (
            <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
              <img
                alt="Foto Antes"
                className="size-full object-cover"
                src={`/api/medios/${encodeURI(fotoAntes)}`}
              />
              <button
                aria-label="Quitar foto antes"
                className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-card/90 text-destructive shadow-sm hover:bg-card"
                data-action-id="medios.ficha.antes_quitar"
                onClick={() => void quitarFoto(fotoAntes, "antes")}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-input bg-muted/60 p-2 text-center transition-colors hover:border-primary hover:bg-accent/40 disabled:cursor-wait"
              data-action-id="medios.ficha.antes_subir"
              disabled={pendingAntes}
              onClick={() => inputAntesRef.current?.click()}
              type="button"
            >
              {pendingAntes ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary" />
              ) : (
                <>
                  <Camera aria-hidden="true" className="size-5 text-primary" />
                  <span className="mt-1 text-op-xs font-medium text-foreground">Subir Antes</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Ranura Después */}
        <div className="flex flex-col gap-1.5">
          <span className="text-op-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Después
          </span>
          {fotoDespues ? (
            <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
              <img
                alt="Foto Después"
                className="size-full object-cover"
                src={`/api/medios/${encodeURI(fotoDespues)}`}
              />
              <button
                aria-label="Quitar foto después"
                className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-card/90 text-destructive shadow-sm hover:bg-card"
                data-action-id="medios.ficha.despues_quitar"
                onClick={() => void quitarFoto(fotoDespues, "despues")}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              className="flex aspect-square flex-col items-center justify-center rounded-xl border border-dashed border-input bg-muted/60 p-2 text-center transition-colors hover:border-primary hover:bg-accent/40 disabled:cursor-wait"
              data-action-id="medios.ficha.despues_subir"
              disabled={pendingDespues}
              onClick={() => inputDespuesRef.current?.click()}
              type="button"
            >
              {pendingDespues ? (
                <Loader2 aria-hidden="true" className="size-5 animate-spin text-primary" />
              ) : (
                <>
                  <Camera aria-hidden="true" className="size-5 text-primary" />
                  <span className="mt-1 text-op-xs font-medium text-foreground">Subir Después</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
      <MensajeError error={error} />
    </div>
  );
}
