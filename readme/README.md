# Melena — Plan maestro

> **En 30 segundos.** Melena es el sistema de operación para salones de belleza
> en México: agenda, cobro, caja, inventario, compras y expedientes en una sola
> app que corre en el teléfono. Este documento es la fuente única de verdad:
> qué está hecho, qué falta, en qué orden y cómo se verifica. Está escrito para
> que lo ejecute un agente (Gemini 4 Argon en Antigravity) sin perder contexto,
> y para que cualquier persona del equipo lo entienda sin saber programar.

**Versión:** 2 · **Fecha:** 2026-10-23 · **Repo:** `LuisSG9915/beauty-pos` ·
**Producto:** https://melena.app · **Worker:** `beauty-pos`

## Cómo leer este documento

| Si eres… | Lee | Tiempo |
|---|---|---|
| Dueño / producto | §1, §2, §5, §8 | 10 min |
| Agente (Argon) que va a ejecutar | Todo, empezando por §6 y §7 | 20 min |
| Desarrollador nuevo | §3, §4, §6, y el plan de la misión asignada | 30 min |

Regla de oro: **este archivo manda**. Si el código contradice al plan, manda el
código: se anota la desviación al final de la misión y se corrige este archivo.

---

## 1. Qué es Melena y qué promete

Un solo lugar para que una estética pequeña (1–3 sillones) opere el día completo
sin papeles ni hojas de cálculo: la clienta agenda o llega, se atiende, se cobra,
se cierra la caja y queda el expediente para que vuelva.

**Usuarios reales:** personas con primaria o secundaria, en el teléfono, de pie,
con prisa y sin tiempo para aprender software. Todo se diseña para ellas.

**Promesa de producto:** *abrir, cobrar y cerrar el día sin pensar.*

### Definición operativa de "sencillo" (esto se mide, no se opina)

| # | Criterio | Umbral | Cómo se verifica |
|---|---|---|---|
| S1 | Una acción primaria por pantalla | Exactamente 1 `data-action-clave` | `pnpm test:usability` |
| S2 | Cobrar desde la agenda | ≤ 3 toques | Recorrido manual + telemetría |
| S3 | Cero jerga técnica visible | 0 términos fuera de `src/lib/glosario.ts`, 0 UUIDs | Revisión + `test:usability` |
| S4 | Accesible y táctil | axe WCAG 2.2 AA en 0 errores; objetivos ≥ 24 px | `pnpm test:usability` |
| S5 | Nada se corta en un teléfono de 390 px | 0 hallazgos `layout-movil` | `pnpm test:usability --viewport=movil` |
| S6 | Primera venta sin ayuda | ≤ 10 min desde el registro, 5 de 5 personas | Prueba con usuarios reales |

Si un cambio mejora una métrica y empeora otra, gana la que sienta la persona
detrás del mostrador.

---

## 2. Reglas del juego (invariantes, no se negocian)

1. **Vocabulario del salón.** Solo términos de `src/lib/glosario.ts`
   ("cliente de paso", "cambiar fecha", "ya llegó"). Nunca "walk-in",
   "reagendar", "timezone", "slug", ni identificadores internos.
2. **Rendimiento es una función.** Cada ida y vuelta a la base cuesta 50–150 ms.
   Objetivo: **≤ 2 consultas por página** (contexto + datos), fusionadas con
   subselects `jsonb`. No se paraleliza lo que se puede fusionar.
3. **Nada que capture una conexión vive en un global.** Los sockets de `pg` no
   sobreviven entre invocaciones del Worker; usar `getRequestScope()`.
4. **Los datos no se borran.** Operaciones financieras e inventario son
   movimientos auditables; cancelar no es eliminar.
5. **El servidor manda.** Permisos con `checkPermission`/`requirePermission` +
   `assertBranchScope`; nunca se confía en el cliente.
6. **No se declara "listo" sin verificar** (§7). Si una verificación no puede
   correr en el entorno, se dice explícitamente; no se asume.
