# Misión 02 — Garantía HTTP 200 en rutas públicas y verificación en `smoke-e2e.ts`

## 1. Metadatos
- **ID:** 02
- **Duración estimada:** 25 minutos
- **Archivos a modificar:** 4 (`src/app/api/health/route.ts`, `src/app/registro/page.tsx`, `src/app/reservar/[slug]/page.tsx`, `scripts/smoke-e2e.ts`)
- **Trazabilidad:** `readme/README.md` §1 Criterio S1 (Registro, precios, reserva pública y `/api/health` responden 200 sin 302)
- **Dependencias:** Misión 01

## 2. Objetivo
Asegurar que ninguna ruta pública (`/`, `/precios`, `/registro`, `/reservar/[slug]`, `/api/health`) invoque ayudantes de sesión obligatoria que lancen redirección 302 a `/login` o a Cloudflare Access, y automatizar la comprobación de código HTTP 200 sin redirección (`redirect: "manual"`) en `scripts/smoke-e2e.ts`.

## 3. Fuera de alcance
- No cambiar el diseño visual ni los textos comerciales de `/`, `/precios`, `/registro` ni `/reservar/[slug]`.
- No modificar precios ni planes en `src/modules/billing/precios.ts`.
- No tocar el esquema de base de datos.

## 4. Contrato de contexto
- **Archivos permitidos para lectura (máximo 4):**
  1. `src/app/api/health/route.ts`
  2. `src/app/registro/page.tsx`
  3. `src/app/reservar/[slug]/page.tsx`
  4. `scripts/smoke-e2e.ts`
- **Archivos que NO debes abrir:**
  - `src/app/admin/*`
  - `src/modules/pos/*`
  - `drizzle/*`

## 5. Contexto verificado
- Archivos reales en el árbol del repositorio: `src/app/api/health/route.ts`, `src/app/registro/page.tsx`, `src/app/reservar/[slug]/page.tsx`, `scripts/smoke-e2e.ts`.
- `BLOQUEO:` Antes de editar, ejecuta `nl -ba src/app/api/health/route.ts src/app/registro/page.tsx src/app/reservar/\[slug\]/page.tsx scripts/smoke-e2e.ts` para verificar las líneas exactas.

## 6. Diseño decidido
Se elige usar `redirect: "manual"` en las peticiones `fetch` de `scripts/smoke-e2e.ts` para detectar cualquier `302` o `307` encubierto hacia Cloudflare Access (`cloudflareaccess.com`) o `/login`. En `/api/health/route.ts`, la respuesta de salud debe devolver `200` con `{ ok: true }` y cabecera `Cache-Control: no-store` usando máximo 1 consulta ligera (`SELECT 1`) sin requerir cookies ni encabezados de autenticación.

## 7. Pasos
1. **Blindar `src/app/api/health/route.ts` como endpoint público sin autenticación:**
   - Archivo: `src/app/api/health/route.ts`
   - Qué cambia: Garantizar que `GET` no lea sesión ni encabezados de Access, ejecute como máximo 1 consulta rápida de conectividad y retorne `NextResponse.json({ ok: true, status: "healthy" }, { status: 200, headers: { "Cache-Control": "no-store" } })`.
   - Verificación inmediata: `pnpm typecheck`
2. **Verificar ausencia de redirección forzada en `src/app/registro/page.tsx` y `src/app/reservar/[slug]/page.tsx`:**
   - Archivos: `src/app/registro/page.tsx`, `src/app/reservar/[slug]/page.tsx`
   - Qué cambia: Si existe cualquier llamada a `requireAdminContext` o redirección no solicitada cuando no hay sesión activa, eliminarla o reemplazarla por lectura anónima; mantener `<= 2` consultas a la base de datos en `/reservar/[slug]/page.tsx`.
   - Verificación inmediata: `pnpm typecheck && pnpm lint`
3. **Agregar aserciones `redirect: "manual"` para rutas públicas en `scripts/smoke-e2e.ts`:**
   - Archivo: `scripts/smoke-e2e.ts`
   - Qué cambia: Añadir verificación explícita con `fetch(url, { redirect: "manual" })` para `/`, `/precios`, `/registro`, `/api/health` y una ruta `/reservar/<slug-demo>`, exigiendo `res.status === 200` y comprobando que `res.headers.get("location")` sea `null` (nunca `302` a `cloudflareaccess.com`).
   - Verificación inmediata: `pnpm tsx scripts/smoke-e2e.ts`

## 8. Criterios de aceptación y verificación
- Comando 1:
  ```bash
  pnpm typecheck && pnpm lint
  ```
- Salida esperada: 0 errores.
- Comando 2:
  ```bash
  pnpm tsx scripts/smoke-e2e.ts
  ```
- Salida esperada: Todas las rutas públicas (/, /precios, /registro, /reservar/*, /api/health) reportan HTTP 200 con 0 redirecciones 302.

## 9. Presupuesto y criterios de parada (BLOQUEO:)
- Presupuesto: Máximo 4 archivos; 25 minutos; <= 2 consultas SQL por página pública.
- Criterios de parada:
  - BLOQUEO: Si /reservar/[slug]/page.tsx necesita un slug de sucursal sembrado en la base local y no existe ninguno en smoke-e2e.ts, usa el helper de semilla existente en scripts/lib/e2e.ts; si no existe, detente con BLOQUEO:.

## 10. Reporte, desviaciones y bloque de handoff
- Desviaciones permitidas: Ninguna.
- Bloque de handoff (pegar en máximo 10 líneas al terminar):
  - git diff --stat (máximo 4 archivos).
  - Salida de pnpm tsx scripts/smoke-e2e.ts.
  - Tabla Antes/Después de códigos HTTP (status y location) para /, /precios, /registro, /reservar/* y /api/health.
