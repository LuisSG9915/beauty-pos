# 28 — Glosario llano, errores con responsable claro y botones acumulativos de billetes

**Prioridad:** P1 · **Depende de:** — ·
**Tiempo estimado:** 35 min · **Archivos previstos:** 4

**Objetivo\***
Reemplazar tecnicismos visibles (`"Arqueo Ciego de Seguridad"`, `"terminal
POS"`, `"vouchers de tus terminales"`) por lenguaje llano desde
`src/lib/glosario.ts`, mostrar en los errores quién puede resolverlos en el
salón, y reemplazar los atajos de efectivo en `CobroForm` por botones
acumulativos de billetes mexicanos (`+$50`, `+$100`, `+$200`, `+$500`,
`+$1,000`, `Exacto` y `Borrar`) que cubren cualquier total sin usar el teclado
numérico.

**Fuera de alcance\***
- No cambiar las fórmulas de arqueo en `src/modules/caja/esperado.ts` ni las
  acciones de `src/app/admin/caja/actions.ts`.
- No modificar el pipeline de incidentes en
  `src/lib/observability/error-core.ts`.

## Contrato de contexto

- **Archivos permitidos para lectura (máximo 4):**
  1. `src/lib/glosario.ts`
  2. `src/app/admin/pos/cobro-form.tsx`
  3. `src/app/admin/caja/cierre-caja-form.tsx`
  4. `src/app/admin/error.tsx`
- **Archivos que NO debes abrir:** `src/db/*`, `src/modules/caja/*`, `drizzle/*`.

## Contexto verificado\*

- `src/lib/glosario.ts:40-54` — Define `GLOSARIO` con 13 términos base, sin
  textos operativos para conteo de caja ni helpers de mensajes de error
  orientados a roles del salón.
- `src/app/admin/pos/cobro-form.tsx:63-65, 170-183, 317-350` — Inicializa el
  primer pago con el monto exacto (`aCubrir.toFixed(2)`), calcula hasta 4
  múltiplos en `quickCashOptions` (que al tocarse sobrescriben el monto en vez
  de sumar billetes, por lo que no sirven para combinar billetes en totales >
  `$1,000`) y usa `<input type="number" step="0.01">`.
- `src/app/admin/caja/cierre-caja-form.tsx:104-108, 240-244, 282` — Muestra
  textos técnicos como `"Arqueo Ciego de Seguridad"`, `"vouchers de tus
  terminales bancarias / pasarela"` y `"Cerrando y auditando arqueo…"`.
- `src/app/admin/error.tsx:31-57` — Muestra un mensaje genérico (`"Ocurrió un
  problema al cargar el contenido..."`) con botones `min-h-10` (40 px, debajo
  del umbral táctil de 44 px) sin indicar a quién acudir en el salón.

## Diseño decidido

1. **Glosario y helper de errores en `src/lib/glosario.ts`:**
   - Agregar en `GLOSARIO`:
     - `aquiCobras`: `"Aquí cobras los servicios y productos del salón."`
     - `conteoCajaTitulo`: `"Cuenta el dinero de la caja"`
     - `conteoCajaDescripcion`: `"Escribe cuánto dinero en efectivo hay en el cajón y cuánto sumaron los cobros con tarjeta o transferencia. Al confirmar, verás si la cuenta cuadra."`
     - `otrosMediosCajaTitulo`: `"Cobros con tarjeta y transferencia"`
     - `otrosMediosCajaDescripcion`: `"Suma los comprobantes cobrados con tarjeta o transferencia durante el turno."`
   - Exportar el mapa determinista `MENSAJES_ERROR_ACCESO: Record<string, string>`:
     - `"permiso-denegado"`: `"No tienes permiso para entrar a esta sección. Pídele a la dueña o encargada del salón que te dé acceso desde Roles."`
     - `"organization-access-denied"`: `"Tu cuenta no tiene acceso a este salón. Pídele a la dueña o encargada que revise tu invitación en Equipo."`
   - Exportar `explicarErrorOperativo(mensaje?: string | null): string`
     (declarado explícitamente en comentario JSDoc como **heurística de
     presentación/copy para la UI**, nunca para lógica de negocio):
     - Si el texto incluye `"permiso"` o `"autoriz"` → devuelve
       `MENSAJES_ERROR_ACCESO["permiso-denegado"]`.
     - Si incluye `"caja"` y (`"abiert"` o `"cerrad"` o `"turno"`) →
       `"La caja está cerrada. Pídele a recepción o a la encargada que toque «Abrir caja» para poder cobrar."`.
     - Si incluye `"stock"` o `"existencia"` → `"No hay suficientes piezas registradas en el inventario. Pídele a la encargada o a almacén que registre la entrada del producto."`.
     - Por defecto → `"No se pudo completar la acción. Intenta de nuevo; si vuelve a pasar, avísale a la encargada del salón o escribe a soporte."`.