7. **Un cambio, un propósito.** Sin refactors de paso, sin dependencias nuevas
   sin aprobación, sin tocar diseños marcados como cerrados.

---

## 3. Estado real (verificado el 2026-10-23)

### Núcleo del producto — hecho

| Área | Qué hay | Evidencia |
|---|---|---|
| Acceso | Better Auth, roles, permisos, alcance por sucursal, recuperar contraseña | `src/lib/auth/*`, `/recuperar`, `/restablecer` |
| Agenda | Staff, servicios, horarios, bloqueos, recursos, arrastre, "mi día", avisos | fases 01, 05, 06 |
| Cobro (POS) | Pagos, anticipos, paquetes, membresías, promociones, devoluciones, ticket, offline | `src/modules/pos`, `src/modules/offline` |
| Caja | Apertura, corte ciego, diferencias, arqueos | `src/modules/caja` |
| Catálogo | Servicios, productos, paquetes, membresías, promociones, medios de pago, impuestos | `/admin/*`, fase 02 |
| Inventario | Stock, movimientos, dashboard, reabastecimiento, compras con ticket e IA | fases 09, 10, 12 |
| Salón | Plano por pisos, mobiliario, vitrinas, modo estación, temporizadores | fases 11, 14, 16 |
| Ritual | Ficha técnica, recetario químico, pasaporte de belleza, retención predictiva | fases 15, 17 |
| Dinero | Gastos, comisiones, facturación, reportes y exportaciones | `src/modules/{gastos,comisiones,facturacion,reportes}` |
| Operación | Telemetría de producto, pipeline de incidentes P0–P3, Sentry opcional, cron de recordatorios | `src/lib/telemetry`, `src/modules/incidentes`, `custom-worker.ts` |
| Calidad | ~585 pruebas en 62 archivos, typecheck y lint en verde, arneses de usabilidad/perf/carga | `pnpm test`, `.artifacts/` |
| Comercial | Planes Esencial / Crecimiento / Profesional, trial, campaña fundador, capacidad por plan | `src/modules/billing/capacidades.ts` |

### Bloqueos de lanzamiento resueltos y verificados (2026-10-24)

| # | Bloqueo | Estado | Misión |
|---|---|---|---|
| 1 | `melena.app` detrás de Cloudflare Access | **Resuelto** — Rutas públicas responden 200, `/admin` redirige a login; smoke test en verde | `hecho/18` |
| 2 | Hallazgos de **móvil** en POS, clientes, ventas, inventario y reportes | **Resuelto** — 0 errores/avisos en `usability-check` (390 px) y 0 violaciones axe | `hecho/19` |
| 3 | Presupuesto de latencia medido y aplicado por página | **Resuelto** — TTFB p50 255–281 ms / p95 260–427 ms; ≤ 2 consultas/página | `hecho/20` |

Producto desbloqueado para operación pública en https://melena.app.

---

## 4. Arquitectura y presupuesto de rendimiento

- **Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Drizzle ORM +
  CockroachDB + Better Auth + Tailwind 4, desplegado como **un Worker** con
  OpenNext.
- **Ubicación:** Worker en `aws:us-east-2`, junto a la base (cada ida al origen
  cuesta 80–100 ms si no están juntos). Sesión en cookie firmada (5 min): leerla
  no toca la base.
- **Datos calientes:** fusionar. **Datos fríos:** `CACHE_KV` con invalidación
  explícita (`src/lib/kv-cache.ts`).
- **Contexto admin:** `resolveSessionContext` trae usuario + organizaciones +
  permisos + acceso en **una** consulta.
- **UI:** un solo layout por viewport (cookie `melena_viewport`), tipografía
  mínima 13 px, tokens semánticos, sin duplicar tarjetas y tablas.

### Presupuesto (se mide con `pnpm test:perf` y `DB_LOG_QUERIES=1`)

| Métrica | Presupuesto | Dónde |
|---|---|---|
| Consultas por página admin | ≤ 2 | `DB_LOG_QUERIES=1` |
| TTFB p75 (admin) | ≤ 600 ms | `pnpm test:perf` |
| LCP p75 | ≤ 1 500 ms | `pnpm test:perf` |
| CLS | ≤ 0,1 | `pnpm test:perf` |
| JS de entrada por ruta | ≤ 250 KB gzip | build |

