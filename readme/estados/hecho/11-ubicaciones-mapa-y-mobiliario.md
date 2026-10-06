# Plan 11 — Plano del salón: pisos, vitrinas, mercancía y mobiliario

**Modelo:** SWE-2 MAX (diseño cerrado)
**Depende de:** 07 (`medios`, para foto de mobiliario). Recomendado después de 09.
**Dolor:** "Configurar vitrinas o lugares para almacenar mercancía, marcar pisos,
ver la mercancía en un mapa interactivo; gestión de muebles (asientos, mesas…)."

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Modelo del plano | Cuadrícula por piso. Coordenadas y tamaños en **celdas enteras**; 1 celda = 32 px en pantalla. Piso default 24 × 16 celdas (editable 8–60 × 8–40) |
| Elementos | Dos tablas con las mismas columnas de posición: `ubicaciones` (donde se guarda mercancía) y `mobiliario` (activos físicos) |
| Stock por ubicación | **Informativo**, no transaccional. El stock real sigue en `inventario_stock`; ventas/consumos/compras NO tocan ubicaciones. Se muestra "Sin ubicar = stock − Σ ubicado"; si es negativo, aviso "Las cantidades por ubicación están desactualizadas — recuéntalas" |
| Mobiliario ↔ agenda | Enlace **opcional** `mobiliario.recurso_id → recursos.id` (una silla de manicura puede ser mueble y recurso agendable). No se crea recurso automáticamente |
| Editor | SVG propio + Pointer Events (mismo enfoque que plan 05). Sin librerías |
| Edición en móvil | No. En < 768 px solo vista; mensaje "Edita el plano desde una tablet o computadora" |
| Permisos | Plano/pisos/mobiliario: `sucursales.editar` (ver: `sucursales.ver` o `inventario.ver`). Cantidades por ubicación: `inventario.editar` |
| Ruta | `/admin/plano` — nav "Plano del salón", icono `Map`, grupo Inventario, permiso `inventario.ver` |

## Esquema (`src/db/schema/plano.ts`, exportar en `schema/index.ts`)

```ts
export const UBICACION_TIPOS = ["vitrina","estante","bodega","mostrador","otro"] as const;
export const MOBILIARIO_TIPOS = ["asiento","mesa","tocador","lavacabezas","camilla","carrito","espejo","otro"] as const;
export const MOBILIARIO_ESTADOS = ["bueno","mantenimiento","baja"] as const;

const posicion = {
  x: integer("x").default(0).notNull(),
  y: integer("y").default(0).notNull(),
  ancho: integer("ancho").default(2).notNull(),
  alto: integer("alto").default(1).notNull(),
};

export const pisos = pgTable("pisos", {
  id, organizacionId, sucursalId → sucursales (notNull),
  nombre: varchar(80).notNull(),               // "Planta baja"
  orden: integer.default(0).notNull(),
  columnas: integer.default(24).notNull(), filas: integer.default(16).notNull(),
  activo, ...catalogAuditColumns,
}, t => [
  index("pisos_sucursal_idx").on(t.sucursalId),
  check("pisos_tamano_chk", sql`columnas between 8 and 60 and filas between 8 and 40`),
]);

export const ubicaciones = pgTable("ubicaciones", {
  id, organizacionId, sucursalId (notNull), pisoId → pisos (notNull),
  tipo: varchar(20).default("estante").notNull(),
  nombre: varchar(80).notNull(),               // "Vitrina entrada"
  ...posicion, activo, ...catalogAuditColumns,
}, t => [index("ubicaciones_piso_idx").on(t.pisoId), check("ubicaciones_tipo_chk", sql`tipo in (...)`),
         check("ubicaciones_pos_chk", sql`x >= 0 and y >= 0 and ancho between 1 and 20 and alto between 1 and 20`)]);

export const inventarioUbicaciones = pgTable("inventario_ubicaciones", {
  id, organizacionId, ubicacionId → ubicaciones, productoId → productos,
  cantidad: numeric(12,3).default("0").notNull(),
  ...opAuditColumns,
}, t => [uniqueIndex("inventario_ubicaciones_ubic_prod_uq").on(t.ubicacionId, t.productoId),
         index("inventario_ubicaciones_producto_idx").on(t.productoId),
         check("inventario_ubicaciones_cantidad_chk", sql`cantidad >= 0`)]);

export const mobiliario = pgTable("mobiliario", {
  id, organizacionId, sucursalId (notNull), pisoId → pisos (null = sin colocar),
  tipo: varchar(20).default("otro").notNull(), nombre: varchar(80).notNull(),
  estado: varchar(20).default("bueno").notNull(),
  recursoId → recursos (null), fotoId → medios (null),
  fechaAdquisicion: date, costo: numeric(12,2), notas: text,
  ...posicion, activo, ...opAuditColumns,
}, t => [index("mobiliario_sucursal_idx").on(t.sucursalId), checks de tipo/estado/posición]);
```

