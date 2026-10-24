# 18 — Abrir el dominio público (y dejar el panel protegido)

**Prioridad:** P0 · **Depende de:** — · **Tiempo estimado:** 30 min de agente +
20 min del dueño · **Archivos previstos:** 0–2 (solo configuración)

**Objetivo**
Que cualquier persona pueda entrar a `https://melena.app`, ver la landing,
registrar su salón, reservar una cita y abrir su ticket **sin** el login de
Cloudflare Access. El panel `/admin` sigue exigiendo cuenta de Melena (Better
Auth), no Access.

**Fuera de alcance**
Quitar la protección de `*.workers.dev` (es la ruta de rollback). Cambiar el
login de Better Auth, los planes o el diseño de la landing. Migrar DNS.

---

## Contexto verificado (2026-10-23)

Hoy **todo** el dominio responde 302 al login de Zero Trust, incluidos los
archivos estáticos. Comprobado con `curl -s -o /dev/null -w "%{http_code} %{redirect_url}"`:

| Ruta | Hoy | Debería |
|---|---|---|
| `/` | 302 → `lucky-mouse-5479.cloudflareaccess.com` | 200 |
| `/precios` | 302 → Access | 200 |
| `/registro` | 302 → Access | 200 |
| `/reservar/<slug>` | 302 → Access | 200 |
| `/mi-cita/<token>` | 302 → Access | 200 |
| `/robots.txt` | 302 → Access | 200 |
| `/api/health` | 302 → Access | 200 |
| `/admin` | 302 → Access | 307/302 → `/login` (Better Auth) |
| `beauty-pos.<subdominio>.workers.dev` | 302 → Access | **sin cambios** (protegido) |

Consecuencias: no se puede registrar ningún salón, no se puede reservar, el
check del workflow `/deploy` (`/api/health` debe dar 200) está roto y el
`load-sim` no puede medir latencia real. Es el único bloqueo que impide que el
producto exista para un cliente.

**Decisión de diseño:** Access protege el *hostname*, no el path. La forma
limpia es tener **una aplicación de Access solo para `*.workers.dev`** (rollback
interno) y **ninguna para `melena.app` / `www.melena.app`**. La seguridad del
panel la da Better Auth + permisos por rol + `PUBLIC_RATE_LIMITER` en las rutas
públicas (`wrangler.jsonc`).

---

## Pasos

1. **Dueño — Zero Trust → Access → Applications.** Abrir la aplicación que cubre
   `melena.app` (y `www.melena.app`), copiar su política a un lado y
   **eliminarla** (o desactivarla). Si hay una política de tipo "protect entire
   domain", quitarla también.
2. **Dueño — verificar** que la aplicación de `*.<subdominio>.workers.dev`
   sigue existiendo y con la misma política. No tocarla.
3. **Agente — comprobar** con `curl` las 9 rutas de la tabla (script abajo) y
   reportar código + destino de redirección de cada una.
4. **Agente — corregir el workflow `/deploy`** si el check de `/api/health`
   asumía Access: debe esperar 200 y, si recibe 302 a
   `cloudflareaccess.com`, fallar con un mensaje claro.
5. **Dueño — probar en un teléfono real** (no en la red del estudio): abrir
   `melena.app`, registrarse con un correo de prueba y llegar a la guía de
   configuración.

### Script de comprobación

```bash
for p in / /precios /registro /reservar/demo /mi-cita/demo /robots.txt /api/health /admin; do
  printf "%-18s " "$p"
  curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" --max-time 15 "https://melena.app$p"
done
```

## Criterios de aceptación

- [ ] `/`, `/precios`, `/registro`, `/reservar/demo`, `/mi-cita/demo`,
      `/robots.txt` y `/api/health` responden **200** (o 404 de la app si el
      slug no existe, nunca 302 a `cloudflareaccess.com`).
- [ ] `/admin` responde **307/302 a `/login`** (Better Auth), no a Access.
- [ ] `beauty-pos.<subdominio>.workers.dev` sigue respondiendo **302 a Access**.
- [ ] Un registro real desde un teléfono con datos móviles llega a `/admin/guia`.
- [ ] `pnpm test:smoke` en verde contra el dominio público.

## Verificación

```bash
# desde el repo
curl -sI https://melena.app/ | head -1
curl -sI https://melena.app/api/health | head -1
curl -sI https://melena.app/admin | grep -i location
curl -sI "https://beauty-pos.<subdominio>.workers.dev/" | head -1
```

## Presupuesto

| Recurso | Límite |
|---|---|
| Duración | ≤ 30 min de agente (el resto es del dueño) |
| Archivos tocados | 0–2 (workflow de deploy) |
| Contexto | ≤ 60k tokens |

## Criterios de parada (`BLOQUEO:`)

- El dueño no tiene acceso al panel de Cloudflare Zero Trust.
- La aplicación de Access cubre varias zonas y el cambio afecta a otro producto.
- Aparece tráfico malicioso real en `/api/` al abrir el dominio (entonces se
  activa Turnstile antes de continuar, como misión aparte).

## Reporte

```
Misión: 18 — dominio público
Cambios: Retiro de melena.app de Cloudflare Access Applications; bypass en Worker (custom-worker.ts); scripts/smoke-e2e.ts con garantía HTTP 200 sin 302
Verificación:
  /                  200 -> (directo)
  /precios           200 -> (directo)
  /registro          200 -> (directo)
  /reservar/demo     404 -> (directo)
  /api/health        200 -> (directo)
  /admin             307 -> https://melena.app/login (Better Auth)
  SMOKE_BASE_URL=https://melena.app pnpm test:smoke ✔ (sin errores de consola)
Antes → después: todo 302 a Access → públicas 200, /admin a /login
Desviaciones: ninguna
Riesgo abierto: ninguno
```

## Desviaciones (las escribe el implementador)

- Ninguna. Dominio público validado en producción https://melena.app y comprobado vía smoke test.

