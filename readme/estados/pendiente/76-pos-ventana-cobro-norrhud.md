# 76 — La ventana de cobro cabe en la pantalla y sigue el orden norhud

**Prioridad:** P1 · **Depende de:** 75 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 5

**Objetivo**
La ventana de cobro deja de ser una página larguísima con cosas repetidas: un
solo encabezado con el total grande, orden norhud (total → propina → medios →
recibido → cambio → botones), pie fijo con "Volver" y "Cobrar $X" siempre
visibles, y teclado numérico solo donde tiene sentido.

**Fuera de alcance**
No se cambia la lógica de propina, billetes acumulativos, pagos divididos,
idempotencia ni el payload de `cobrarVenta`. No se tocan la agenda ni otras
pantallas. No se agregan dependencias.

## Contexto verificado

- `src/app/admin/pos/venta-ticket.tsx:998-1019` — `<Dialog>` con
  `DialogContent className="p-0 sm:p-6 max-w-md md:max-w-lg"`,
  `DialogTitle` "Cobrar" + `DialogDescription` con el total, y dentro
  `CobroForm enDialog onClose`.
- `src/app/admin/pos/cobro-form.tsx:272-277` — encabezado propio "Cobrar" +
  total `aCubrir` (duplica el del diálogo).
- `src/app/admin/pos/cobro-form.tsx:286-326` — propina (chips
  Sin/10/15/20/Otro + input "custom").
- `src/app/admin/pos/cobro-form.tsx:328-334` — aviso "anticipo cubre el
  total".
- `src/app/admin/pos/cobro-form.tsx:336-561` — pagos: chips de medio, billetes
  (`+ $50…` + "Exacto" + "Borrar" al final de la fila), input monto + botón
  "Resto · $X", referencia, numpad `md:hidden` (`:499-560`, "Numpad · pago N").
- `src/app/admin/pos/cobro-form.tsx:563-595` — bloque cambio/faltante
  (`aria-live` implícito por ser texto; verificar).
- `src/app/admin/pos/cobro-form.tsx:597-622` — pie: "Volver (Esc)" +
  `ActionFeedback` + botón `data-action-clave="1"`
  `data-action-id="pos.cobro.confirmar"` "Cobrar $X" — **sin pie fijo**, el
  botón puede quedar bajo el pliegue en 390×844.
- `src/app/admin/pos/cobro-form.tsx:130-138` — Esc cierra vía `onClose` **sin
  verificar `pending`** (cierra aunque el cobro esté en curso).
- `src/app/admin/pos/cobro-form.tsx:598-607` — "Volver (Esc)" siempre visible,
  también en táctil.
- `src/app/globals.css:71-77` — tokens `--color-pos-*` basados en `--warning`
  (ámbar) que ya no se usan tras el look bugambilia; a retiro si están
  muertos.
- `src/lib/glosario.ts` — fuente de vocabulario ("cobrar", "propina", etc.).

## Diseño decidido

- **Encabezado único**: el `Dialog` conserva título "Cobrar" + total grande;
  `CobroForm` ya no repite su propio "Cobrar"/total (o lo muestra solo como
  desglose `total − anticipo + propina`). Sin tarjeta dentro de la tarjeta del
  diálogo; padding normal en teléfono (nada de `p-0`).
- **Tamaño**: en teléfono, `DialogContent` casi pantalla completa
  (`h-[100dvh]` o `inset` acorde, con safe-area); en md+ centrado y más ancho
  (`max-w-2xl`/`3xl`) con el numpad a la derecha del flujo.
- **Orden norhud** (arriba→abajo):
  1. Total a cobrar (grande).
  2. Propina (chips).
  3. Forma de pago (chips grandes ≥44 px).
  4. "Recibido": input grande + botón "Borrar".
  5. "Exacto" primero, después los billetes.
  6. Cambio o "Lo que falta" en grande (`aria-live="polite"`).
  7. Pie fijo: "Volver" (secundario) + "Cobrar $X" (`data-action-clave="1"`,
     `pos.cobro.confirmar`).
- **Teclado numérico propio**: solo en md+ (`hidden md:grid`); en teléfono se
  usa el teclado del sistema (`inputMode="decimal"` ya está). Renombrar la
  etiqueta a "Teclado" y agregar `data-action-id="pos.cobro.teclado"` para
  medir su uso.
- **Cierre**: Esc y clic fuera **no cierran mientras `pending`**; "(Esc)" en
  el botón Volver solo se muestra con puntero fino (`hidden md:inline` o
  media query de hover). Se quita el listener duplicado si el `Dialog` ya
  maneja Esc (verificar: Radix cierra con Esc por defecto → el handler propio
  puede ser redundante o contraproducente; decidir uno solo y documentarlo).
- **Textos**: "Numpad" → "Teclado"; "Resto" → "Lo que falta";
  "Agregar otro pago" → "Pagar con otra forma"; "Referencia" con etiqueta
  visible (hoy es `aria-label` + placeholder).
- **`globals.css`**: retirar `--color-pos-*` solo si `grep` confirma 0 usos;
  si alguno se usa, se conserva y se anota.

## Pasos

1. `src/app/admin/pos/cobro-form.tsx` — reordenar JSX al flujo norhud, pie
   fijo, "Recibido"/"Borrar", "Exacto" primero, numpad solo md+, textos del
   glosario, Esc/`pending` corregido.
2. `src/app/admin/pos/venta-ticket.tsx` — `DialogContent` tamaño/padding por
   breakpoint; decidir el manejo único de Esc.
3. `src/app/globals.css` — retirar tokens `--color-pos-*` sin uso (verificar
   con grep antes).
4. `src/lib/glosario.ts` — agregar "folio"/términos nuevos solo si el texto
   los necesita.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → suite en verde.
- [ ] En 390×844 con 1 pago en efectivo, "Cobrar $X" se ve **sin desplazarse**
      (verificar con la ventana de cobro abierta del arnés de la 72).
- [ ] Chips de medio y propina ≥ 44 px; axe 0 errores dentro del diálogo.
- [ ] `pnpm test:flows` → verde: propina 10 % = $330, stock 0 bloquea, cobro
      completo llega a "Venta cobrada".
- [ ] `pnpm test:perf` en `/admin/pos` sin regresión > 10 %.
- [ ] `pnpm test:smoke` → verde.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev
pnpm test:usability --only=pos --json
pnpm test:flows && pnpm test:smoke && pnpm test:perf
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h de agente |
| Archivos tocados | ≤ 5 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- Reordenar el JSX rompe la acumulación de billetes, el "Resto" por fila o la
  idempotencia (hay pruebas de flujo; si fallan, revertir el paso y acotar).
- El pie fijo en móvil es inviable sin tapar el contenido (documentar y dejar
  el botón como última sección visible).
- `test:perf` muestra regresión > 10 % en `/admin/pos`.

## Reporte (al terminar)

```
Misión: 76 — ventana de cobro norhud
Cambios: <archivo → qué hace>
Verificación: typecheck ✔ | lint ✔ | test N ✔ | usability 0 errores | flows ✔ | perf ✔
Antes → después: <formulario largo con duplicados → ventana compacta con pie fijo>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta>
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
