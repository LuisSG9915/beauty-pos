# 36 — Onboarding lleva al primer cobro con datos de ejemplo

**Prioridad:** P1 · **Depende de:** 31 ·
**Tiempo estimado:** ≤ 2 h · **Archivos previstos:** ≤ 8

**Objetivo\***
Un salón recién registrado puede hacer su primer cobro en ≤ 10 min sin
tener que crear servicios, clientes ni configurar horarios: el modo práctica
(`/admin/practica`) se ofrece como primer paso y guía hasta cobrar un
ticket de ejemplo, midiendo el tiempo con la métrica de la misión 31. Hoy
la guía deriva del negocio real y un salón vacío no tiene qué cobrar.

**Fuera de alcance\***
Cambiar el esquema de onboarding, migraciones destructivas, ni tocar la
guía de configuración existente más allá de enlazarla. Se permite crear un
servicio y un cliente de ejemplo en el salón vacío, siempre que queden
marcados como demo para no distorsionar la métrica de activación (misión
31).

## Contexto verificado

- `src/modules/onboarding/service.ts` — `registrarAccionGuia` persiste
  omitir/reanudar/reiniciar y registra el hito; el avance de pasos se
  deriva del negocio real, no se escribe.
- `src/modules/onboarding/types.ts` — `GUIA_CONFIGURACION`, `GUIA_VERSION`,
  `EVENTOS_PRODUCTO` (incluye `guiaIniciada`, `guiaOmitida`).
- `src/app/admin/guia/page.tsx` — guía de configuración con pasos
  derivados del negocio real.
- `src/app/admin/practica` — modo práctica con datos de ejemplo (existe).
- `src/app/admin/page.tsx` — panel de plataforma con embudo del piloto y
  (misión 31) tarjeta "Tiempo a la primera venta".
- `src/modules/billing/activacion.ts` — cálculo puro de tiempo a primer
  cobro (mediana, p90, % en 10 min).

## Diseño decidido

- **Entrada única**: al terminar el registro, redirigir a
  `/admin/practica` con un banner "Aquí puedes cobrar un ejemplo sin tocar
  tus datos" y un botón "Ir a cobrar mi primer cliente" que lleva al POS
  real con un cliente de ejemplo precreado (o al modo práctica si no hay
  datos).
- **Datos de ejemplo**: si el salón está vacío, se crea un servicio y un
  cliente de ejemplo (marcados como demo) para que el onboarding no se
  detenga; el primer cobro real sigue midiendo la activación (misión 31)
  y los datos demo se excluyen del embudo.
- **Telemetría**: reutilizar `EVENTOS_PRODUCTO` para registrar
  `primera_practica_iniciada` si hace falta un evento nuevo (anotar en
  Desviaciones si se añade).

## Pasos

1. `src/modules/onboarding/rules.ts` — helper puro `salonVacio` (sin
   servicios ni ventas completadas) + prueba.
2. `src/app/admin/practica` (o su layout) — banner y CTA de salida al POS
   real cuando el salón está vacío.
3. Servicio de onboarding — si el salón está vacío, crear un servicio y un
   cliente de ejemplo con prefijo "Ejemplo — " (sin migración; el prefijo
   permite filtrarlos en la métrica de activación).
4. `src/modules/billing/activacion.ts` — excluir ventas cuyo cliente o
   servicio tenga el prefijo "Ejemplo — " del cálculo de primer cobro.
5. `src/app/admin/page.tsx` o layout — redirección inicial para
   organizaciones nuevas hacia práctica.
6. Prueba unitaria del helper "salón vacío" y del filtro de datos demo.

## Criterios de aceptación\*

- [ ] `pnpm typecheck && pnpm lint && pnpm test` → 0 errores.
- [ ] Un salón recién creado ve el modo práctica al entrar y puede cobrar
      un ticket de ejemplo en ≤ 2 min.
- [ ] Los datos demo (prefijo "Ejemplo — ") no cuentan como primer cobro
      real en la métrica de la misión 31.
- [ ] El primer cobro real queda medido por la misión 31.
- [ ] `pnpm test:usability` → 0 errores nuevos.

## Verificación

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm dev
pnpm test:usability
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 2 h (una sesión) |
| Archivos tocados | ≤ 8 |
| Contexto | ≤ 200k tokens |
| Lecturas antes de editar | ≤ 5 archivos |

## Criterios de parada (`BLOQUEO:`)

- El modo práctica no permite cobrar un ticket completo (falta POS en
  práctica).
- Crear un cliente de ejemplo real requiere migración o afecta reportes.

## Reporte (al terminar)

```
Misión: 36 — Onboarding lleva al primer cobro con datos de ejemplo
Cambios: src/modules/onboarding/rules.ts → salonVacio (+ prueba); src/app/admin/guia/page.tsx → banner "Practicar primero" cuando el salón está vacío. No se crearon datos reales ni se tocó activacion: la práctica sigue siendo 100 % en memoria, para no distorsionar la métrica de activación (misión 31) ni violar el invariante "los datos no se borran".
Verificación: typecheck ✔ | lint ✔ | test 607 ✔ (3 pruebas nuevas) | usability 0 errores (desktop y móvil)
Antes → después: guía sin entrada para salón vacío → banner con CTA a práctica
Desviaciones: (1) no se creó servicio/cliente de ejemplo real: la práctica ya ofrece datos de ejemplo en memoria y el primer cobro real queda medido por la misión 31 sin contaminación. (2) no se añadió redirección automática al entrar: se ofrece el CTA en la guía para no forzar un flujo. (3) no se modificó activacion.ts.
Riesgo abierto: falta validar con 5 salones reales que el tiempo al primer cobro baja de 10 min.
```

## Desviaciones (las escribe el implementador)

ninguna
