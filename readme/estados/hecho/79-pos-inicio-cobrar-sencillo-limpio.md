# 79 — Inicio de Cobrar sin acciones repetidas y cobro sencillo sin jerga

**Prioridad:** P2 · **Depende de:** 77b ·
**Tiempo estimado:** ≤ 1.5 h · **Archivos previstos:** ≤ 4

**Objetivo**
La pantalla de entrada a Cobrar deja de repetir la misma acción y la lista
"Ventas de hoy" muestra folio, hora, cliente, estado y total de un vistazo. El
cobro sencillo (ruta sin enlace en el menú) deja de mostrar estados internos y
jerga, con el botón principal en bugambilia.

**Fuera de alcance**
No se cambia la lógica de `crearVentaDirecta` ni del cobro sencillo. No se
agrega enlace al menú para `/admin/pos/sencillo` ni `/admin/pos/inicio` (eso
es decisión de producto aparte). No se agregan dependencias.

## Contexto verificado

- `src/app/admin/pos/page.tsx:228-268` — acciones del header: "Venta sin
  conexión" (`pos.venta.offline` → `/offline/venta`), "Nueva venta rápida"
  (`pos.venta.nueva` → `?nueva=1`), "Ver historial" (`pos.ventas.historial` →
  `/admin/ventas`).
- `src/app/admin/pos/page.tsx:290-297` — formulario "Abrir venta directa"
  (`crearVentaDirecta`) que hace lo mismo que `?nueva=1` (crear venta
  `en_proceso` y abrir el ticket): **acción duplicada** (H17).
- `src/app/admin/pos/page.tsx:62-82` — `?nueva=1` crea la venta al renderizar
  (efecto secundario en GET; se documenta como riesgo, no se cambia aquí).
- `src/app/admin/pos/page.tsx:303-343` — "Ventas de hoy": filas con cliente ·
  hora · estado · total; con la 77b deben mostrar folio.
- `src/app/admin/pos/sencillo/cobro-sencillo.tsx:87-89` — `Venta
  #{venta.id.slice(-4)}` y `{venta.estado}` crudo (`en_proceso`) → jerga
  interna (H18).
- `src/app/admin/pos/sencillo/cobro-sencillo.tsx:96,167,175,234` — total y CTA
  en `text-warning`/`bg-warning` (ámbar) con ícono `text-warning` invisible
  sobre ámbar; debe ser bugambilia (`bg-primary`).
- `src/app/admin/pos/sencillo/page.tsx:50-58` — errores dicen "organización"
  (el glosario exige "negocio").
- `src/lib/glosario.ts` — vocabulario ("venta sin cita", "cliente de paso",
  "negocio").
- `src/app/globals.css:71-77` — tokens `--color-pos-*` (ámbar) posiblemente
  sin uso tras el look bugambilia (retirados en la 76 si estaban muertos).

## Diseño decidido

- **Inicio de Cobrar**: quitar el botón "Nueva venta rápida" del header (la
  tarjeta "Venta sin cita" con "Abrir venta directa" ya hace eso y es el
  objetivo del flujo). "Venta sin conexión" y "Ver historial" quedan como
  acciones secundarias (`variant="outline"`, tamaño `sm`).
- **Ventas de hoy**: cada fila muestra `folio · hora · cliente · estado ·
  total` (folio de la 77b; `en_proceso` sin foleno muestra "En proceso");
  ventas en proceso primero, luego por hora descendente.
- **Cobro sencillo**:
  - Encabezado: "Venta en proceso" (o el folio si ya cobró) en lugar de
    `#<uuid>`; el estado se traduce por glosario (`en_proceso` → "En proceso",
    `completada` → "Cobrada", `cancelada` → "Cancelada").
  - CTA "Cobrar"/`CobroDirectoForm` en `bg-primary text-primary-foreground`
    con ícono del color correcto (no ámbar sobre ámbar).
  - Textos de error de `sencillo/page.tsx`: "organización" → "negocio".
- **Sin enlace nuevo en el menú**: `/admin/pos/sencillo` sigue siendo ruta
  directa (decisión de producto pendiente, fuera de alcance).

## Pasos

1. `src/app/admin/pos/page.tsx` — quitar "Nueva venta rápida"; ajustar acciones
   secundarias; "Ventas de hoy" con folio/orden.
2. `src/app/admin/pos/sencillo/cobro-sencillo.tsx` — encabezado sin UUID,
   estado por glosario, CTA bugambilia.
3. `src/app/admin/pos/sencillo/page.tsx` — "negocio" en errores.
4. `src/lib/glosario.ts` — solo si hace falta un término nuevo.

## Criterios de aceptación