Reglas de validación en servidor (`src/modules/plano/rules.ts` + tests):
- El elemento cabe en el piso: `x + ancho ≤ columnas`, `y + alto ≤ filas`.
- Sin traslape entre elementos activos del mismo piso (ubicaciones y mobiliario
  juntos): rectángulos `[x, x+ancho) × [y, y+alto)` no se intersectan.
- Reducir tamaño del piso falla si deja elementos fuera.
- `recursoId` debe ser de la misma sucursal.

## Acciones (`src/app/admin/plano/actions.ts`)

`guardarPiso`, `desactivarPiso` (falla si tiene elementos activos),
`guardarUbicacion`, `moverElemento({ tipo: "ubicacion"|"mobiliario", id, x, y, ancho, alto })`
(una sola acción para arrastre/redimensión, valida reglas, devuelve error legible),
`desactivarUbicacion` (falla si tiene cantidades > 0: "Pasa la mercancía a otra ubicación primero"),
`guardarMobiliario`, `cambiarEstadoMobiliario`,
`fijarCantidadUbicacion({ ubicacionId, productoId, cantidad })` (0 = borrar fila).
Todas con `checkPermission` + `assertBranchScope(sucursalId)`.

## Pantalla `/admin/plano`

Datos: UNA consulta fusionada por sucursal actual (regla del proyecto): pisos +
ubicaciones con `jsonb_agg` de `{productoId, nombre, cantidad}` + mobiliario +
stock por producto de la sucursal (para "sin ubicar").

Layout:
- Barra: pestañas de pisos (+ "Agregar piso"), buscador de producto, filtro
  (Mercancía / Muebles / Todo), botón "Editar plano" (solo con permiso y ≥ md).
- **Vista**: SVG `viewBox="0 0 columnas*32 filas*32"`, contenedor con scroll en
  ambos ejes. Ubicaciones = rect redondeado `bg` por tipo (tokens existentes
  `--chart-*`), con nombre y nº de productos. Mobiliario = rect con icono lucide
  por tipo y borde por estado (`mantenimiento` → warning, `baja` → atenuado).
- Tocar ubicación → `Sheet` lateral: lista de productos con cantidad (editable
  si `inventario.editar`: input numérico + guardar), botón "Agregar producto"
  (combobox), total. Tocar mueble → `Sheet` con ficha (foto, estado, recurso
  enlazado, notas) y acciones.
- Buscador: al elegir producto, resaltar (anillo `ring-primary` + `anim-pulso` del
  plan 05) las ubicaciones que lo tienen y mostrar "Sin ubicar: N".
- **Edición**: paleta lateral "Agregar vitrina / estante / bodega / mostrador /
  mueble…" que coloca un elemento 2×1 en la primera celda libre; arrastrar mueve
  (snap a celda), asa en la esquina inferior derecha redimensiona; al soltar →
  `moverElemento` con actualización optimista y revertir en error. Cuadrícula
  visible solo en modo edición. `Supr`/botón "Quitar" desactiva.
