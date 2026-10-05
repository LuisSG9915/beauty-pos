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

_Vacío. Anotar aquí cualquier diferencia entre el plan y el código real, y `BLOQUEO:` si algo impide continuar._