Medir antes y después, con el mismo comando y el mismo viewport. Un cambio sin
número antes/después no cuenta como mejora.

---

## 5. Comercial: precios, regla de sucursales y mercado

### Catálogo vigente (MXN, IVA incluido)

| Plan | Mensual | Anual | Sucursales | Usuarios | Prueba | Para quién |
|---|---|---|---|---|---|---|
| **Esencial** | $149 (lista $199) | $1 490 | 1 | 3 | — | Estética de una persona o dos |
| **Crecimiento** | $299 (lista $399) | $2 990 | 2 | 8 | 14 días | Salón que ya agenda y quiere automatizar |
| **Profesional** | $699 (lista $899) | $6 990 | 3 incluidas, +$199 c/u | 20 | — | **Desde la tercera sucursal**, supervisión centralizada |

Regla de negocio implementada: **a partir de 3 sucursales se cobra
Profesional** (el plan incluye 3; cada adicional cuesta $199/mes). La activación
de una sucursal valida la capacidad `multisucursal` del plan vigente.

### Posicionamiento

El mercado mexicano está lleno de estéticas pequeñas (1–2 sillones) y pocas
cadenas. Por eso el plan de entrada debe ser barato y completo —no una versión
"castrada"— y el crecimiento se cobra por sucursal y por automatización, no por
funciones básicas. La campaña fundador (primeros 100 negocios con precio
tachado) existe para bajar la barrera de entrada sin destruir el precio de lista.

### Hipótesis de mercado a validar (no son hechos)

1. La dueña decide por **WhatsApp y boca a boca**, no por anuncios: un demo de
   10 minutos en su propio teléfono convierte más que cualquier landing.
2. El dolor que paga es **"no sé cuánto gané"** y **"se me olvidan las citas"**,
   no la facturación electrónica.
3. Los distribuidores de producto de belleza son el mejor canal: ya visitan el
   salón cada semana y ya venden confianza.
4. Un plan anual con 2 meses gratis sube la retención más que un descuento
   mensual.
5. El soporte debe ser humano y por WhatsApp en horario del salón; un chatbot
   empeora la percepción en este segmento.

Próximos experimentos (una semana cada uno): demo guiado de 10 min con 10
salones; prueba de 14 días con acompañamiento; referidos ($200 de crédito a
quien trae un salón); publicar el antes/después del pasaporte de belleza como
prueba social.

---

## 6. Cómo se ejecuta con Argon (el proceso)

La investigación completa está en `readme/analisis/argon-entrega.md`. Lo
esencial:

### La unidad de trabajo es una misión, no un proyecto

Una misión = **un archivo** de `readme/estados/pendiente/`. Se ejecuta en **una
sesión** de Argon, con un objetivo, un alcance y una verificación. Si no cabe en
una sesión, se parte en dos misiones.

| Límite | Valor | Por qué |
|---|---|---|
| Duración | ≤ 2 h de agente | La cuota se renueva cada 5 h y el contexto se degrada |
| Archivos tocados | ≤ 8 (sin contar pruebas) | Cambios revisables de una sentada |
| Contexto | ≤ 50 % de la ventana | Argon comparte entrada y salida en el mismo 1M |
| Lecturas antes de editar | ≤ 5 archivos | Leer el repo completo quema contexto y no mejora el resultado |

### Ciclo obligatorio

1. **Leer** la misión completa y `AGENTS.md`. Nada más.
2. **Confirmar** los supuestos de la sección "Contexto verificado": si un
   archivo o una línea no coinciden, detenerse y anotar `BLOQUEO:`.
3. **Plan** (`/plan`): el agente propone el artifact de implementación; se
   aprueba antes de escribir código.
4. **Ejecutar** en pasos pequeños, con la acción primaria y la telemetría
   (`data-action-id` / `data-action-clave="1"`) desde el primer commit.
