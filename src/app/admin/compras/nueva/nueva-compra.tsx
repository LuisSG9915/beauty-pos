"use client";

import { Camera, FilePlus2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { buildAdminHref } from "@/lib/url-context";

/**
 * La IA del ticket solo admite JPEG/PNG (mismo criterio que
 * `ejecutarVisionJson`): la compresión va a JPEG ≤2048px — la letra chica del
 * ticket necesita más resolución que una foto de catálogo (plan 08 usaba 1280).
 */
const TICKET_MAX_DIMENSION = 2048;
const TICKET_MIMES = new Set(["image/jpeg", "image/png"]);
const TICKET_MAX_BYTES = 4 * 1024 * 1024;

async function comprimirTicket(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, TICKET_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
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
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
  } catch {
    return null;
  }
}

/**
 * Captura inicial de la compra: foto del ticket (cámara trasera en móvil) o
 * captura manual. Crea la compra en `borrador` vía `POST /api/compras` y
 * navega al detalle — con foto además pasa `?analizar=1` para que el detalle
 * dispare la lectura con IA en la misma pantalla ("Leyendo ticket…").
 */
export function NuevaCompra({
  organizacionId,
  sucursalId,
}: {
  organizacionId: string;
  sucursalId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState<"foto" | "manual" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detalleHref = (id: string, analizar: boolean) =>
    buildAdminHref(`/compras/${id}`, {
      organizationId: organizacionId,
      sucursalId,
      extra: analizar ? { analizar: "1" } : {},
    });

  const crearCompra = async (foto: Blob | null) => {
    const data = new FormData();
    data.set("organizacionId", organizacionId);
    data.set("sucursalId", sucursalId);
    if (foto) data.set("foto", foto, "ticket.jpg");
    const response = await fetch("/api/compras", { method: "POST", body: data });
    const resultado = (await response.json().catch(() => ({}))) as {
      id?: string;
      fotoOk?: boolean;
      error?: string;
    };
    if (!response.ok || !resultado.id) {
      throw new Error(resultado.error ?? "No se pudo registrar la compra.");
    }
    return resultado;
  };

  const procesarFoto = async (file?: File) => {
    if (!file || enviando) return;
    if (!TICKET_MIMES.has(file.type)) {
      setError("El ticket debe ser una foto JPG o PNG.");
      return;
    }
    if (file.size > TICKET_MAX_BYTES) {
      setError("La foto del ticket no puede superar 4 MB.");
      return;
    }
    setEnviando("foto");
    setError(null);
    try {
      // Si el navegador no puede comprimir, el original ya es JPG/PNG válido.
      const comprimida = await comprimirTicket(file);
      const foto = comprimida ?? file;
      const resultado = await crearCompra(foto);
      if (!resultado.fotoOk) {
        toast.warning("La compra se creó pero la foto no se pudo guardar; captura las líneas a mano.");
      }
      router.push(detalleHref(resultado.id!, resultado.fotoOk === true));
    } catch (exception) {
      const mensaje = exception instanceof Error ? exception.message : "No se pudo registrar la compra.";
      setError(mensaje);
      toast.error(mensaje);
      setEnviando(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const crearSinFoto = async () => {
    if (enviando) return;
    setEnviando("manual");
    setError(null);
    try {
      const resultado = await crearCompra(null);
      router.push(detalleHref(resultado.id!, false));
    } catch (exception) {
      const mensaje = exception instanceof Error ? exception.message : "No se pudo registrar la compra.";
      setError(mensaje);
      toast.error(mensaje);
      setEnviando(null);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <input
        accept="image/jpeg,image/png"
        capture="environment"
        className="sr-only"
        onChange={(event) => void procesarFoto(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />

      <button
        className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-accent/30 px-6 py-10 text-center transition-colors hover:border-primary hover:bg-accent/60 disabled:cursor-wait disabled:opacity-70"
        data-action-clave="1"
        data-action-id="compras.ticket.foto"
        disabled={enviando !== null}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {enviando === "foto" ? (
          <Loader2 aria-hidden="true" className="size-10 animate-spin text-primary" />
        ) : (
          <Camera aria-hidden="true" className="size-10 text-primary" strokeWidth={1.6} />
        )}
        <span className="text-lg font-semibold text-foreground">
          {enviando === "foto" ? "Guardando la foto…" : "Tomar foto del ticket"}
        </span>
        <span className="max-w-sm text-sm leading-6 text-muted-foreground">
          La leemos con IA y te dejamos las líneas listas para revisar antes de
          dar entrada al inventario.
        </span>
      </button>

      {error ? (
        <p
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-center gap-2">
        <Button
          data-action-id="compras.ticket.manual"
          disabled={enviando !== null}
          onClick={() => void crearSinFoto()}
          variant="ghost"
        >
          {enviando === "manual" ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <FilePlus2 aria-hidden="true" className="size-4" />
          )}
          Capturar sin foto
        </Button>
        <span className="text-op-xs text-muted-foreground">o</span>
        <Link
          className="text-sm text-primary underline-offset-4 hover:underline"
          href={buildAdminHref("/compras", { organizationId: organizacionId, sucursalId })}
        >
          Volver a compras
        </Link>
      </div>
    </div>
  );
}
