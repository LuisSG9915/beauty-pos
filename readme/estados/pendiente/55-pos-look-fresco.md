# 55 — Look and feel fresco del punto de venta

**Prioridad:** P2 · **Depende de:** 54 · **Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 6

**Objetivo\***
El sistema se ve y se siente fresco: paleta de colores clara y alegre, tipografía legible sin jerga técnica, tarjetas con sombras suaves, botones de acción primaria destacados y todo accesible en teléfono de 390 px (objetivos táctiles ≥ 24 px, 0 errores axe WCAG 2.2 AA).

**Fuera de alcance\***
Nueva funcionalidad de negocio, cambios de esquema, deploy.

## Contexto verificado\*

- `src/lib/glosario.ts` — vocabulario único del salón (usar solo estos términos, sin jerga técnica).
- `src/app/admin/pos/printable-ticket.tsx` — excepción de tipografía (`text-[10px]/[11px]` solo para ticket térmico); el resto no baja de `text-op-xs` (13 px).
- `src/components/admin/vista-adaptativa.tsx` — patrón de listas adaptativas (móvil + escritorio) con cookie `melena_viewport`.
- `globals.css` — tokens `--cita-*` y pares `bg-*-soft text-*` disponibles para la paleta fresca.

## Diseño decidido (si aplica)

- Colores: fondo claro, superficie de tarjetas suave, botón primario en amarillo/ámbar (tono de marca), acentos en verde/teal para confirmaciones.
- Tipografía: mínimo `text-op-xs` (13 px) en el POS; sin UUIDs ni jerga técnica visible.
- Tarjetas con borde suave, sombra baja y redondeo consistente.
- Objetivos táctiles ≥ 24 px en botones e inputs del cobro.
- Diseño adaptativo: móvil primero, tarjetas en móvil y tabla opcional en escritorio mediante `<VistaAdaptativa>`.

## Pasos

1. `globals.css` — agregar tokens de color fresco para el POS (fondo, superficie, primario, acento) si no existen.
2. Componentes del POS (misiones 53 y 54) — aplicar paleta fresca, tipografía mínima y objetivos táctiles ≥ 24 px.
3. Verificación de accesibilidad: `pnpm test:usability --viewport=movil` sobre las rutas del POS.
4. Ajustes de contraste y espaciado según resultado de la verificación.

## Criterios de aceptación\*

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores, 0 avisos nuevos.
- [ ] `pnpm test:usability --viewport=movil` → 0 errores, 0 avisos nuevos en rutas del POS.
- [ ] Recorrido manual: el POS se ve claro, fresco y usable en móvil de 390 px.

## Verificación

```bash
pnpm typecheck && pnpm lint
# pnpm test:usability --viewport=movil  (requiere pnpm dev)
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente (una sesión) |
| Archivos tocados | ≤ 6 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- Misión 54 no verificada (el cobro sencillo debe existir antes de pulir su look).
- `pnpm test:usability` no puede correr por el entorno (falta `pnpm dev` o cuenta E2E): reportar como limitación, no omitir.

## Reporte (al terminar)

```
Misión: 55 — Look and feel fresco del punto de venta
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

<ninguna por definir aún>
