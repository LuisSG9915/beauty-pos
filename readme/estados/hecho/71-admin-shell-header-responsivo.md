# 71 — Admin shell: header móvil responsivo

**Prioridad:** P2 · **Depende de:** 70 ·
**Tiempo estimado:** ≤ 1.5 h · **Archivos previstos:** ≤ 1

**Objetivo**
El header móvil del admin shell (logo + sucursal activa + selector de negocio) se adapta a pantallas estrechas sin cortar el selector de negocio. El contenido principal tiene padding adecuado en móvil.

**Fuera de alcance**
No se cambia la sidebar de escritorio ni el ShellTabBar. No se añaden dependencias.

## Contexto verificado

- `src/components/admin/admin-shell.tsx:526-549` — header móvil: `flex items-center gap-2 px-4 py-2` con BrandWordmark, badge de sucursal activa, y OrganizationSelector (ml-auto). En pantallas estrechas el selector se corta.
- `src/components/admin/admin-shell.tsx:116, 151` — OrganizationSelector compact: `max-w-44` (176px) en móvil, `sm:max-w-56` (224px). El label "Tu negocio" está `hidden sm:inline`.
- `src/components/admin/admin-shell.tsx:556` — main: `px-2.5 pb-24 pt-2 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8`. Padding móvil de 10px es ajustado.

## Diseño decidido

- Header móvil: reducir gap a `gap-1.5`, padding `px-3 py-2`. El badge de sucursal activa se muestra solo en `sm:` (pantallas ≥640px).
- OrganizationSelector compact: `max-w-36` (144px) en móvil, `sm:max-w-52` (208px) en sm+.
- Main: `px-3 pb-24 pt-2 sm:px-6 sm:pt-6 lg:px-8 lg:pb-8` (aumentar padding móvil de 10px a 12px).

## Pasos

1. `admin-shell.tsx` — header móvil: `gap-1.5 px-3 py-2`, badge sucursal `hidden sm:inline-flex`.
2. `admin-shell.tsx` — OrganizationSelector compact: `max-w-36` en móvil, `sm:max-w-52`.
3. `admin-shell.tsx` — main: `px-3` en lugar de `px-2.5`.
4. Verificación: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → pruebas en verde.
- [ ] `pnpm build` → exitoso.
- [ ] En móvil (390px) el selector de negocio no se corta y el contenido tiene padding adecuado.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 1.5 h de agente |
| Archivos tocados | ≤ 1 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- `test:usability` reporta errores nuevos de layout-movil.

## Reporte (al terminar)

```
Misión: 71 — admin shell header responsivo
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | build ✔
Antes → después: <header cortado en móvil → header compacto y sin corte>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```
