# 14 — Plano del salón: gestión visible, móvil completo y zoom

**Fecha:** 2026-10-06 · **Implementa:** SWE-2 MAX · **Estado:** en progreso
**Depende de:** 11 (plano, mobiliario, ubicaciones).
**Dolor:** "No es intuitivo: no se muestra nada al agregar un mueble; ¿cómo borro
un mueble que me equivoqué? ¿cómo quito una planta que me equivoqué?"

## Diagnóstico

Todo estaba detrás del modo "Editar plano" (`hidden md:inline-flex`): en celular
no había forma de agregar ni quitar nada; "Agregar mueble" era un `<select>`
pequeño en una paleta solo visible en desktop; quitar piso estaba a 3 niveles;
un piso vacío se veía como tarjeta en blanco porque la cuadrícula solo se
dibujaba en modo edición.

Decisiones del dueño (2026-10-06): agregar/borrar visible, renombrar/reordenar
pisos, zoom, **todo con arrastre en celular**; papelera fuera de alcance.

## Diseño cerrado

| Tema | Decisión |
|---|---|
| Modo edición | Se elimina: `puedeEditarPlano` (`sucursales.editar`) implica plano editable siempre |
| Arrastre táctil | Habilitado en móvil: long-press 350 ms ya existe en `plano-drag.ts`; `touch-action: pan-x pan-y` base para no romper el scroll (el motor pone `none` al activar el gesto) |
| Agregar | Botones `＋Ubicación` / `＋Mueble` / `＋Piso` siempre visibles → formularios en Sheet; el mueble cae por defecto en el piso activo (aparece en el mapa al guardar) |
| Borrar | `ToggleActivo` "Quitar" en filas de la vista lista y chips "sin colocar", además de los sheets y tecla Supr; todo con Deshacer 5 s |
| Pisos | Botón ⚙ junto a las pestañas → sheet con renombrar/redimensionar (existe), reordenar ← → (nueva acción `reordenarPiso`) y "Quitar piso" (existe) |
| Zoom | Botones −/%/+/Ajustar: solo escala `width`/`height` del `<svg>`; `tamanoCelda()` del drag ya mide el render → el snap sigue exacto |
| Piso vacío | Hint centrado + atajos ＋Ubicación/＋Mueble |
| Solo vista | Aviso muted "la edición es permiso de Sucursales" para quien ve sin `sucursales.editar` |
| Deshacer al mover | Toast con "Deshacer" que revierte `moverElemento` al rect origen (`SoltarPlano.origen`) |

## Pasos

1. `plano-drag.ts`: `SoltarPlano.origen`.
2. `actions.ts`: `reordenarPiso` (swap transaccional de `orden` con vecino).
3. `plano-forms.tsx`: `UbicacionForm` modo alta (nombre/tipo/piso);
   `MobiliarioForm` prop `pisoInicial`.
4. `plano-board.tsx`: toolbar con ＋/⚙/zoom siempre visibles; quitar modo,
   paleta e `isMd`; grid siempre; Deshacer al mover; trash en lista/chips;
   hints de vacío y de solo-vista.
5. Sheet de piso: botones de reordenar.

## Verificación

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm test:usability`
(sin cambios de esquema → `db:check` no aplica).

## Desviaciones

- Implementado según lo cerrado, sin desviaciones de diseño:
  `SoltarPlano.origen` + toast "Deshacer" al mover (`moverElemento` inverso),
  acción `reordenarPiso` (swap transaccional de `orden` con vecino),
  `UbicacionForm` en modo alta con nombre/tipo/piso, `MobiliarioForm` con
  `pisoInicial` (cae en el piso activo al guardar), toolbar siempre visible
  con ＋Ubicación / ＋Mueble / ＋Piso / ⚙ pisos y zoom −/%/＋/Ajustar,
  cuadrícula siempre dibujada, hints de piso vacío y de solo-vista,
  "Quitar" en filas de la vista lista y en chips de "sin colocar".
  Eliminados el modo "Editar plano", la paleta desktop y el gateo
  `useMediaQuery(min-width:48rem)`: el arrastre táctil (long-press 350 ms)
  queda activo en celular.
- El zoom solo escala `width`/`height` del `<svg>`; `tamanoCelda()` mide el
  tamaño renderizado, así el snap del arrastre sigue exacto sin tocar
  `viewBox` ni el motor.
- Verificación: `typecheck` 0 errores · `lint` 0 errores · `test` 502 en
  verde (4 skipped preexistentes) · `test:usability` 0 errores/0 avisos ·
  `test:perf` en verde (el bench no incluye `/admin/plano`; se corrió la
  suite completa sin regresiones).
- Arreglos colaterales de usabilidad ajenos al plano, detectados por la
  suite: targets ≥24px en "Ver en el mapa" (inventario) y checkboxes de
  reabastecimiento; `scrollable-region-focusable` en `charts.tsx`
  (wrappers `overflow-x-auto` ahora `role="region"` + `tabIndex={0}`).
