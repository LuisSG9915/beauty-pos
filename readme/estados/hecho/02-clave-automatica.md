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

1. **Vacío → `"item"` sin timestamp.** El paso 1 mencionaba `"item" + timestamp
   corto`; se dejó `"item"` determinista porque `claveDisponible` ya resuelve
   choques con `-2`, `-3`… (y queda cubierto por el test).
2. **Clave manual conserva la transformación previa de cada esquema**
   (`toUpperCase` en catálogos, `toLowerCase` en sucursales, `sku` como se
   escribió). Las claves generadas sí salen en minúsculas según el plan.
3. **Chequeo de duplicado case-insensitive y sin filtro `activo`.** Los
   `uniqueIndex(org, clave)` no son parciales y hay claves históricas en
   mayúscula: se compara con `lower(clave)` para evitar "corte" vs "CORTE" y
   choques contra filas inactivas (decisión pedida por el plan, índices
   verificados en `src/db/schema/catalogs.ts` y `core.ts`).
4. **Edición: el campo clave/sku NO se rellena con el valor actual** — va
   vacío con el actual como `placeholder` y el hint "Déjala vacía para
   conservar la clave actual", dentro de `<details>` "Opciones avanzadas".
   Motivo: si viniera prellenado, la transformación de mayúsculas del esquema
   reescribiría las claves generadas en minúsculas en cada edición ajena.
5. **`createOrganization` (`src/app/admin/actions.ts`, solo plataforma)**
   también genera `sucursalClave` del nombre de la sucursal cuando llega
   vacía; el campo quedó opcional en `organization-form.tsx` (no está en la
   lista del plan pero es el mismo patrón de alta de sucursal).
6. **`catGastos` quedó igual**: ya derivaba clave del nombre internamente
   (`claveDeCategoria`, mayúsculas + `_`, error si el nombre se repite — la
   unicidad ahí es por nombre, no por clave). Fuera de la lista del plan.
7. **`scripts/flows-e2e.ts` actualizado**: llenaba `clave`/`sku` en los altas
   de catálogo (`setNativeInput` lanza "Input no encontrado" si falta el
   campo). Ahora llena solo campos visibles — el flujo ejercita la
   generación automática.
8. **Carrera en generación**: el chequeo consulta y luego inserta; dos altas
   simultáneas del mismo nombre podrían elegir la misma clave y una fallaría
   en el índice único (mismo comportamiento que hoy con claves manuales). En
   sucursales sí queda serializada por el `FOR UPDATE` sobre la fila de la
   organización que ya existía en la transacción.
9. **Roles/permisos/planes/organizaciones** sin cambios (catálogos internos,
   según el plan).
10. `pnpm typecheck`, `pnpm lint`, `pnpm test` en verde (10 tests nuevos en
    `src/lib/clave.test.ts`). `test:usability`/`test:smoke` no corren en este
    entorno (sin `.env` ni Chrome); aplican en el entorno del usuario.
