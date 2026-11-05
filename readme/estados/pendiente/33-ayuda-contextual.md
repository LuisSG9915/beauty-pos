# 33 — Ayuda a un toque desde cualquier pantalla del panel

**Prioridad:** P1 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
En cualquier pantalla de `/admin`, la persona encuentra la ayuda de ESA
pantalla sin abrir menús ni adivinar dónde está: un botón visible junto al
título que la lleva a la guía, la práctica o la ayuda general según la
ruta en la que está.

**Fuera de alcance\***
Redactar contenido nuevo de ayuda, cambiar `/admin/ayuda`, `/admin/guia`
o `/admin/practica`, ni tocar el menú de navegación.

---

## Contexto verificado

- `src/components/admin-nav.tsx:366-368` — "Ayuda" es un ítem más del
  menú lateral; en móvil queda detrás de "Más", a varios toques.
- `src/app/admin/ayuda/page.tsx:51-80` — hub de ayuda con tarjetas
  (guía de configuración, práctica, soporte); ya existe y funciona.
- `src/app/admin/guia/page.tsx` — guía de configuración con pasos
  derivados del negocio real.
- `src/app/admin/practica` — modo práctica con datos de ejemplo.
- `src/components/admin/page-header.tsx:49-97` — `AdminPageHeader`
  recibe `title`, `description`, `actions`, `breadcrumbs`; es el encabezado
  de prácticamente todas las páginas admin → **punto único de
  integración**.
- No existe hoy ningún componente de ayuda contextual: las páginas no
  enlazan a ayuda desde su propio encabezado.

## Diseño decidido

- **Componente cliente** `src/components/admin/ayuda-contextual.tsx`:
  `usePathname()` + `useSearchParams()` → mapa `AYUDA_POR_RUTA` → si la
  ruta tiene destino, renderiza un `Link` con icono `CircleHelp` (o el
  icono que ya use el nav: `LifeBuoy`), `min-h-11 min-w-11`,
  `aria-label="Ayuda de esta pantalla"`, `data-action-id="ayuda.contextual"`
  — **sin** `data-action-clave` (no es la acción primaria).
- **Mapa de destinos** (el href se construye con `buildAdminHref`
  conservando `organizationId`/`sucursalId` de la URL actual):
  - `/admin/pos`, `/admin/caja` → `/admin/practica` (recorrido seguro).
  - `/admin/agenda`, `/admin/clientes`, `/admin/servicios`,
    `/admin/productos`, `/admin/reportes` → `/admin/guia`.
  - Resto de rutas admin → `/admin/ayuda`.
  - Rutas solo de plataforma (`/admin/incidentes`, `/admin/telemetria`)
    → sin botón (la ayuda es del negocio, no de la plataforma).
- **Integración**: `AdminPageHeader` renderiza `<AyudaContextualBoton />`
  junto al slot `actions`, de modo que todas las páginas que usan el
  encabezado lo heredan sin tocarlas. Las páginas que no usan
  `AdminPageHeader` quedan fuera en esta versión (anotar en Desviaciones
  cuáles son).
- El componente es `"use client"` y pequeño; el header del servidor lo
  monta sin costo de datos (la ruta ya la conoce el cliente).

## Pasos

1. `src/components/admin/ayuda-contextual.tsx` — componente + mapa de
   rutas.
2. `src/components/admin/page-header.tsx` — montar el botón en el header.
3. Prueba del mapa (función pura exportada o test del componente):
   `/admin/pos` → practica, `/admin/reportes` → guia, `/admin/ajustes`
   → ayuda, `/admin/incidentes` → sin botón.

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] `pnpm test:usability` (ambos viewports, con `pnpm dev`) → 0 errores
      y 0 avisos nuevos; el botón mide ≥ 44 px.
- [ ] En `/admin/pos` el botón lleva a `/admin/practica`; en
      `/admin/reportes` a `/admin/guia`; en una ruta no mapeada a
      `/admin/ayuda`; en `/admin/incidentes` no aparece.
- [ ] El botón conserva `organizationId`/`sucursalId` en el href.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm dev   # en otra terminal
pnpm test:usability
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h (una sesión) |
| Archivos tocados | ≤ 6 |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- `AdminPageHeader` no se usa en páginas donde el botón estorbe (p. ej.
  flujos de formulario a pantalla completa) y no hay forma limpia de
  excluirlas.
- `buildAdminHref` no es utilizable desde un componente cliente.

## Reporte (al terminar)

```
Misión: 33 — Ayuda a un toque desde cualquier pantalla del panel
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores
Antes → después: ayuda solo en el menú lateral → botón "?" contextual por ruta
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Ninguna.
