# 32 — Reportes responde «¿cuánto gané?» antes que cualquier filtro

**Prioridad:** P1 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
En `/admin/reportes`, la dueña ve el resultado del período ("Utilidad neta
en mano") en el primer pantallazo del teléfono, con lenguaje llano y sin
tener que entender filtros ni siglas — el dolor que paga según el plan.

**Fuera de alcance\***
Nuevos reportes o métricas, cambios a `obtenerGananciaNetaPeriodo` o a
cualquier fórmula, la exportación CSV, permisos ni la capacidad
`multisucursal`.

---

## Contexto verificado

- `src/app/admin/reportes/page.tsx:369-435` — el formulario de filtros
  (sucursal, fechas, "Aplicar", presets rápidos, "Exportar CSV") se
  renderiza **antes** que la tarjeta de resultado.
- `src/app/admin/reportes/page.tsx:437` en adelante —
  `TarjetaGananciaNeta` solo se renderiza si `gananciaNeta &&
  puedeFinancieros`; en 390 px el formulario + presets empujan la
  respuesta bajo el pliegue.
- `src/app/admin/reportes/page.tsx:111-187` — `TarjetaGananciaNeta`
  muestra 4 cifras: "Total Ingresado" (con desglose "Efectivo · Tarjeta ·
  SPEI" en la línea 140), "Por Pagar a Equipo", "Gastos Operativos" y
  "Utilidad Neta en Mano". El grid es `sm:grid-cols-2 lg:grid-cols-4`:
  en móvil las 4 se apilan y la respuesta principal queda la última.
- `src/modules/reportes/rules.ts:48-81` — `deltaKpi`/`etiquetaDelta`
  generan los hints "vs periodo anterior" de los KPIs.
- `src/lib/glosario.ts` — vocabulario único del producto; "SPEI" no es
  lenguaje del salón (el equivalente llano es "transferencia").
- `pnpm test:usability` cubre `/admin/reportes` en ambos viewports (hoy:
  0 errores, avisos conocidos de acción primaria en otras rutas).

## Diseño decidido

- **La respuesta primero**: mover `TarjetaGananciaNeta` ANTES del `<form>`
  de filtros en el DOM para ambos viewports — la dueña lee el resultado y
  después decide si filtra. Los presets rápidos quedan bajo la tarjeta.
- **La cifra reina primero en móvil**: dentro del grid de la tarjeta,
  "Utilidad Neta en Mano" es la primera celda en móvil (clases `order-*`
  del grid; en `sm:` y arriba puede conservar su lugar o ir primera —
  lo importante es que en 390 px no haya que hacer scroll para verla).
- **Barrido de lenguaje**: en las etiquetas visibles de la página,
  reemplazar jerga/siglas por el término del glosario ("SPEI" →
  "Transferencia", "Comisiones devengadas" → revisión contra
  `glosario.ts`; si el glosario no tiene equivalente, dejar el más llano
  posible y anotarlo en Desviaciones). Solo etiquetas visibles: no tocar
  fórmulas ni nombres de campos.
- Los hints de delta deben leerse sin explicación ("12% más que el
  periodo anterior"); si `etiquetaDelta` ya lo hace, no se toca.

## Pasos

1. `src/app/admin/reportes/page.tsx` — reordenar: tarjeta de ganancia
   neta antes del formulario; `order` para que "Utilidad Neta en Mano"
   encabece en móvil.
2. `src/app/admin/reportes/page.tsx` — barrido de etiquetas visibles
   contra `src/lib/glosario.ts`.
3. Verificación visual del resultado en 390 px y 1366 px.

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] `pnpm test:usability --only=reportes` (ambos viewports, con
      `pnpm dev`) → 0 errores y 0 avisos nuevos.
- [ ] En 390 px, "Utilidad Neta en Mano" es visible sin scroll tras
      abrir la página (verificación manual o con Puppeteer).
- [ ] Ninguna etiqueta visible usa términos fuera de `glosario.ts`.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm dev   # en otra terminal
pnpm test:usability --only=reportes
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h (una sesión) |
| Archivos tocados | ≤ 6 |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- La tarjeta de ganancia neta depende de datos que hoy no carga la
  página en el caso común (p. ej. solo existe en consolidado).
- Reordenar rompe el `data-action-clave` o introduce errores de axe.

## Reporte (al terminar)

```
Misión: 32 — Reportes responde «¿cuánto gané?» antes que cualquier filtro
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: resultado bajo el formulario en móvil → visible al abrir
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Ninguna.
