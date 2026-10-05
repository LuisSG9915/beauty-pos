# Plan 10 — Compras: foto del ticket, seguimiento y verificación

**Modelo:** SWE-2 MAX (diseño, prompt y schema cerrados — **no modificar el prompt
ni el schema sin revisión**)
**Depende de:** 07 (R2 + `medios`) y 08 (`src/lib/ia/`, `uso_ia`)
**Dolor:** "Subir foto del ticket de compra, se analiza y guarda en Compras; el
recepcionista da seguimiento, verifica que venga bien y si no marca observación."

## Decisiones cerradas

| Tema | Decisión |
|---|---|
| Asíncrono | **Sin Queues.** El análisis corre en la misma petición (`POST /api/compras/[id]/analizar`), la UI muestra "Leyendo ticket…". Esperar a Workers AI es I/O, no CPU. Si falla o pasa de 45 s, la compra queda en `borrador` con botón "Reintentar". (Queues requeriría un worker propio junto a OpenNext; no se justifica.) |
| Modelo | El mismo de plan 08 (`@cf/meta/llama-4-scout-17b-16e-instruct`), `max_tokens` 1500 |
| Entrada de stock | Una sola vez, al **Recibir**, por la **cantidad recibida** de cada línea emparejada |
| Observación | Se detecta sola si `recibida ≠ cantidad` o hay nota por línea; también manual a nivel compra |
| Emparejar productos | En JS (catálogos chicos), sin `pg_trgm` |
| Costo | Al recibir, opción "Actualizar costo de los productos" (marcada por defecto) → `productos.costo = costo_unitario` |
| Pagos a proveedor | Fuera (no tocar `gastos` ni caja) |

## Máquina de estados

```
borrador ──(análisis OK o captura manual con ≥1 línea)──▶ por_verificar
por_verificar ──Recibir──▶ verificada        (todo cuadra)
por_verificar ──Recibir──▶ con_observacion   (alguna diferencia/nota)
con_observacion ──Resolver (nota obligatoria)──▶ verificada   (sin tocar stock)
borrador | por_verificar | con_observacion ──Cancelar──▶ cancelada
```
`verificada` y `cancelada` son finales. Recibir solo desde `por_verificar`.
Los cambios de estado validan el estado de origen **dentro de la transacción**
(`select … for update` de la compra).

## Esquema (`src/db/schema/compras.ts`, exportar en `schema/index.ts`)

```ts
export const COMPRA_ESTADOS = ["borrador","por_verificar","verificada","con_observacion","cancelada"] as const;

export const proveedores = pgTable("proveedores", {
  id, organizacionId → organizaciones,
  nombre: varchar(160).notNull(), telefono: varchar(40), correo: varchar(160), notas: text,
  activo: boolean.default(true), ...catalogAuditColumns,
}, t => [uniqueIndex("proveedores_org_nombre_uq").on(t.organizacionId, t.nombre)]);

export const compras = pgTable("compras", {
  id, organizacionId, sucursalId → sucursales (notNull),
  proveedorId → proveedores (null),
  proveedorTexto: varchar(160),             // lo leído del ticket
  folio: varchar(80), fechaCompra: date,
  estado: varchar(20).default("borrador").notNull(),
  totalTicket: numeric(12,2),                // leído del ticket
  totalCalculado: numeric(12,2).default("0").notNull(),   // Σ importes de líneas activas
  medioTicketId: uuid → medios (null),
  analisisIa: jsonb,                         // salida validada por zod (sin imagen)
  analisisError: text,
  observaciones: text,
  actualizarCostos: boolean.default(true).notNull(),
  recibidaPor: uuid → usuarios, recibidaAt: timestamptz,
  resueltaPor: uuid → usuarios, resueltaAt: timestamptz,
  activo: boolean.default(true), ...opAuditColumns,
}, t => [
  index("compras_org_idx").on(t.organizacionId),
  index("compras_sucursal_estado_idx").on(t.sucursalId, t.estado),
  check("compras_estado_chk", sql`estado in ('borrador','por_verificar','verificada','con_observacion','cancelada')`),
]);

export const detalleCompras = pgTable("detalle_compras", {
  id, compraId → compras, organizacionId,
  productoId → productos (null),             // null = sin emparejar
  descripcion: varchar(240).notNull(),
  cantidad: numeric(12,3).notNull(),
  cantidadRecibida: numeric(12,3),           // null hasta recibir
  costoUnitario: numeric(12,2).notNull(),
  importe: numeric(12,2).notNull(),
  observacion: text,
  origen: varchar(10).default("manual").notNull(),   // ia | manual
  activo: boolean.default(true), ...opAuditColumns,
}, t => [index("detalle_compras_compra_idx").on(t.compraId), index("detalle_compras_producto_idx").on(t.productoId)]);
```

