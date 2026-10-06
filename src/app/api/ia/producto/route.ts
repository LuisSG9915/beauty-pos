import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { getDatabase } from "@/db/client";
import { catCategoriasProductos, productos } from "@/db/schema/catalogs";
import { getApiSessionUser } from "@/lib/auth/access";
import { hasPermission, resolveAccessSafe } from "@/lib/auth/authorization";
import {
  type CapturaProductoRespuesta,
  componerNombreSugerido,
  normalizarCodigoBarras,
  resolverCategoriaId,
} from "@/lib/ia/borrador";
import { ejecutarVisionJson, getAi, IaNoDisponible } from "@/lib/ia/cliente";
import {
  borradorProductoIaSchema,
  IA_INSTRUCCION_PRODUCTO,
  IA_JSON_SCHEMA_PRODUCTO,
  IA_SISTEMA_PRODUCTO,
  MODELO_CAPTURA_PRODUCTO,
} from "@/lib/ia/esquemas";
import { consumirCuotaIa } from "@/lib/ia/uso";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** El cliente comprime a JPEG ≤1280px q0.8; 1.5 MB es el tope tras compresión. */
const CAPTURA_MAX_BYTES = 1.5 * 1024 * 1024;
const CAPTURA_MIMES = new Set(["image/jpeg", "image/png"]);

/**
 * Captura asistida (plan 08): recibe la foto ya comprimida del producto y la
 * pasa directo al modelo — sin estado, nada se guarda en R2 ni en `productos`.
 * La recepcionista revisa el borrador y confirma en el formulario.
 *
 * Seguridad: el `organizacionId` del form se valida contra la membresía y el
 * permiso `catalogos.editar`; los lookups (categorías, duplicado) van siempre
 * acotados a esa organización. La imagen y la respuesta cruda del modelo NO
 * se registran en logs.
 */
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "La solicitud no es válida." }, { status: 400 });
  }

  const organizacionId = String(form.get("organizacionId") ?? "");
  const foto = form.get("foto");
  // El código leído por `BarcodeDetector` en el navegador gana sobre el de IA.
  const codigoBarrasCliente = normalizarCodigoBarras(form.get("codigoBarras"));

  if (!UUID_RE.test(organizacionId)) {
    return NextResponse.json({ error: "Datos de la captura inválidos." }, { status: 400 });
  }

  const user = await getApiSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Inicia sesión para usar la captura." }, { status: 401 });
  }
  const access = await resolveAccessSafe(organizacionId, user);
  if (!access || !hasPermission(access, "catalogos.editar")) {
    return NextResponse.json(
      { error: "No tienes permiso para editar catálogos." },
      { status: 403 },
    );
  }

  if (!(foto instanceof File) || foto.size === 0) {
    return NextResponse.json({ error: "Selecciona una foto del producto." }, { status: 400 });
  }
  if (!CAPTURA_MIMES.has(foto.type)) {
    return NextResponse.json(
      { error: "Formato no soportado: usa JPG o PNG." },
      { status: 400 },
    );
  }
  if (foto.size > CAPTURA_MAX_BYTES) {
    return NextResponse.json(
      { error: "La foto no puede superar 1.5 MB." },
      { status: 400 },
    );
  }

  // Sin binding (dev local) la cuota no se consume: la función no puede correr.
  if (!getAi()) {
    return NextResponse.json(
      { error: "No disponible en este entorno." },
      { status: 503 },
    );
  }

  const db = getDatabase();
  const cuota = await consumirCuotaIa(db, organizacionId, "producto");
  if (!cuota.ok) {
    return NextResponse.json(
      { error: `Llegaste al límite de ${cuota.limite} capturas con foto de este mes.` },
      { status: 429 },
    );
  }

  let borrador;
  try {
    borrador = await ejecutarVisionJson({
      modelo: MODELO_CAPTURA_PRODUCTO,
      system: IA_SISTEMA_PRODUCTO,
      instruccion: IA_INSTRUCCION_PRODUCTO,
      imagen: {
        bytes: await foto.arrayBuffer(),
        mime: foto.type as "image/jpeg" | "image/png",
      },
      jsonSchema: IA_JSON_SCHEMA_PRODUCTO,
      zod: borradorProductoIaSchema,
    });
  } catch (error) {
    if (error instanceof IaNoDisponible) {
      return NextResponse.json(
        { error: "No disponible en este entorno." },
        { status: 503 },
      );
    }
    // Timeout, JSON inválido o esquema incumplido → fallback manual (plan 08).
    return NextResponse.json(
      { error: "No pudimos leer la foto. Llena los datos a mano." },
      { status: 502 },
    );
  }

  const codigoBarras = codigoBarrasCliente ?? normalizarCodigoBarras(borrador.codigoBarras);

  const [categorias, duplicadoRows] = await Promise.all([
    db
      .select({ id: catCategoriasProductos.id, nombre: catCategoriasProductos.nombre })
      .from(catCategoriasProductos)
      .where(
        and(
          eq(catCategoriasProductos.organizacionId, organizacionId),
          eq(catCategoriasProductos.activo, true),
        ),
      ),
    // Duplicado: cualquier producto de la org con ese código (activo o no —
    // un producto oculto sigue estando registrado).
    codigoBarras
      ? db
          .select({ id: productos.id, nombre: productos.nombre })
          .from(productos)
          .where(
            and(
              eq(productos.organizacionId, organizacionId),
              eq(productos.codigoBarras, codigoBarras),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  const respuesta: CapturaProductoRespuesta = {
    nombre: borrador.nombre,
    nombreSugerido: componerNombreSugerido([borrador.nombre, borrador.marca, borrador.contenido]),
    marca: borrador.marca,
    contenido: borrador.contenido,
    descripcion: borrador.descripcion,
    codigoBarras,
    categoriaId: resolverCategoriaId(borrador.categoriaSugerida, categorias),
    categoriaSugerida: borrador.categoriaSugerida,
    precioEtiqueta: borrador.precioEtiqueta,
    camposDudosos: borrador.camposDudosos,
    duplicado: duplicadoRows[0] ?? null,
  };
  return NextResponse.json(respuesta);
}
