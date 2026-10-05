# Plan 08 — Captura asistida: datos del producto desde su foto (IA)

**Modelo:** SWE-2 MAX (diseño, prompt y schema cerrados aquí — **no modificar el
prompt ni el schema sin revisión**)
**Depende de:** 03 (alta rápida) y 07 (compresión de imagen en cliente / medios)
**Dolor:** "Agarrar valores de la foto de un producto y que se visualice la
información; el recepcionista solo completa."

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Modelo | `@cf/meta/llama-4-scout-17b-16e-instruct` (Workers AI, visión + `response_format` JSON schema). Precio doc ago-2026: $0.27/M tokens entrada, $0.85/M salida → ≈ $0.001 por foto |
| Gateway | AI Gateway id `melena-ia` (crear a mano en el dashboard; ver "Pasos manuales"). Si la var `AI_GATEWAY_ID` no existe, llamar sin gateway |
| Alcance | Solo **productos**. Servicios: fuera (poco valor; nombre/precio los decide el salón) |
| Imagen | El cliente la comprime a **JPEG** máx. 1280 px lado mayor, calidad 0.8 (no WebP: compatibilidad del modelo). Máx. 1.5 MB tras compresión |
| Flujo | Endpoint **sin estado**: la foto va directo al modelo, no se guarda en R2 en este paso. Al guardar el producto, la misma foto se sube como imagen principal (flujo del plan 07) |
| Código de barras | Primero `BarcodeDetector` del navegador (Chrome/Android); si no existe o no detecta, se usa lo que lea la IA |
| Duplicados | Si hay código de barras y ya existe un producto con ese `codigo_barras` en la org → aviso "Este producto ya está registrado" con enlace a editarlo |
| Precio | Solo si hay una **etiqueta de precio visible**; nunca inventar. Se muestra como "Precio en etiqueta", no se autollena precio de venta |
| Límite | Contador mensual por org en tabla `uso_ia`; límites en código por plan |
| Fallback | Cualquier error/timeout/JSON inválido → mensaje "No pudimos leer la foto, llena los datos a mano" y el formulario sigue normal |

## Contrato

### Binding y entorno

`wrangler.jsonc`:
```jsonc
"ai": { "binding": "AI" },
"vars": { "AI_GATEWAY_ID": "melena-ia" }
```
Luego `pnpm cf:typegen`. Acceso con el mismo patrón que `src/lib/kv-cache.ts`
(`getCloudflareContext({ async: false })`, `null` fuera de Workers).

### Módulo compartido `src/lib/ia/` (lo reutilizan los planes 10 y 12)

```ts
// src/lib/ia/cliente.ts
export function getAi(): Ai | null;
export class IaNoDisponible extends Error {}
export async function ejecutarVisionJson<T>(opts: {
  modelo: string;
  system: string;
  instruccion: string;
  imagen: { bytes: ArrayBuffer; mime: "image/jpeg" | "image/png" };
  jsonSchema: Record<string, unknown>;
  zod: z.ZodType<T>;
  maxTokens?: number;          // default 800
  timeoutMs?: number;          // default 45_000
}): Promise<T>;                 // lanza IaNoDisponible | Error
export async function ejecutarTextoJson<T>(/* igual sin imagen */): Promise<T>;
```

Formato de mensajes (verificar contra
`https://developers.cloudflare.com/workers-ai/models/llama-4-scout-17b-16e-instruct/sync-input.json`
antes de codificar; si el schema difiere, adaptar SOLO el empaquetado, no el prompt):
```ts
messages: [
  { role: "system", content: system },
  { role: "user", content: [
      { type: "text", text: instruccion },
      { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
  ] },
],
response_format: { type: "json_schema", json_schema: jsonSchema },
temperature: 0.1,
max_tokens,
```
Tercer argumento de `AI.run`: `{ gateway: { id: AI_GATEWAY_ID } }` si existe.
Timeout con `Promise.race`. Parsear `response` (string u objeto) → `zod.parse`.