Además:
- `movimientos_inventario.compra_id uuid null → compras.id` + índice.
- `InventoryMovementInput.compraId?: string | null` en `modules/inventory/service.ts`
  y pasarlo al insert (sin cambiar la lógica de delta).
- `medios.entidad` admite `"compra"` (ya previsto en plan 07).

## Permisos y navegación

- `src/lib/auth/defaults.ts`: agregar
  `compras.ver` "Ver compras", `compras.editar` "Capturar y editar compras",
  `compras.recibir` "Recibir compras y dar entrada a inventario" (módulo `compras`).
  Roles: propietario/administrador/gerente los heredan; **recepcion** y **almacen**
  reciben los tres. Después: `pnpm access:seed` (documentar en el PR).
- `admin-nav.tsx`: item `{ path: "/admin/compras", label: "Compras", description: "Tickets de proveedores y recepción de mercancía", icon: Truck, permiso: "compras.ver" }`
  en el grupo de Inventario, justo después de Inventario.

## Endpoints y acciones

| Acción | Tipo | Permiso | Efecto |
|---|---|---|---|
| `crearCompraConTicket` | route `POST /api/compras` (multipart: org, sucursal, foto?) | `compras.editar` + `assertBranchScope` | sube foto a R2 (`medios`, entidad compra), crea compra `borrador`; responde `{ id }` |
| analizar | route `POST /api/compras/[id]/analizar` | `compras.editar` | `consumirCuotaIa(…,"ticket")`, lee la foto de R2, IA, post-proceso, reemplaza líneas `origen=ia` activas, estado → `por_verificar` (o `borrador` + `analisisError`) |
| `guardarLineaCompra` / `quitarLineaCompra` | server action | `compras.editar` | solo en `borrador`/`por_verificar`; recalcula `totalCalculado` |
| `guardarDatosCompra` | server action | `compras.editar` | proveedor (id o crear por nombre), folio, fecha, observaciones |
| `recibirCompra` | server action | `compras.recibir` | ver abajo |
| `resolverObservacion` | server action | `compras.recibir` | nota obligatoria, → `verificada` |
| `cancelarCompra` | server action | `compras.editar` | → `cancelada` |

**`recibirCompra` (una transacción):**
1. Lock compra; exigir `estado = por_verificar` y ≥ 1 línea activa.
2. Recibe `cantidadRecibida` por línea (default = `cantidad`) y `actualizarCostos`.
3. Exigir que toda línea con `cantidadRecibida > 0` tenga `productoId` (error claro
   "Empareja todas las líneas o pon recibido 0").
4. Por línea emparejada con recibido > 0: `applyInventoryMovement(tx, { tipo: "entrada", cantidad: recibida, compraId, notas: \`Compra ${folio ?? ""}\`.trim(), … })`; si devuelve error → abortar.
5. Si `actualizarCostos`: `update productos set costo = costoUnitario` por producto.
6. Estado = `con_observacion` si alguna línea tiene `recibida ≠ cantidad` u
   `observacion`, o la compra tiene `observaciones`; si no `verificada`.
   Si `totalTicket` y `|totalTicket − totalCalculado| > 1.00` → añadir a
   `observaciones` "El total del ticket ($X) no coincide con la suma de las líneas ($Y)." y estado `con_observacion`.
7. `recibidaPor/At`; `auditEvent(tx, …)` de `src/lib/audit.ts` (mismo patrón que otras actions).
8. `revalidatePath("/admin/compras")`, `"/admin/inventario"`.

## Prompt del ticket (texto exacto)

**system:**
```
Eres un asistente que lee fotografías de tickets y notas de compra de proveedores de productos de belleza en México. Respondes solo con JSON válido que cumpla el esquema. Copia los textos tal como aparecen; si un dato no se lee con claridad devuelve null y nunca inventes renglones, cantidades ni importes. Los importes están en pesos mexicanos.
```

**instruccion:**
```
Lee el ticket y extrae:
- proveedor: nombre comercial del negocio que vende.
- folio: número de ticket, nota o factura.
- fecha: fecha de la compra en formato AAAA-MM-DD.
- total: total final pagado.
- lineas: un elemento por cada producto comprado, en el orden del ticket, con:
  - descripcion: texto del renglón tal como aparece.
  - cantidad: número de piezas o unidades (1 si no se indica).
  - costoUnitario: precio por unidad; si solo hay importe, divídelo entre la cantidad.
  - importe: importe del renglón.
  - codigo: código o SKU del renglón si aparece.
No incluyas como líneas los subtotales, impuestos, descuentos globales, cambio ni forma de pago.
- dudas: renglones o datos que no pudiste leer bien, en texto breve.
```