5. **Verificar** (§7). Pegar los comandos y su salida real en el reporte.
6. **Reportar** con el formato de abajo y **actualizar el estado**: mover la
   misión a `hecho/` o dejarla en `en-progreso/` con `BLOQUEO:`.
7. **Cerrar la sesión** con `/clear`. La siguiente misión arranca limpia.

### Formato de reporte (obligatorio, 10 líneas)

```
Misión: 18 — <nombre>
Cambios: <archivos + qué hace cada uno>
Verificación: typecheck ✔ | lint ✔ | test 562 ✔ | db:check ✔ | usability 0 errores
Antes → después: <métrica y números>
Desviaciones: <ninguna | lista>
Riesgo abierto: <ninguno | qué falta y quién lo cierra>
```

### Criterios de parada (BLOQUEO)

Detenerse y anotar `BLOQUEO:` al final de la misión cuando:

- El código real contradice el "Contexto verificado" y no hay decisión escrita.
- Se necesita una dependencia nueva, una migración destructiva o un secreto.
- Se requiere una acción manual del dueño (Cloudflare, R2, Access, DNS).
- Una verificación falla por el entorno y no por el cambio.
- El cambio excede el alcance (más de 8 archivos o toca otro módulo).

No se "arregla" un bloqueo inventando: se documenta y se resuelve con el dueño.

### Prohibido sin aprobación explícita

- Agregar dependencias o cambiar versiones.
- Migraciones que borren columnas o tablas.
- Tocar prompts, esquemas JSON o fórmulas marcadas como cerradas.
- Desplegar (`pnpm run deploy`) desde una misión.
- Refactors cosméticos fuera del alcance.

---

## 7. Verificación (puertas de calidad)

| Comando | Cuándo | Umbral |
|---|---|---|
| `pnpm typecheck` | Siempre | 0 errores |
| `pnpm lint` | Siempre | 0 errores, 0 avisos nuevos |
| `pnpm test` | Siempre | ~585 pruebas en verde (4 omitidas conocidas) |
| `pnpm db:check` | Si toca `src/db/schema/**` | 100 % sincronizado |
| `pnpm test:usability` | Si toca UI (con `pnpm dev`) | 0 errores, 0 avisos nuevos |
| `pnpm test:perf` | Si toca datos o navegación | Dentro del presupuesto de §4 |
| `pnpm test:smoke` | Si toca agenda, cobro, caja o auth | Flujo completo en verde |
| `pnpm tsx scripts/load-sim.ts` | Antes de un despliegue grande | Sin errores; p95 estable |

El detalle de cada arnés está en `AGENTS.md`. Si un comando no puede correr
(falta `.env`, falta Chrome, falta base), se reporta como limitación —no se
omite en silencio.

---

## 8. Backlog priorizado

### P0 — Bloqueos de lanzamiento (Terminados)

| # | Resultado esperado | Criterio de aceptación | Misión | Estado |
|---|---|---|---|---|
| 18 | El dominio público abre; el panel sigue protegido | `curl` 200 en `/`, `/precios`, `/registro`, `/reservar/*`; `/admin` redirige a login | `hecho/18` | Completado en prod |
| 19 | Cero hallazgos de móvil en las 5 pantallas de dinero | `pnpm test:usability --viewport=movil` en 0 errores | `hecho/19` | Completado (0 errores) |
| 20 | Presupuesto de latencia medido y cumplido | TTFB p75 ≤ 600 ms y ≤ 2 consultas/página en las rutas admin | `hecho/20` | Completado (p50 ≤ 281 ms) |

### P1 — activación y retención (lo que hace que se queden)

Enfoque: medir y mejorar la activación (≤ 10 min al primer cobro) y la
retención (menos ausencias, soporte que escala). Las misiones 32, 33 y 34
ya están hechas; 31 implementada pendiente de verificación manual.

