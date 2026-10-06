# Plan 07 — Imágenes de productos y servicios con R2

**Modelo recomendado:** SWE-2 MAX
**Dolor que resuelve:** "Subir una foto de un producto o servicio" y "uso de
imágenes en ventas y en agenda".

## Diseño decidido

### Storage (R2)

1. `wrangler.jsonc`: binding `MEDIA` → bucket `melena-media`. Regenerar types
   con `pnpm cf:typegen`. En dev, R2 local de wrangler; fuera de Workers,
   degradar a "sin imagen" (mismo patrón que `kv-cache.ts`).
2. **Esquema** (`src/db/schema/` nuevo archivo `media.ts`):
   ```ts
   medios: id, organizacionId, entidad ("producto"|"servicio"|"ficha"|"compra"),
           entidadId, claveR2, mime, bytes, ancho, alto, principal bool, audit
   ```
   Key R2: `{orgId}/{entidad}/{entidadId}/{uuid}.{ext}`.
   En `productos`/`servicios`: `imagenPrincipalId uuid → medios.id` (nullable).
3. **Subida**: `POST /api/medios` (route handler):
   - `requirePermission` según entidad (productos → permiso de catálogo);
   - validar mime jpg/png/webp y ≤ 5 MB;
   - el cliente comprime antes (canvas → webp max 1600px) para ahorrar R2 y CPU.
4. **Servir**: `GET /api/medios/[key]` — verifica que la key pertenece a una org a
   la que el usuario tiene acceso (lookup barato por key en `medios`), luego
   `env.MEDIA.get` → stream con `Cache-Control: immutable` + ETag. Para imágenes
   de catálogo público (reservas online) evaluar variante pública después.
5. **Borrar**: al desactivar medio, borrar objeto R2 y fila.

### UI

- `ProductImageField`: dropzone de imagen (extender `FileDropzone` que hoy es
  solo CSV) con `capture="environment"` para cámara en móvil, preview y quitar.
- `product-form`/`service-form`: campo de foto en la sección principal.
- **POS** (`catalogo-selector.tsx`): tarjetas con foto del producto/servicio;
  fallback = inicial del nombre en `--*-soft`.
- **Agenda**: miniatura del servicio en el selector de servicios de `cita-form`
  y en `cita-side-panel` (foto del servicio agendado).
- **Fichas técnicas**: usar el `fotos jsonb` existente — guardar keys R2 en el
  array (antes/después).

## Pasos

1. Binding + types + `src/lib/media.ts` (get/put/delete con degradado local).
2. Migración Drizzle: tabla `medios` + columnas `imagen_principal_id`.
3. Route handlers upload/serve con permisos y límites.
4. Componente `ProductImageField` + compresión cliente.
5. Integrar en productos, servicios, POS, agenda, fichas.
6. Invalidar ningún KV necesario (medios no van a KV; la URL es por key).

## Pasos manuales (los hace el dueño, no el agente)

- `npx wrangler r2 bucket create melena-media` (o desde el dashboard) antes del deploy.

## Criterios de aceptación

- Subir foto desde el celular a un producto y verla en POS y en la ficha.
- Foto de servicio visible en el selector de la agenda.
- Sin binding (dev sin wrangler) la app no truena: muestra placeholder.
- No se puede servir la imagen de otra organización.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:check`, `pnpm test:usability`.
Smoke de POS tras integrar en catálogo.

## Fuera de alcance

Extracción de datos desde la foto con IA (plan 08), CDN/Images de pago,
galerías múltiples por producto (se diseña `medios` para soportarlo: `principal`).

## Desviaciones (la llena el implementador)

- **Componente nuevo en vez de extender `FileDropzone`**: el dropzone CSV quedó
  intacto. Se creó `src/components/media-image-field.tsx` con dos campos:
  `ProductImageField` (foto principal de producto/servicio) y `FichaFotosField`
  (hasta 6 fotos por ficha técnica). Ambos: `capture="environment"`, drag&drop,
  preview, quitar y compresión canvas → WebP ≤1600 px (calidad 0.82).
- **Foto de producto/servicio solo en edición**: la llave R2 exige el
  `entidadId` persistido (`{org}/{entidad}/{entidadId}/{uuid}.{ext}`), así que en
  el alta el campo muestra "Guarda el producto primero…". La ficha técnica sí
  sube en alta porque su id se genera en el cliente y se reutiliza como PK.
- **Permisos por entidad** (`PERMISO_POR_ENTIDAD` en `src/lib/media.ts`):
  `producto`/`servicio` → `catalogos.editar`; `ficha` → `clientes.editar`;
  `compra` → `inventario.editar` (la entidad compra queda solo a nivel
  esquema/API; no hay UI de compras hoy). En los route handlers se usa
  `resolveAccessSafe` + `hasPermission` con respuestas JSON 401/403/404 —
  `requirePermission`/`checkPermission` redirigen y no aplican en API.
- **Headers de GET más estrictos**: `Cache-Control: private, max-age=31536000,
  immutable` (se añadió `private` porque servir exige sesión y un CDN compartido
  no debe guardarla), ETag con 304 y `X-Content-Type-Options: nosniff`. Sin
  binding: GET → 404 (placeholder en UI) y POST → 503 con mensaje claro.
- **DELETE borra la fila** (`delete`, no solo `activo=false`) y el objeto R2
  (best-effort: si R2 falla queda huérfano desreferenciado). Si era la imagen
  principal de producto/servicio promueve la más reciente restante o limpia
  `imagen_principal_id`, todo en una transacción.
- **Invalidación de caché POS añadida**: el plan decía "invalidar ningún KV
  necesario", pero el catálogo del ticket se sirve con `unstable_cache` tagueado
  `catalogos:{org}` y subir/quitar imagen muta `imagen_principal_id`; se llama
  `revalidateTag(catalogoTag(org), "max")` (`revalidateTag` con perfil porque es
  route handler — `updateTag` solo existe en Server Actions; Next 16 exige el
  segundo argumento).
- **`ficha`/`compra` sin verificación de existencia en POST**: el `entidadId` lo
  genera el formulario antes de que la fila exista. El control real es el
  permiso por entidad + la validación de `saveFichaTecnica`, que exige que cada
  llave JSON exista en `medios` ligada a esa ficha y organización.
- **Columna extra `medios.activo`** (además de las audit del plan): soporta
  "desactivar medio" y el GET devuelve 404 si está inactivo.
- **`worker-configuration.d.ts` ignorado en eslint**: wrangler regenera el
  archivo con `eslint-disable` sin usar que cambian según la versión de workerd;
  se añadió a `globalIgnores` junto a `next-env.d.ts`.
- **Migración `drizzle/0049_medios-imagenes.sql` generada pero NO aplicada**,
  como indica el plan (además el entorno no tiene `DATABASE_URL`).
- **`BLOQUEO:` verificaciones que requieren entorno**: `pnpm test:usability`,
  `pnpm test:smoke` y `pnpm test:perf` necesitan `pnpm dev` + cuenta E2E y
  `DATABASE_URL` (el login regenera la contraseña vía BD). No existe `.env` en
  este entorno, así que no se pudieron correr. `pnpm typecheck`, `pnpm lint`,
  `pnpm test` (404 tests) y `pnpm db:check` pasan en verde.
- **`BLOQUEO:` paso manual del dueño pendiente**: `npx wrangler r2 bucket create
  melena-media` antes del deploy (es paso manual del plan; el usuario pidió no
  desplegar).