```ts
// src/lib/ia/uso.ts
export const LIMITE_IA_MENSUAL: Record<string, number> = { esencial: 30, crecimiento: 300, profesional: 1000 };
export async function consumirCuotaIa(db, orgId: string, tipo: "producto" | "ticket" | "texto"): Promise<{ ok: true } | { ok: false; limite: number }>;
```
Plan resuelto con `contextoSuscripcionCache(orgId)` (`modules/billing/queries.ts`);
sin plan → límite de `esencial`. Incremento atómico:
`insert … on conflict (organizacion_id, mes, tipo) do update set conteo = uso_ia.conteo + 1 returning conteo`
y si `conteo > limite` → `{ ok: false }` (se cuenta el intento; es aceptable).
Cuota compartida: el límite aplica a la **suma** de los tipos del mes.

### Esquema (`src/db/schema/ia.ts`, exportar en `schema/index.ts`)

```ts
export const usoIa = pgTable("uso_ia", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizacionId: uuid("organizacion_id").notNull().references(() => organizaciones.id),
  mes: date("mes").notNull(),                       // primer día del mes UTC
  tipo: varchar("tipo", { length: 20 }).notNull(),  // producto | ticket | texto
  conteo: integer("conteo").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uso_ia_org_mes_tipo_uq").on(t.organizacionId, t.mes, t.tipo),
  check("uso_ia_tipo_chk", sql`${t.tipo} in ('producto','ticket','texto')`),
]);
```

### Endpoint `POST /api/ia/producto` (route handler, `multipart/form-data`)

Campos: `organizacionId`, `foto` (File), `codigoBarras?` (si `BarcodeDetector` ya lo leyó).
1. `checkPermission(organizacionId, "catalogos.editar")` → 403.
2. Validar mime jpeg/png y ≤ 1.5 MB → 400.
3. `consumirCuotaIa(…, "producto")` → 429 con `{ error: "Llegaste al límite de N capturas con foto de este mes." }`.
4. `ejecutarVisionJson` con el prompt y schema de abajo.
5. Post-proceso determinista:
   - `codigoBarras`: el del navegador gana; si viene de IA, conservar solo dígitos y aceptar 8, 12, 13 o 14 dígitos; si no, `null`.
   - `categoriaId`: comparar `categoriaSugerida` normalizada (minúsculas, sin acentos) con los nombres de `cat_categorias_productos` activos de la org; igualdad o inclusión → id; si no, `null` y devolver el texto como sugerencia.
   - `duplicado`: si hay código, buscar `productos` de la org con ese `codigo_barras` → `{ id, nombre }`.
   - `nombreSugerido`: componer `[nombre, marca, contenido]` sin repetir palabras ya contenidas (p. ej. "Shampoo reparador Elvive 400 ml").
6. Respuesta 200:
```ts
{ nombre: string | null; marca: string | null; contenido: string | null; descripcion: string | null;
  codigoBarras: string | null; categoriaId: string | null; categoriaSugerida: string | null;
  precioEtiqueta: number | null; camposDudosos: string[]; duplicado: { id: string; nombre: string } | null }
```
Errores de IA → 502 `{ error: "No pudimos leer la foto. Llena los datos a mano." }`.
Nunca registrar la imagen ni la respuesta completa en logs.

### Prompt (texto exacto)

**system:**
```
Eres un asistente que lee fotografías de productos de belleza y cuidado personal (shampoo, tintes, cremas, esmaltes, herramientas) para un punto de venta de un salón en México. Respondes solo con JSON válido que cumpla el esquema. Si un dato no se ve con claridad en la foto, devuelve null: nunca inventes ni adivines marcas, contenidos, códigos o precios. Escribe en español de México, con mayúscula inicial y sin texto promocional.
```

**instruccion:**
```
Extrae de la foto:
- nombre: tipo de producto y variante tal como aparece (ej. "Shampoo reparador"), sin la marca.
- marca: la marca comercial visible.
- contenido: cantidad neta con su unidad (ej. "400 ml", "60 g", "1 pieza").
- descripcion: una frase corta (máx. 120 caracteres) con el uso principal, solo si está escrito en el empaque.
- codigoBarras: los dígitos impresos bajo el código de barras, sin espacios.
- categoriaSugerida: una de estas palabras si aplica: Shampoo, Acondicionador, Tratamiento, Tinte, Decolorante, Peinado, Uñas, Piel, Herramienta, Accesorio, Otro.
- precioEtiqueta: el precio en pesos solo si hay una etiqueta de precio visible; número sin signo.
- camposDudosos: nombres de los campos que llenaste pero que no se leían con total claridad.
```

