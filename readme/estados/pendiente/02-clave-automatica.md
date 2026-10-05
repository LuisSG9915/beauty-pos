# Plan 02 — Clave automática a partir del nombre

**Modelo recomendado:** SWE-2 MAX
**Dolor que resuelve:** "En el CRUD de alta aparece clave y nombre; siempre le
pongo lo mismo, es redundante."

## Contexto verificado

`clave` es `NOT NULL` con `uniqueIndex(org, clave)` en ~15 tablas de catálogo:
`catCategoriasServicios`, `servicios`, `catCategoriasProductos`,
`catUnidadesMedida`, `catMediosPago`, `catImpuestos`, `paquetes`, `membresias`,
`promociones` (`catalogs.ts`), `organizaciones`, `sucursales` (`core.ts`),
`catGastos`/`gastos` (`finance.ts`), `roles`, `permisos` (`access.ts`),
`planes` (`billing.ts`), productos usan `sku` en vez de `clave`.

## Diseño decidido

**No tocar el esquema.** `clave` sigue `NOT NULL` + único; el servidor la genera.

1. Helper `src/lib/clave.ts`:
   ```ts
   slugClave(nombre): "Shampoo reparador 300ml" → "shampoo-reparador-300ml"
   ```
   minúsculas, sin acentos (NFD + strip), caracteres no alfanuméricos → `-`,
   recorte al largo de la columna (40–80 según tabla).
2. **Servidor**: al crear, si el form no trae clave, `slugClave(nombre)`; si choca
   con existente en la org → sufijo `-2`, `-3`… Al editar, no regenerar si ya
   existe clave (estabilidad de URLs/datos).
3. **UI**: quitar el campo clave del alto. Dejar "Opciones avanzadas → Clave"
   solo en edición para quien quiera personalizarla.
4. **Productos (SKU)**: mismo criterio — SKU opcional; si viene vacío se genera
   del nombre (`sha-` + slug corto o secuencial por org). Decisión: slug del
   nombre con sufijo numérico, consistente con el resto.
5. Catálogos internos que el usuario no da de alta a mano (roles, permisos,
   planes) quedan igual.

## Pasos

1. `src/lib/clave.ts` + test unitario `clave.test.ts` (acentos, duplicados,
   longitud, vacío → fallback `"item"` + timestamp corto).
2. Helper de unicidad por tabla: función `claveDisponible(db, tabla, orgId, base)`
   que itera sufijos. Implementar por cada action de catálogo (son pocas:
   categorías, unidades, medios de pago, impuestos, servicios, sucursales,
   paquetes, membresías, promociones, productos-sku).
3. Formularios: quitar/relajar el input de clave en `*-form.tsx` de cada admin.
4. Mensajes de error: si el usuario escribió una clave duplicada a mano, error
   claro "Esa clave ya existe".

## Criterios de aceptación

- Dar de alta "Corte de caballero" sin tocar clave → se crea con `corte-de-caballero`.
- Repetir el nombre → `corte-de-caballero-2`, sin error.
- Edición no rompe claves existentes ni URLs.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test` (incluye test nuevo), `pnpm test:usability`.

## Fuera de alcance

Cambio de columnas/NOT NULL en esquema, renombrado de claves históricas.

## Desviaciones (la llena el implementador)

_Vacío. Anotar aquí cualquier diferencia entre el plan y el código real, y `BLOQUEO:` si algo impide continuar._