| # | Resultado | Misión | Estado |
|---|---|---|---|
| 31 | Tiempo a la primera venta medido (mediana, p90, % en 10 min) | `hecho/31` | Implementada, verificación manual pendiente |
| 32 | Reportes responden "¿cuánto gané?" en el primer pantallazo | `hecho/32` | Hecha |
| 33 | Ayuda a un toque en las 39 páginas del panel | `hecho/33` | Hecha |
| 34 | La clienta confirma su cita desde el enlace del correo | `hecho/34` | Implementada, envío real pendiente |
| 35 | Ausencias medidas y visibles (efecto de los recordatorios) | `hecho/35` | Hecha (604 pruebas) |
| 36 | Onboarding con datos de ejemplo hasta el primer cobro | `hecho/36` | Hecha (607 pruebas) |

### P2 — crecimiento y diferenciación

Enfoque: convertir los diferenciadores ya existentes (pasaporte, recetario,
plano, offline, IA) en crecimiento y adquisición. Mantener las bases
técnicas (multisucursal, CFDI, tiempo real) para cuando haya demanda.

| Resultado | Misión | Cuándo |
|---|---|---|
| Landing y precios convierten (CTA visible, demo, prueba social) | `hecho/37` | Hecha (607 pruebas) |
| Pasaporte de belleza compartible como prueba social | (por definir) | Cuando haya 5 casos reales |
| Recordatorios por WhatsApp (no solo email) | (por definir) | Cuando el email no baje ausencias |
| Referidos medibles ($200 de crédito) | (por definir) | Tras 10 salones activos |
| Reservas públicas con marca del salón y SEO | (por definir) | Tras 10 salones activos |
| Impresión térmica por Bluetooth en PWA | (por definir) | Si se exige ticket físico |
| Multisucursal con reportes consolidados | (por definir) | Clientes con 3+ sucursales |
| Facturación electrónica completa (CFDI) | (por definir) | Cliente grande lo exija |
| App nativa (solo si impresora Bluetooth/NFC) | (por definir) | Después de 100 salones activos |
| Tiempo real multi-recepción (Durable Objects) | (por definir) | Quejas de citas duplicadas |

### POS — cobro y ticket (auditoría 2026-11, misiones 72–79)

Auditoría del flujo de cobro completo (`readme/analisis/norrhud-pos.md`,
`responsivo-pos.md` y el plan de trabajo aprobado): botón "Cobrar" con
contraste ~1:1, "Nueva venta" → 404, imagen del ticket que nunca se genera,
columnas invertidas en escritorio, `/cobrado` y `/sencillo` sin guarda de
permiso, folio con fragmentos de UUID. Dirección: bugambilia + orden norhud;
WhatsApp con imagen y texto generados en el aparato (sin servidor).

| # | Resultado | Misión | Estado |
|---|---|---|---|
| 72 | El arnés recorre ticket, ventana de cobro y confirmación | `hecho/72` | Hecha — flows 72/72, línea base en `.artifacts/` |
| 73 | "Cobrar" visible y fijo en móvil; columnas correctas | `hecho/73` | Hecha — contraste y pliegue resueltos en línea base |
| 75 | Pantalla "Venta cobrada" con cambio real y acciones que funcionan | `hecho/75` | Hecha — flows 74/74, impresión solo comprobante, guardas en /cobrado y /sencillo |
| 74 | Imagen del ticket real + compartir por aparato + WhatsApp | `hecho/74` | Hecha — PNG 2x real, share/portapapeles/descarga por aparato, wa.me normalizado |
| 76 | Ventana de cobro en orden norhud con pie fijo | `hecho/76` | Hecha — flows 77/77, teclado solo en md+, Esc vetado durante cobro |
| 77a | Folio consecutivo por sucursal (esquema + migración) | `hecho/77a` | Hecha — migración aplicada con autorización, backfill 369 ventas, flows 77/77 |
| 77b | Folio visible en ticket, comprobante, confirmación y listados | `pendiente/77b` | Pendiente |
| 78 | Cobrar desde la agenda termina con la misma confirmación | `pendiente/78` | Pendiente |
| 79 | Inicio de Cobrar sin acciones repetidas; sencillo sin jerga | `pendiente/79` | Pendiente |

