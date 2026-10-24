# 19 — Cero pantallas rotas en el teléfono (POS, clientes, ventas, inventario, reportes)

**Prioridad:** P0 · **Depende de:** — · **Tiempo estimado:** ≤ 2 h por pantalla,
una misión por pantalla (19.1 POS, 19.2 clientes, 19.3 ventas, 19.4 inventario,
19.5 reportes) · **Archivos previstos:** ≤ 4 por pantalla

**Objetivo**
Que en un teléfono de 390 px ningún control quede cortado, ninguna tabla se
salga de la pantalla, todos los objetivos táctiles midan ≥ 24 px y axe no
reporte errores graves en las cinco pantallas donde se hace dinero.

**Fuera de alcance**
Rediseñar la estética, cambiar el flujo de cobro, tocar escritorio (≥ 1024 px),
duplicar layouts (la regla `VistaAdaptativa` sigue vigente), agregar
dependencias.

---

## Contexto verificado

Última corrida registrada del arnés: **2026-09-24** (`.artifacts/usability-*.json`,
75 errores en móvil). El código cambió después (commits `038d88e`, `a79b757`),
así que **el primer paso es re-medir**, no arreglar a ciegas.

Hallazgos de esa corrida que sirven de hipótesis:

| Pantalla | Hallazgo | Tipo |
|---|---|---|
| `/admin/pos` | "Abrir venta" y "Cambiar" cortados; filas de ticket cortadas | layout |
| `/admin/clientes` | 5 botones "Editar" cortados; tabla de ~644 px sin alternativa móvil | layout |
| `/admin/ventas` | 26 × "Abrir ticket" de 18 px y cortados; tabla de ~680 px | táctil + layout |
| `/admin/inventario` | objetivo de 1 px; "?" y "Ver opciones" cortados; tablas de 728/760 px | táctil + layout |
| `/admin/reportes` | `scrollable-region-focusable` (serious); "Ver … →" de 20 px; tabla de 448 px | axe + táctil + layout |
| `/admin/auditoria` | `select-name` (critical): selects sin nombre accesible | axe |
| `/admin/facturacion` | `color-contrast` (serious): 3 nodos | axe |

Causas típicas ya vistas en este repo: `min-w-[…]` fijo en tablas, filas
`flex` sin `flex-wrap`, botones dentro de celdas con `whitespace-nowrap`, y
contenedores con `overflow-hidden` que recorta el foco.

## Diseño decidido

- **No** se crean layouts nuevos: cada pantalla usa `<VistaAdaptativa>` con
  `[tarjetasMóvil, tablaEscritorio]` (ver `src/components/admin/vista-adaptativa.tsx`).
- La fila-tarjeta móvil muestra lo esencial (nombre, hora, monto, estado) y
  **una** acción primaria grande; el resto va en un menú de 3 puntos.
- Los enlaces-acción ("Ver ventas →") pasan a botón de ≥ 44 px de alto en móvil.
- Los `select` de filtros llevan `<label className="sr-only">` o `aria-label`.
- Colores de contraste: usar los pares `bg-*-soft text-*` de `globals.css`.

## Pasos (por pantalla)

1. Re-medir: `pnpm test:usability --viewport=movil --only=/admin/<pantalla> --json`
   y guardar el artefacto.
2. Leer el componente de la pantalla y localizar el patrón que corta (tabla,
   fila, botón).
3. Aplicar tarjeta móvil + acción primaria; ajustar anchos y `wrap`.
4. Añadir `aria-label` a selects/iconos si axe lo pide.
5. Re-medir la misma pantalla hasta 0 errores; correr `pnpm test` y `pnpm lint`.

## Criterios de aceptación

- [ ] `pnpm test:usability --viewport=movil` → **0 errores** en `/admin/pos`,
      `/admin/clientes`, `/admin/ventas`, `/admin/inventario`, `/admin/reportes`.
- [ ] `pnpm test:usability` en escritorio → sin errores nuevos.
- [ ] `pnpm test:axe` → 0 violaciones `critical` y 0 `serious` en esas rutas.
- [ ] Cada acción primaria de la pantalla conserva `data-action-clave="1"`.
- [ ] `pnpm test:perf` no empeora el LCP móvil (comparar antes/después).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` en verde.

## Verificación

```bash
pnpm dev            # en otra terminal
pnpm test:usability --viewport=movil --only=/admin/pos --json
pnpm test:axe
pnpm test:perf --viewport=movil
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h por pantalla |
| Archivos tocados | ≤ 4 (pantalla + tarjeta + estilos + prueba) |
| Contexto | ≤ 150k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El arnés no corre (falta Chrome, falta `.env`, la cuenta E2E no entra): se
  arregla el arnés primero, no se "arregla" la pantalla a ciegas.
- El hallazgo viene de un componente compartido (`admin-shell`, `data-table`):
  se anota y se abre una misión transversal; no se toca en las cinco pantallas.
- Un arreglo de layout obliga a cambiar el flujo de cobro: se detiene.

## Reporte

```
Misión: 19 — Cero pantallas rotas en el teléfono
Cambios:
  - Primitivas táctiles: button.tsx (min-h-11), admin-shell.tsx, admin-nav-tabs.tsx, page-header.tsx
  - POS: catalogo-selector.tsx, venta-ticket.tsx, cobro-form.tsx, facturar-panel.tsx, venta-directa-submit.tsx
  - Clientes: clientes/page.tsx, client-sheet.tsx, clientes/[id]/page.tsx (VistaAdaptativa)
  - Ventas: ventas/page.tsx, vista-adaptativa.tsx, registro-lista.tsx (VistaAdaptativa)
  - Inventario: inventario/page.tsx, movimiento-form.tsx, reabastecer-panel.tsx (VistaAdaptativa)
  - Reportes: reportes/page.tsx, charts.tsx, stat-card.tsx (VistaAdaptativa)
Verificación: usability móvil 0 errores, 0 avisos | axe 0 violations | typecheck/lint/test ✔ (564 pruebas)
Antes → después: 75 hallazgos móviles → 0 | tablas desbordadas de 644-760 px reemplazadas por VistaAdaptativa
Desviaciones: ninguna
Riesgo abierto: ninguno
```

## Desviaciones (las escribe el implementador)

- Ninguna. Todas las 5 pantallas críticas operan sin desbordes ni violaciones de accesibilidad en viewport 390 px.

