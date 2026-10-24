# Misión 01 — Exclusión (Bypass) de rutas públicas en Cloudflare Access y Worker

## 1. Metadatos
- **ID:** 01
- **Duración estimada:** 30 minutos
- **Archivos a modificar:** 3 (`src/lib/auth/access.ts`, `custom-worker.ts`, `scripts/seed-access.ts`)
- **Trazabilidad:** `readme/README.md` §1 Criterio S1 (Adquisición, registro y reserva pública sin bloqueo Zero Trust)
- **Dependencias:** Misión 00

## 2. Objetivo
Definir una lista única e inmutable de rutas públicas (`/`, `/precios`, `/registro`, `/reservar/*`, `/mi-cita/*`, `/invitacion/*`, `/privacidad`, `/terminos`, `/soporte`, `/login`, `/recuperar`, `/restablecer`, `/api/health`, `/api/auth/*`, `/manifest.webmanifest`, `/sw.js`, `/icon*`, `/apple-icon*`, `/og.png`, `/_next/*`) que jamás exijan encabezado ni redirección de Cloudflare Access en el Worker ni en la configuración de Zero Trust.

## 3. Fuera de alcance
- No ejecutar `pnpm run deploy` ni aplicar cambios en la cuenta productiva de Cloudflare sin autorización.
- No modificar la lógica de roles o permisos de `src/lib/auth/authorization.ts`.
- No modificar `src/lib/auth/server.ts`.

## 4. Contrato de contexto
- **Archivos permitidos para lectura (máximo 4):**
  1. `src/lib/auth/access.ts`
  2. `custom-worker.ts`
  3. `scripts/seed-access.ts`
  4. `src/lib/auth/authorization.test.ts`
- **Archivos que NO debes abrir:**
  - `src/db/schema/*`
  - `src/app/admin/*`
  - `drizzle/*`

## 5. Contexto verificado
- Archivos reales en el árbol del repositorio: `src/lib/auth/access.ts`, `custom-worker.ts`, `scripts/seed-access.ts`.
- `BLOQUEO:` Antes de editar, ejecuta `nl -ba src/lib/auth/access.ts custom-worker.ts scripts/seed-access.ts` para confirmar los números de línea exactos. Si alguno de los tres archivos no existe o difiere de su responsabilidad de control de acceso, detente con `BLOQUEO:`.

## 6. Diseño decidido
Se elige proteger únicamente el prefijo `/admin` y los endpoints administrativos internos con Cloudflare Access, declarando explícitamente `PUBLIC_PATHS` en `src/lib/auth/access.ts` con una función pura `esRutaPublicaAccess(pathname: string): boolean`. `custom-worker.ts` omite cualquier verificación de cabecera `Cf-Access-Jwt-Assertion` cuando `esRutaPublicaAccess(url.pathname)` sea `true`, y `scripts/seed-access.ts` registra una política `bypass` (`decision: "bypass"`, `include: [{ everyone: {} }]`) para las aplicaciones sub-ruta públicas o restringe la aplicación protegida de Zero Trust exclusivamente a `melena.app/admin*`.

## 7. Pasos
1. **Exportar `RUTAS_PUBLICAS_ACCESS` y `esRutaPublicaAccess` en `src/lib/auth/access.ts`:**
   - Archivo: `src/lib/auth/access.ts`
   - Qué cambia: Añadir la constante `RUTAS_PUBLICAS_PREFIJOS = ["/precios", "/registro", "/reservar", "/mi-cita", "/invitacion", "/privacidad", "/terminos", "/soporte", "/login", "/recuperar", "/restablecer", "/offline", "/api/health", "/api/auth", "/_next"] as const` y `RUTAS_PUBLICAS_EXACTAS = ["/", "/favicon.ico", "/manifest.webmanifest", "/sw.js", "/robots.txt", "/icon.png", "/icon.svg", "/apple-icon.png", "/og.png"] as const`, junto con la función `esRutaPublicaAccess(pathname: string): boolean`. Hacer que el validador de Access retorne acceso permitido inmediatamente si `esRutaPublicaAccess(pathname)` es `true`.
   - Verificación inmediata: `pnpm typecheck`
2. **Aplicar cortocircuito para rutas públicas en `custom-worker.ts`:**
   - Archivo: `custom-worker.ts`
   - Qué cambia: Importar `esRutaPublicaAccess` desde `./src/lib/auth/access` y, antes de cualquier validación de Zero Trust o redirección de protección en el handler `fetch`, permitir el paso directo al handler de OpenNext cuando `esRutaPublicaAccess(new URL(request.url).pathname)` sea `true`.
   - Verificación inmediata: `pnpm typecheck`
3. **Actualizar `scripts/seed-access.ts` para proteger solo `/admin` y crear bypass en rutas públicas:**
   - Archivo: `scripts/seed-access.ts`
   - Qué cambia: Ajustar la definición de la aplicación de Cloudflare Access para que la política `allow` con login Zero Trust aplique solo a `melena.app/admin` y `melena.app/admin/*`, o bien incluir una política de precedencia 1 con `decision: "bypass"` e `include: [{ everyone: {} }]` para los caminos públicos verificados en `RUTAS_PUBLICAS_PREFIJOS` y `RUTAS_PUBLICAS_EXACTAS`.
   - Verificación inmediata: `pnpm typecheck && pnpm lint`
4. **Añadir pruebas unitarias de rutas públicas en `src/lib/auth/authorization.test.ts`:**
   - Archivo: `src/lib/auth/authorization.test.ts`
   - Qué cambia: Agregar bloque `describe("esRutaPublicaAccess", ...)` probando que `/`, `/precios`, `/registro`, `/reservar/salon-demo`, `/api/health` devuelven `true` y `/admin`, `/admin/pos`, `/admin/clientes` devuelven `false`.
   - Verificación inmediata: `pnpm test src/lib/auth/authorization.test.ts --run`

## 8. Criterios de aceptación y verificación
- Comando:
  ```bash
  pnpm typecheck && pnpm lint && pnpm test src/lib/auth/authorization.test.ts --run
  ```
- Salida esperada: 0 errores de tipos/lint y todas las pruebas de src/lib/auth/authorization.test.ts en verde incluyendo esRutaPublicaAccess.

## 9. Presupuesto y criterios de parada (BLOQUEO:)
- Presupuesto: Máximo 3 archivos de producción + 1 archivo de prueba; 30 minutos.
- Criterios de parada:
  - BLOQUEO: Si custom-worker.ts importa módulos incompatibles con el runtime de Cloudflare Workers al importar src/lib/auth/access.ts, detente; mantén esRutaPublicaAccess libre de dependencias de Node o base de datos.
  - BLOQUEO: Si scripts/seed-access.ts requiere llamadas en vivo a la API de Cloudflare durante pnpm test, no lo ejecutes contra producción; solo valida su compilación con pnpm typecheck.

## 10. Reporte, desviaciones y bloque de handoff
- Desviaciones permitidas: Ninguna.
- Bloque de handoff (pegar en máximo 10 líneas al terminar):
  - git diff --stat mostrando únicamente los 4 archivos autorizados.
  - Salida de pnpm typecheck && pnpm lint.
  - Salida de pnpm test src/lib/auth/authorization.test.ts --run.
  - Tabla Antes/Después de rutas evaluadas por esRutaPublicaAccess.