Orden de ejecución: 72 → 73 → 75 → 74 → 76 → 77a → 77b → 78 → 79. Las
misiones 58 (imagen), 59 (acciones al cobrar) y 61 (layout norhud) se
retiraron: las reemplazan la 74, la decisión de la 64 y la 76
respectivamente. La 62 quedó en `hecho/` con desviaciones documentadas.
Opcionales con aprobación: 80 (imagen en servidor con Browser Run + R2, solo
si falla en iPhone) y 81 (enlace público del ticket / API de WhatsApp).

---

## 9. Índice real de documentos

```
readme/
  README.md                  ← este plan maestro
  PLANTILLA-PLAN.md          ← cómo se escribe una misión (contrato para Argon)
  analisis/
    argon-entrega.md         ← investigación y contrato de entrega a Argon
    cloudflare-servicios.md  ← qué servicios de Cloudflare y para qué
    d1-vs-cockroach.md       ← por qué no migrar la base
    expo-vs-pwa.md           ← por qué no hay app nativa todavía
  estados/
    pendiente/               ← 72–79 (cobro POS y ticket)
    en-progreso/             ← (vacío) sin misión en curso
    hecho/                   ← 01–71 terminadas y verificadas
```

**Flujo de estados:** una misión entra por `pendiente/`; al asignarla se mueve a
`en-progreso/` (máximo una a la vez); termina en `hecho/` solo con la
verificación en verde y el reporte escrito. Si se bloquea, se queda en
`en-progreso/` con `BLOQUEO:` al final.

---

## 10. Riesgos y decisiones abiertas

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cloudflare Access en producción | Bloquea el negocio entero | Misión 18 antes de cualquier campaña |
| Latencia de CockroachDB desde el edge | Cada página se siente lenta | Worker junto a la base, ≤ 2 consultas, KV para frío |
| Costo de CockroachDB al crecer | Márgenes | Revisar mensualmente; alternativa: otro Postgres tras el mismo Hyperdrive |
| Un solo proveedor de modelo (Argon) | Dependencia y cuota | Misiones cortas; cualquier agente que lea `AGENTS.md` puede ejecutar |
| Usuarios con baja alfabetización digital | Abandono y soporte | S1–S6 de §1, pruebas con personas reales |
| Verificación manual del dueño | Cuellos de botella | Automatizar el arnés; el dueño solo aprueba artefactos |
| Dependencia de un solo canal de recordatorios (email) | Las ausencias no bajan si el correo no se lee | Misión 35 mide; WhatsApp como siguiente paso si no mejora |
| Falta de prueba social publicable | La landing no convierte sin casos reales | Misión 37 con casos de práctica si no hay reales |

Decisiones ya tomadas y por qué: mejorar lo existente (no reescribir), seguir
en PWA (no Expo), quedarse en Postgres/CockroachDB (no D1), un solo Worker (no
microservicios). El razonamiento está en `readme/analisis/`.

---

## 11. Próximos cinco pasos

1. **Ejecutar la 77b** (folio visible) — el folio consecutivo ya se asigna en
   el cobro (77a aplicada); falta mostrarlo en ticket impreso/imagen/texto,
   confirmación "Venta cobrada", ticket del POS y listados de ventas.
2. **Ejecutar la 78** (cobrar desde la agenda termina en "Venta cobrada") y
   la 79 (inicio de Cobrar sin acciones repetidas; sencillo sin jerga).
3. **Verificación manual de impresión** en un salón real: la 75 dejó la
   vista previa mostrando solo el comprobante; falta probarla en la
   impresora térmica física y en iPhone (compartir imagen).
4. **Evaluar la 80** (imagen del ticket en servidor con Browser Run + R2)
   solo si la generación en iPhone falla en la prueba manual.
5. **Revisar el aviso de hidratación** en `/admin/clientes/[id]` (preexistente,
   aparece en consola durante los flujos) y el error de feedback
   Agenda → Mi día en usabilidad móvil si se reproduce.