**jsonSchema:**
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["nombre","marca","contenido","descripcion","codigoBarras","categoriaSugerida","precioEtiqueta","camposDudosos"],
  "properties": {
    "nombre": { "type": ["string","null"], "maxLength": 120 },
    "marca": { "type": ["string","null"], "maxLength": 80 },
    "contenido": { "type": ["string","null"], "maxLength": 40 },
    "descripcion": { "type": ["string","null"], "maxLength": 160 },
    "codigoBarras": { "type": ["string","null"], "maxLength": 20 },
    "categoriaSugerida": { "type": ["string","null"], "maxLength": 40 },
    "precioEtiqueta": { "type": ["number","null"], "minimum": 0 },
    "camposDudosos": { "type": "array", "items": { "type": "string" }, "maxItems": 8 }
  }
}
```
El zod espejo vive en `src/lib/ia/esquemas.ts` (mismo nombre de campos; `.nullable()`;
recortar strings con `.transform(s => s?.trim() || null)`).

### UI (formulario de alta rápida del plan 03)

- Botón secundario **"Llenar con foto"** (icono `Camera`, `data-action-id="productos.ia.capturar"`)
  arriba del formulario → `<input type=file accept="image/*" capture="environment">`.
- Al elegir foto: miniatura + estado "Leyendo la foto…" (spinner, botón deshabilitado).
- Antes de enviar: `if ("BarcodeDetector" in window)` detectar `ean_13, ean_8, upc_a, upc_e, code_128` sobre la imagen.
- Al responder: **prellenar solo campos vacíos** (no pisar lo que ya escribió la
  persona): nombre ← `nombreSugerido`, descripción, código de barras, categoría.
  Campos en `camposDudosos` con borde `border-warning` + texto "Revisa este dato".
  Si `precioEtiqueta`: texto bajo el precio "En la etiqueta dice $X" con botón "Usar".
  Si `duplicado`: alerta con enlace a editar el existente.
- La foto queda como imagen del producto al guardar (plan 07).
- 429/502: toast con el mensaje del server; el formulario no se bloquea.

## Pasos

1. Binding `AI` + var + typegen; `src/lib/ia/{cliente,uso,esquemas}.ts`.
2. Migración `uso_ia` (`pnpm db:generate` → revisar SQL → `pnpm db:migrate`).
3. Route handler `/api/ia/producto` con post-proceso.
4. Tests (`src/lib/ia/*.test.ts`, mock de `AI.run`): JSON válido, JSON inválido →
   error, código de barras inválido → null, categoría por coincidencia, cuota
   excedida → 429, no pisar campos llenos (test del helper de merge en cliente).
5. UI en formulario de producto.
6. `/privacidad`: párrafo "Las fotos para llenar productos se procesan con IA dentro
   de la infraestructura de Cloudflare y no se usan para entrenar modelos."

## Pasos manuales (los hace el dueño, no el agente)

- Dashboard Cloudflare → AI → AI Gateway → crear gateway `melena-ia` (caché
  desactivada para visión; rate limit 60/min).
- Confirmar que Workers AI está habilitado en la cuenta (plan Workers Paid).

## Criterios de aceptación

- Foto de un shampoo real → nombre, marca, contenido y código prellenados en < 15 s.
- Producto ya registrado con ese código → aviso de duplicado.
- Sin binding (`pnpm dev` local) → botón muestra "No disponible en este entorno" y el alta manual funciona.
- Cuota agotada → mensaje claro, sin error 500.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:check`, `pnpm test:usability`.
Prueba real del modelo solo con `pnpm preview` (wrangler) o en producción tras deploy.

## Fuera de alcance

Fotos de servicios, búsqueda semántica, guardado de la respuesta IA para auditoría.

## Desviaciones (la llena el implementador)

_Vacío. Anotar aquí cualquier diferencia entre el plan y el código real, y `BLOQUEO:` si algo impide continuar._
