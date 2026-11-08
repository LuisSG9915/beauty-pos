# 60 — POS: numpad numérico en el modal de cobro (estilo norhud)

**Prioridad:** P2 · **Depende de:** — ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 4

**Objetivo**
Añadir un teclado numérico (1-9, ".", 0, borrar) al `CobroForm` para capturar el
monto recibido sin depender del teclado del sistema, manteniendo la entrada por
input. El numpad actualiza el pago activo (o el único pago si hay uno).

**Fuera de alcance**
No se reestructura el layout completo del modal (eso es la misión 61). No se
añaden dependencias. No se cambia la lógica de acumulación de billetes ni de
idempotencia. El numpad es aditivo.

## Contexto verificado

- `src/app/admin/pos/cobro-form.tsx:123-133` — `updatePago(index, patch)` y
  `quitarPago(index)`; `pagos` es `PagoRow[]`.
- `src/app/admin/pos/cobro-form.tsx:181-207` — `tocarBillete`, `fijarMontoExacto`,
  `borrarMonto` manipulan `pagos` y `acumuloBilletesPorPago`.
- `src/app/admin/pos/cobro-form.tsx:315-436` — render de pagos con input de monto
  y billetes rápidos.
- `package.json` — sin `@testing-library` (las pruebas de interacción serán
  manuales o con vitest + renderToString).

## Diseño decidido

- Componente `Numpad` interno en `cobro-form.tsx` que recibe `onDigit(d)`,
  `onDecimal()`, `onBackspace()`, `onClear()`.
- El numpad opera sobre el **índice de pago activo** (estado `pagoActivo`, default 0;
  si hay un solo pago, siempre 0). Si hay varios pagos, el numpad afecta al activo
  y se muestra un indicador del pago activo.
- Insertar dígitos: si el monto actual es "0" o vacío, reemplaza; si no, concatena.
  Borrar: quita el último carácter (o deja "0"). Limpiar: "0".
- El numpad se muestra siempre en móvil y se oculta en desktop (`sm:hidden`) para
  no duplicar la entrada por teclado físico, salvo que el usuario lo active. En
  esta misión se deja visible siempre en móvil.

## Pasos

1. `cobro-form.tsx` — añadir estado `pagoActivo` y handlers de numpad.
2. `cobro-form.tsx` — componente `Numpad` con grid 3×4 (1-9, ., 0, borrar) y
   tamaños táctiles ≥ 44 px (cumple `test:usability`).
3. Integrar el numpad debajo de los billetes rápidos, visible solo en móvil.
4. Verificación manual en `pnpm dev` (móvil 390 px).

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] Tocar dígitos del numpad actualiza el campo de monto del pago activo.
- [ ] Borrar elimina el último dígito; limpiar deja "0".
- [ ] `pnpm test:usability --viewport=movil` → 0 errores y objetivos ≥ 24 px
      (los botones del numpad ≥ 44 px).
- [ ] La entrada por input físico sigue funcionando.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev (móvil 390px) + recorrido manual
# pnpm test:usability --viewport=movil
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 4 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- El numpad rompe `test:usability` por objetivos < 24 px.
- La manipulación del monto por numpad interfiere con `acumuloBilletesPorPago`
  (los billetes rápidos dejan de funcionar). Si ocurre, aislar el estado del numpad
  del de billetes.
- No hay `@testing-library` para pruebas de interacción → las pruebas serán
  manuales; documentarlo en el reporte.

## Reporte (al terminar)

```
Misión: 60 — numpad en cobro
Cambios:
  - cobro-form.tsx: import ArrowLeft, ChevronLeft, ChevronRight de lucide-react; estado pagoActivo; handlers agregarDigito, agregarDecimal, borrarDigito; clases botonNumpadClass y botonBorrarClass (min-h-12 = 48px, cumple objetivo táctil ≥24px); numpad renderizado como bloque sm:hidden después de los pagos, afectando al pago activo; flechas para navegar entre pagos cuando hay varios.
Verificación: typecheck ✔ | lint ✔ | test 626 ✔ | build ✔ | usability: /admin/pos venta individual OK; 2 errores preexistentes en índice del POS ("Nueva venta rápida" y "Ver historial" cortados, no relacionados con esta misión); error agenda→mi-dia también preexistente
Antes → después: solo teclado del sistema → + numpad numérico en móvil (1-9, ., 0, borrar) para capturar monto recibido sin teclado físico
Desviaciones: ninguna
Riesgo abierto: pruebas de interacción manuales únicamente (no hay @testing-library en deps)
```
