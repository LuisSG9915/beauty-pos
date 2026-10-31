# 26 — Modo Cobro Rápido por defecto en el punto de venta

**Prioridad:** P0 · **Depende de:** — ·
**Tiempo estimado:** 35 min · **Archivos previstos:** 3 (2 prod + 1 prueba E2E)

**Objetivo\***
Al abrir un ticket en `/admin/pos`, la operadora ve únicamente las pestañas de
Servicios y Productos cuando no hay cliente asignado, el TOTAL destaca arriba
del resumen antes del desglose, y los formularios de descuento, promoción y
membresía quedan agrupados bajo un único desplegable cerrado por defecto para
que el bloque de cobro y su botón `"Cobrar $X"` queden arriba sin hacer scroll
largo.

**Fuera de alcance\***
- No modificar reglas de negocio ni cálculos en `src/modules/pos/*` ni
  `src/app/admin/pos/actions.ts`.
- No agregar una segunda barra fija inferior que compita con `AdminTabBar`
  (`z-40`) o con el `sticky bottom-0` de `CobroForm` (violaría S1 al duplicar
  `data-action-clave="1"`).
- No tocar el formato físico de `src/app/admin/pos/printable-ticket.tsx`.

## Contrato de contexto

- **Archivos permitidos para lectura (máximo 4):**
  1. `src/app/admin/pos/catalogo-selector.tsx`
  2. `src/app/admin/pos/venta-ticket.tsx`
  3. `src/app/admin/pos/cobro-form.tsx`
  4. `scripts/flows-e2e.ts`
- **Archivos que NO debes abrir:** `src/db/*`, `src/modules/pos/*`, `drizzle/*`.

## Contexto verificado\*

- `src/app/admin/pos/catalogo-selector.tsx:22-27, 156-180` — Renderiza siempre
  las 4 pestañas (`servicios`, `productos`, `paquetes`, `membresias`) aunque
  `hasCliente` (`línea 47`) sea `false`, y muestra un aviso en `líneas 224-228`
  solo cuando el usuario entra a esas pestañas bloqueadas.
- `src/app/admin/pos/venta-ticket.tsx:801-910` — En la columna `<aside>`, la
  sección `Resumen de cobro` muestra primero el desglose (`Subtotal`,
  `Cubierto por paquete`, `Descuento directo`, `Promoción`, `Membresía`,
  `Propina` en `810-857`) y deja el recuadro de `Total` al final (`860-872`).
- `src/app/admin/pos/venta-ticket.tsx:912-1072` — Apila 3 bloques independientes
  cuando `editable === true`: formulario de `Descuento` (`912-961`), sección de
  `Promoción` (`963-1018`) y sección de `Membresía del cliente` (`1020-1072`),
  empujando `<CobroForm>` (`1108-1118`) hacia el final de la página.
- `scripts/flows-e2e.ts:852, 1302, 1394, 1444-1450` — El arnés E2E interactúa
  con `input[name="descuento"]`, el combobox `"Promoción vigente"`, la pestaña
  `"Membresías"` de `agregarAlTicket` (ya con cliente asignado en ese flujo) y
  el combobox `"Membresía vigente"`. En Puppeteer, los clics sobre los combobox
  requieren que el contenedor `<details>` esté abierto.

## Diseño decidido

1. **Pestañas condicionales + indicio de descubribilidad en
   `catalogo-selector.tsx`:**
   - Definir
     `const tabsVisibles = hasCliente ? TABS : TABS.filter((t) => t.value === "servicios" || t.value === "productos");`
   - Si `!hasCliente && (tab === "paquetes" || tab === "membresias")`, usar
     `"servicios"` como pestaña efectiva
     (`const tabEfectivo = !hasCliente && (tab === "paquetes" || tab === "membresias") ? "servicios" : tab;`).
   - Cuando `!hasCliente && (paquetes.length > 0 || membresias.length > 0)`,
     mostrar debajo de la barra de pestañas/búsqueda un texto discreto de 1
     línea:
     `<p className="text-op-xs text-muted-foreground">Asigna un cliente en el encabezado del ticket para vender paquetes o membresías.</p>`
2. **Prioridad visual del TOTAL en `venta-ticket.tsx`:**
   - En `Resumen de cobro` (`líneas 801-910`), colocar primero el bloque
     destacado de `Total`
     (`text-2xl sm:text-3xl font-extrabold tabular-nums text-primary`).
   - Debajo del `Total`, envolver el desglose de líneas (`Subtotal`,
     descuentos, promoción, membresía, propina) en un
     `<details className="group mt-3" open={tieneAjustesResumen}>` con
     `<summary className="cursor-pointer text-op-xs font-medium text-muted-foreground hover:text-foreground">Ver desglose detallado</summary>`,
     donde `tieneAjustesResumen` es `true` solo si hay descuentos, promoción,
     membresía, anticipos, devoluciones o propina mayor a 0.
