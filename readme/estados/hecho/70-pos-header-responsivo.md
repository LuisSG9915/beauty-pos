# 70 — POS: header responsivo (botones no cortados en móvil)

**Prioridad:** P2 · **Depende de:** 66 ·
**Tiempo estimado:** ≤ 1 h · **Archivos previstos:** ≤ 1

**Objetivo**
Los botones "Nueva venta rápida" y "Ver historial" no se cortan por el borde del teléfono en móvil. Se compactan en móvil y se abrevia el texto largo.

**Fuera de alcance**
No se cambia la lógica de las acciones. No se añaden dependencias.

## Contexto verificado

- `src/app/admin/pos/page.tsx:227-270` — `AdminPageHeader` actions: `<div className="flex flex-wrap items-center gap-2">` con 3 botones: "Venta sin conexión" (sm), "Nueva venta rápida" (lg), "Ver historial" (default). Los dos últimos se cortan en móvil.
- `src/app/admin/pos/page.tsx:229` — "Venta sin conexión" usa `size="sm"` (correcto).
- `src/app/admin/pos/page.tsx:243` — "Nueva venta rápida" usa `size="lg"` (demasiado grande para móvil).
- `src/app/admin/pos/page.tsx:260` — "Ver historial" usa size default (medio).

## Diseño decidido

- "Nueva venta rápida": `size="sm"` en móvil, `size="lg"` en sm+; texto abreviado a "Nueva venta" en móvil (palabra "rápida" oculta con `hidden sm:inline`).
- "Ver historial": `size="sm"` en móvil, size default en sm+.
- "Venta sin conexión": mantener `size="sm"`.

## Pasos

1. `page.tsx` — cambiar sizes de los botones para móvil.
2. `page.tsx` — abreviar "Nueva venta rápida" en móvil.
3. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:usability --viewport=movil --only=pos`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → pruebas en verde.
- [ ] `pnpm build` → exitoso.
- [ ] `pnpm test:usability --viewport=movil --only=pos` → 0 errores de layout-movil en `/admin/pos`.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:usability --viewport=movil --only=pos
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 1 h de agente |
| Archivos tocados | ≤ 1 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- `test:usability` reporta errores nuevos de layout-movil en `/admin/pos`.

## Reporte (al terminar)

```
Misión: 70 — header responsivo
Cambios: page.tsx: botones "Nueva venta rápida" y "Ver historial" compactos en móvil, texto abreviado
Verificación: typecheck ✔ | lint ✔ | test N ✔ | build ✔ | usability 0 errores
Antes → después: <botones cortados por el borde → compactos y sin corte>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```