- Accesibilidad: además del SVG, una **lista** colapsable "Ver como lista" por
  piso (ubicaciones con sus productos; muebles con estado) para teclado/lectores.

Integraciones:
- `/admin/inventario` (tabla de existencias): columna "Ubicación" con nombres
  separados por coma (máx. 2 + "+N"), enlace a `/admin/plano?producto=<id>`.
- Mobiliario con `recursoId`: mostrar el nombre del recurso en la ficha y en
  `/admin/agenda` → panel de recursos, el chip "Mueble: X" (solo lectura).

## Pasos

1. Esquema + migración + `rules.ts` con tests (traslape, límites, reducción de piso).
2. Acciones.
3. Vista (SVG + sheets + buscador + lista accesible).
4. Editor (paleta, arrastre, redimensión, optimista).
5. Integración con inventario y recursos. Item de navegación.

## Criterios de aceptación

- Crear "Planta baja" y "Planta alta", colocar 2 vitrinas y 3 sillas; no se
  permite encimarlas ni sacarlas del piso.
- Asignar productos a una vitrina; al tocarla se ven; buscar un producto resalta su vitrina.
- Una silla puede enlazarse a un recurso de agenda existente.
- En celular el plano se ve y se recorre con scroll; no se edita.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:check`, `pnpm test:usability`
y `pnpm test:perf --only=plano` con `pnpm dev`.

## Fuera de alcance

Imagen del local como fondo, rotación de elementos, descuento de stock por
ubicación al vender, rutas de surtido, inventario de activos con depreciación.

## Desviaciones (la llena el implementador)

Implementado según el plan. Diferencias menores respecto al texto:

- `mobiliario.fotoId → medios.id` quedó con `onDelete: "set null"`: la ruta
  `/api/medios/[...key]` borra la fila de `medios` al eliminar un archivo y sin
  ese comportamiento la FK impediría borrar fotos ya ligadas a un mueble.
- La subida de foto pasa por el pipeline existente de `medios`
  (`MEDIO_ENTIDADES` + `PERMISO_POR_ENTIDAD["mobiliario"] = "sucursales.editar"`);
  el route handler de `/api/medios` actualiza `mobiliario.fotoId` tras crear la
  fila de media. No se creó un canal de archivos paralelo.
- El arrastre valida en vivo contra los demás elementos y dibuja un marco
  verde/rojo; al soltar en posición inválida la figura regresa sola **sin** ir al
  servidor (`moverElemento` solo se llama cuando el destino cambió y es válido).
- El modo "Editar plano" se deriva de `useMediaQuery("(min-width: 48rem)")` en
  vez de desactivarse con un efecto: si la ventana se estrecha el plano pasa a
  solo lectura y al agrandarse vuelve la edición (sin reset de estado).
- La pestaña de piso activo cae al primer piso si el seleccionado desaparece
  (p. ej. porque otro usuario lo quitó), calculado con `useMemo` sin efecto.
- Mensaje móvil verbatim: `Edita el plano desde una tablet o computadora`.

Verificación:
- `pnpm typecheck` ✅ 0 errores · `pnpm lint` ✅ 0 errores/avisos ·
  `pnpm test` ✅ 502 verdes (4 omitidas preexistentes, `db/concurrencia`) ·
  `pnpm db:generate` ✅ `drizzle/0052_brief_firebrand.sql` · `pnpm db:check` ✅.
- `BLOQUEO (solo entorno):` `pnpm test:usability` y `pnpm test:perf --only=plano`
  no pudieron correr de forma válida: esta máquina no tiene `.env`
  (`DATABASE_URL`/`BETTER_AUTH_SECRET` ausentes), así que `pnpm dev` responde
  500 en todo `/admin/*` y el chequeo solo mide la página de error de Next.js.
  La migración `0052` quedó generada pero **no aplicada** por la misma razón.