**jsonSchema:**
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["proveedor","folio","fecha","total","lineas","dudas"],
  "properties": {
    "proveedor": { "type": ["string","null"], "maxLength": 160 },
    "folio": { "type": ["string","null"], "maxLength": 80 },
    "fecha": { "type": ["string","null"], "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "total": { "type": ["number","null"], "minimum": 0 },
    "lineas": {
      "type": "array", "maxItems": 60,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["descripcion","cantidad","costoUnitario","importe","codigo"],
        "properties": {
          "descripcion": { "type": "string", "maxLength": 240 },
          "cantidad": { "type": "number", "exclusiveMinimum": 0 },
          "costoUnitario": { "type": ["number","null"], "minimum": 0 },
          "importe": { "type": ["number","null"], "minimum": 0 },
          "codigo": { "type": ["string","null"], "maxLength": 40 }
        }
      }
    },
    "dudas": { "type": "array", "items": { "type": "string", "maxLength": 200 }, "maxItems": 10 }
  }
}
```

**Post-proceso determinista** (en `src/modules/compras/rules.ts`, con tests):
- `costoUnitario` null y `importe` presente → `importe / cantidad` (2 decimales).
  `importe` null → `costoUnitario × cantidad`. Ambos null → descartar la línea y
  añadir a `dudas`.
- `fecha` inválida o futura → null. `fechaCompra` default = hoy en zona de la sucursal.
- Proveedor: si coincide (normalizado) con un `proveedores.nombre` de la org →
  `proveedorId`; si no, `proveedorTexto`.
- Emparejar cada línea con productos activos de la org:
  1. `codigo` igual a `productos.codigo_barras` o `productos.sku` → match exacto.
  2. Si no, puntaje = Jaccard de tokens normalizados (minúsculas, sin acentos, sin
     tokens de 1 carácter, números con unidad unidos "400ml") entre `descripcion` y
     `nombre`. Mejor puntaje ≥ 0.6 y al menos 0.15 por encima del segundo → auto-emparejar.
  3. Devolver además top 3 candidatos por línea para la UI.
- `dudas` → se guardan en `analisisIa` y se muestran.

## Pantallas

- **`/admin/compras`**: lista filtrable por estado (chips con conteo) y sucursal
  actual; columnas: fecha, proveedor, folio, nº líneas, total, estado (badge),
  quién recibió. Acción primaria `data-action-clave="1"` **"Nueva compra"**.
  `con_observacion` arriba y resaltadas.
- **Nueva compra**: botón grande "Tomar foto del ticket" (`capture="environment"`)
  + enlace "Capturar sin foto". Tras subir → navega al detalle y lanza el análisis.
- **Detalle `/admin/compras/[id]`**: escritorio en dos columnas (foto con zoom
  — `<img>` en contenedor con scroll — | datos + líneas); móvil apilado con la foto
  colapsable. Líneas editables: descripción, producto (combobox existente
  `components/ui/combobox.tsx` con los 3 candidatos arriba + "Crear producto"
  que abre el alta rápida del plan 03 en sheet), cantidad, costo, importe,
  observación. Al recibir: columna "Recibido" (default = cantidad) + checkbox
  "Actualizar costo de los productos". Botones según estado y permisos.
- **Producto (plan 03)**: en "Más opciones" sección "Últimas compras" (5 últimas
  líneas verificadas con proveedor, fecha, costo).

## Pasos

1. Esquema + migración + `compraId` en inventario + permisos + nav.
2. `src/modules/compras/rules.ts` (post-proceso, emparejamiento, estado resultante
   al recibir) + `rules.test.ts`.
3. Route handlers (crear, analizar) y server actions.
4. Pantallas lista, nueva, detalle.
5. "Últimas compras" en producto.

## Tests mínimos obligatorios

- Emparejamiento: código exacto; Jaccard sobre umbral; empate → sin auto-emparejar.
- Completar costo/importe faltante; descartar línea sin ambos.
- Estado al recibir: todo igual → `verificada`; una diferencia → `con_observacion`;
  diferencia de total > $1 → `con_observacion` con texto.
- `recibirCompra` dos veces → la segunda falla (estado ya no es `por_verificar`) y el
  stock solo aumenta una vez (test de integración con la BD de pruebas si el
  proyecto ya tiene patrón; si no, test del guard puro).

## Criterios de aceptación

- Foto de ticket → líneas leídas y emparejadas en < 30 s; si la IA falla, captura manual posible.
- Recibir suma stock en la sucursal correcta una sola vez y queda trazado (`compra_id`).
- Diferencias quedan como "Con observación" y se resuelven con nota.
- Recepción puede capturar, verificar y recibir; un especialista no ve el módulo.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:check`, `pnpm test:usability`
con `pnpm dev`; `pnpm access:seed` en local y comprobar el menú con el rol recepción.

## Fuera de alcance

Cuentas por pagar/pagos a proveedores, enlace a gastos, CFDI de compra, órdenes de compra.

## Desviaciones (la llena el implementador)

_Vacío. Anotar aquí cualquier diferencia entre el plan y el código real, y `BLOQUEO:` si algo impide continuar._