3. **Agrupación de beneficios en un único `<details>` colapsado y subida de
   `<CobroForm>`:**
   - Mover `<CobroForm>` inmediatamente debajo de `Resumen de cobro` (y
     `Anticipos de la cita` si existen) para que el cobro rápido sea lo primero
     en `<aside>`.
   - Agrupar los 3 bloques (`Descuento`, `Promoción`, `Membresía del cliente`
     solo cuando `Boolean(venta.clienteId)`) dentro de un único
     `<details data-testid="pos-beneficios-details" className="rounded-2xl border border-border/80 bg-card shadow-sm" open={tieneBeneficioActivo}>`,
     donde
     `tieneBeneficioActivo = Number(venta.descuento) > 0 || Boolean(venta.promocionId) || Boolean(venta.membresiaId)`.
   - El `<summary>` lleva
     `className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-semibold text-foreground"`
     con el texto `"Descuentos, promoción y membresía"`.

## Pasos

1. **`src/app/admin/pos/catalogo-selector.tsx`** — Filtrar `TABS` por
   `hasCliente` usando `tabEfectivo` para calcular `items`, conservar el
   indicio de 1 línea cuando `!hasCliente` y eliminar el aviso huérfano de las
   líneas `224-228`.
   - Verificación inmediata: `pnpm typecheck`
2. **`src/app/admin/pos/venta-ticket.tsx`** — Invertir el orden dentro de
   `Resumen de cobro` (Total arriba, desglose en `<details>` abajo), colocar
   `<CobroForm>` antes de los formularios secundarios y agrupar `Descuento`,
   `Promoción` y `Membresía del cliente` dentro de
   `<details data-testid="pos-beneficios-details">`.
   - Verificación inmediata: `pnpm typecheck && pnpm lint`
3. **`scripts/flows-e2e.ts`** — Antes de los pasos de descuento (`línea 852`),
   promoción (`línea 1302`) y membresía (`línea 1444`), asegurar la apertura
   del desplegable con
   `await page.evaluate(() => document.querySelector('details[data-testid="pos-beneficios-details"]')?.setAttribute("open", ""));`.
   - Verificación inmediata: `pnpm typecheck`

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint` → 0 errores.
- [ ] `pnpm test` → todas las pruebas unitarias en verde.
- [ ] `pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/pos`
      → 0 errores, `horizontalOverflow: false` y exactamente 1
      `data-action-clave="1"`.
- [ ] Recorrido manual en `/admin/pos`: en venta sin cliente solo aparecen las
      pestañas `Servicios` y `Productos` más el indicio de 1 línea; el `Total`
      aparece arriba del resumen; los formularios de
      descuento/promoción/membresía inician colapsados en un solo bloque.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/pos
pnpm tsx scripts/axe-detail.ts --only=/admin/pos
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 35 min (una sesión) |
| Archivos tocados | 2 de producción + 1 de prueba E2E |
| Contexto | ≤ 150k tokens |
| Lecturas antes de editar | ≤ 4 archivos |

## Criterios de parada (`BLOQUEO:`)

- El código real de `catalogo-selector.tsx` o `venta-ticket.tsx` contradice el
  "Contexto verificado".
- Algún cambio requiere modificar firmas de Server Actions en
  `src/app/admin/pos/actions.ts`.
- `usability-check.ts` reporta más de un `data-action-clave="1"` en
  `/admin/pos`.

## Reporte (al terminar)

```
Misión: 26 — Modo Cobro Rápido por defecto en el punto de venta
Cambios: catalogo-selector.tsx → pestañas condicionales por hasCliente + indicio de 1 línea; venta-ticket.tsx → Total arriba, desglose en <details>, CobroForm antes de beneficios, beneficios en <details data-testid>; flows-e2e.ts → abre el details antes de descuento/promoción/membresía
Verificación: typecheck ✔ | lint ✔ | test 577 ✔ | usability /admin/pos 0 errores | axe 0 violaciones | recorrido Puppeteer ✔ (2 pestañas, indicio, details cerrado, orden resumen→cobro→beneficios, 1 data-action-clave, sin overflow)
Antes → después: 4 pestañas sin cliente y 3 tarjetas de descuento abiertas → 2 pestañas + 1 desplegable colapsado
Desviaciones: 3 (ver abajo)
Riesgo abierto: ninguno
```

## Desviaciones (las escribe el implementador)

1. Los 3 bloques internos del `<details>` de beneficios perdieron su propio
   borde de tarjeta (doble tarjeta anidada se veía recargada): ahora son
   secciones `px-5 py-4` dentro de un contenedor `divide-y` con `border-t`.
   Mismo contenido y mismos controles.
2. Se añadió un `ChevronDown` (lucide, ya en el stack) al `<summary>` del
   bloque de beneficios como afordancia de desplegable (`group-open:rotate-180`).
3. El aviso original explicaba el porqué por tipo ("el saldo/la vigencia se
   crea a su nombre"); el indicio nuevo es el texto genérico de 1 línea
   decidido en el plan.