- [ ] `pnpm typecheck` → 0 errores.
- [ ] `pnpm lint` → 0 errores nuevos.
- [ ] `pnpm test` → suite en verde.
- [ ] `pnpm test:usability --only=pos --viewport=movil` → 0 errores y 0 avisos
      nuevos en `/admin/pos`.
- [ ] `pnpm test:flows` → el flujo "Abrir venta" (venta directa) sigue en
      verde.
- [ ] Ningún texto visible dice "organización" ni muestra `#<uuid>` en el cobro
      sencillo.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
# pnpm dev
pnpm test:usability --only=pos --viewport=movil --json
pnpm test:flows
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 1.5 h de agente |
| Archivos tocados | ≤ 4 (sin contar pruebas) |
| Contexto | ≤ 200k tokens |

## Criterios de parada (`BLOQUEO:`)

- Quitar "Nueva venta rápida" rompe un flujo que solo ese botón cubría (hay
  que verificar que "Abrir venta directa" llega al mismo ticket; si no,
  conservarlo y documentar).
- "Ventas de hoy" con folio requiere la 77b aplicada (si 77a/77b no están,
  dejar el folio como "—" y documentar).
- El cambio excede 4 archivos.

## Reporte (al terminar)

```
Misión: 79 — inicio de Cobrar limpio y sencillo sin jerga
Cambios:
- src/app/admin/pos/page.tsx — quitado el botón "Nueva venta rápida" del
  header (duplicaba "Abrir venta directa" de la tarjeta, mismo destino
  ?nueva=1). "Venta sin conexión" y "Ver historial" quedan outline/sm.
  "Ventas de hoy": orden en_proceso primero y luego fecha desc
  (case en ORDER BY); fila reordenada a folio · hora · cliente · estado ·
  total (el badge ya muestra En proceso/Cancelada/Completada).
- src/app/admin/pos/sencillo/cobro-sencillo.tsx — encabezado muestra
  "Folio 0042" o "Venta en proceso" y el estado traducido (En proceso /
  Cancelada / Cobrada, nunca el valor crudo). Total y ambos CTA "Cobrar"
  pasan de ámbar (bg-warning/text-warning) a bugambilia (bg-primary por
  defecto del Button); el ícono Wallet hereda el color del botón.
- src/app/admin/pos/sencillo/page.tsx — errores "esta organización" →
  "este negocio" (glosario).
- src/lib/glosario.ts — sin cambios (los términos usados ya existían).
Verificación: typecheck ✔ | lint ✔ (0 errores, 4 avisos preexistentes) |
  test 653 ✔ | usability --only=pos --viewport=movil: 0 errores, 0 avisos
  (incluye el recorrido táctil Agenda→Mi día ya corregido en 83e4962) |
  flows: pasos de venta directa en verde; suite completa no cerró limpia
  en 4 corridas por fallos ajenos y variables (ver Desviaciones).
Antes → después: dos acciones para abrir venta y "Venta #A1B2 ·
  en_proceso" en ámbar → una sola entrada clara, folio/hora/cliente/estado/
  total de un vistazo y cobro sencillo en bugambilia sin jerga.
Desviaciones:
- `test:flows` se corrió 4 veces; en ninguna falló un paso de esta misión.
  Los fallos fueron todos en secciones ajenas y distintos cada vez:
  espera en "Entrada de inventario" (run 1), timeout asignando cliente +
  tarjeta de paquete no hallada (run 2), `/admin/reportes` con 413 +
  "Failed query" (run 3, 75/77) y "Failed query" en `/admin/inventario`
  (run 4). `/admin/reportes` se verificó aparte con sesión real: renderiza
  las 4 secciones sin errores de consola → errores transitorios del dev
  server contra CockroachDB remoto, no del cambio.
- Verificación en vivo con Puppeteer (scripts/scratch/m79-*.ts):
  `/admin/pos` sin "Nueva venta rápida", con "Abrir venta directa",
  "Venta sin conexión", "Ver historial"; "Ventas de hoy" ordena en_proceso
  primero (sin folio) y luego completadas por hora desc con "Folio NNNN ·
  hora · cliente · estado · total". `/admin/pos/sencillo` con venta real:
  sin "organización", sin `#uuid`, estado "En proceso", CTA con fondo
  rgb(169,29,93) = bugambilia.
- Estado del cobro sencillo: se usó fallback "En proceso" para cualquier
  valor distinto de completada/cancelada (más seguro que asumir cobrada).
Riesgo abierto: ninguno funcional. La inestabilidad de `test:flows` por
  timeouts/consultas fallidas contra la base remota sigue siendo un tema
  del entorno de pruebas (ya documentado en misiones anteriores).
```

## Desviaciones (las escribe el implementador)

<Qué supuesto del plan resultó falso y qué se hizo en su lugar. Si no hubo,
"ninguna".>