2. **Botonera acumulativa de billetes en `src/app/admin/pos/cobro-form.tsx`:**
   - Definir constante `BILLETES_MXN = [50, 100, 200, 500, 1000] as const;`.
   - Mantener un ref `acumuloBilletesPorPago = useRef<Record<number, boolean>>({})`
     que rastrea si la fila `index` ya empezó a acumular billetes por toque
     (cuando el formulario arranca o cuando se toca `Exacto`,
     `acumuloBilletesPorPago.current[index] = false` y el input tiene
     `aCubrir.toFixed(2)` para que cobrar exacto siga siendo de 1 toque).
   - Al tocar un billete `denom` en la fila `index`:
     - Si `!acumuloBilletesPorPago.current[index]`, el nuevo monto es `denom`
       y se marca `acumuloBilletesPorPago.current[index] = true`.
     - Si ya estaba acumulando (`acumuloBilletesPorPago.current[index] === true`),
       el nuevo monto es `redondear((Number(pago.monto) || 0) + denom)`.
   - Mostrar junto a los billetes (`+$50`, `+$100`, `+$200`, `+$500`, `+$1,000`)
     el botón **`Exacto (${formatCurrency(aCubrir)})`** (fija
     `aCubrir.toFixed(2)` y reinicia el flag de acumulación) y el botón
     **`Borrar`** (fija `"0"` y marca acumulación activa para empezar desde
     cero). Todos los botones llevan `min-h-11`.
   - Si el usuario edita manualmente el `<input>` de monto, marcar
     `acumuloBilletesPorPago.current[index] = true`.

## Pasos

1. **`src/lib/glosario.ts`** — Agregar las entradas llanas a `GLOSARIO`,
   exportar `MENSAJES_ERROR_ACCESO` y exportar `explicarErrorOperativo` con su
   comentario de alcance (heurística de copy).
   - Verificación inmediata: `pnpm typecheck`
2. **`src/app/admin/pos/cobro-form.tsx`** — Reemplazar `quickCashOptions` por
   la botonera acumulativa `BILLETES_MXN` (`+$50` a `+$1,000`) + `Exacto` +
   `Borrar`, conservando el prellenado inicial de `aCubrir` para no romper el
   cobro en 1 toque de `flows-e2e.ts`.
   - Verificación inmediata: `pnpm typecheck`
3. **`src/app/admin/caja/cierre-caja-form.tsx`** — Sustituir los textos
   técnicos de las líneas `104-108`, `122` (`min-h-10` → `min-h-11`),
   `240-244` y `282` (`"Confirmando cierre…"`) por las cadenas de `GLOSARIO`.
   - Verificación inmediata: `pnpm typecheck`
4. **`src/app/admin/error.tsx`** — Mostrar
   `explicarErrorOperativo(error?.message)` en el cuerpo de la alerta y subir
   los botones `Reintentar` e `Ir al panel` de `min-h-10` a `min-h-11` (44 px).
   - Verificación inmediata: `pnpm typecheck && pnpm lint && pnpm test`

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] En `/admin/pos`, con un total de `$1,300`, tocar `+$1,000` y luego
      `+$500` actualiza el monto recibido a `1500.00` y muestra `Cambio a
      entregar: $200.00`; tocar `Exacto` restablece `1300.00`; sin tocar
      billetes, el monto sigue prellenado en el total exacto.
- [ ] En `/admin/caja`, desaparecen los términos `"Arqueo Ciego"`,
      `"vouchers"` y `"pasarela"`.
- [ ] `pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/pos,/admin/caja` → 0 errores.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/pos
pnpm tsx scripts/usability-check.ts --viewport=movil --only=/admin/caja
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 35 min (una sesión) |
| Archivos tocados | 4 archivos de producción |
| Contexto | ≤ 150k tokens |
| Lecturas antes de editar | ≤ 4 archivos |

## Criterios de parada (`BLOQUEO:`)

- Si cambiar el comportamiento de los botones de billetes altera el valor
  inicial `aCubrir.toFixed(2)` del primer pago (lo cual rompería
  `flows-e2e.ts`), detenerse: el valor inicial antes de tocar cualquier
  billete debe seguir siendo `aCubrir.toFixed(2)`.

## Reporte (al terminar)

```
Misión: 28 — Glosario llano, errores con responsable claro y botones acumulativos de billetes
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability /admin/pos y /admin/caja 0 errores
Antes → después: 4 chips fijos que fallan en totales > $1,000 y jerga de arqueo/vouchers → billetes acumulativos (+$50..+$1,000, Exacto, Borrar) y textos de GLOSARIO
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

## Desviaciones (las escribe el implementador)

Ninguna.
