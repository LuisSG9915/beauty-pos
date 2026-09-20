# Beauty POS

POS SaaS multiempresa para salones de belleza en México. La aplicación usa Next.js, TypeScript, Drizzle ORM, CockroachDB y Better Auth, y se despliega como un único Cloudflare Worker mediante OpenNext.

## Requisitos

- Node.js 22+
- pnpm 10+
- Una base CockroachDB para desarrollo
- Cuenta de Cloudflare para preview/despliegue

## Desarrollo local

1. Instala dependencias:

   ```bash
   pnpm install
   ```

2. Copia `.env.example` a `.env` y completa `DATABASE_URL` cuando tengas la conexión de desarrollo.

3. Genera migraciones después de modificar el esquema:

   ```bash
   pnpm db:generate
   ```

4. Aplica las migraciones únicamente contra la base de desarrollo:

   ```bash
   pnpm db:migrate
   ```

5. Ejecuta la interfaz con el servidor de Next.js:

   ```bash
   pnpm dev
   ```

   Abre <http://localhost:3000>.

6. Para crear el primer administrador de plataforma, define temporalmente estas variables en tu terminal y ejecuta el bootstrap:

   ```bash
   export BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
   export BOOTSTRAP_ADMIN_NAME="Administrador local"
   export BOOTSTRAP_ADMIN_PASSWORD="usa-una-contraseña-local-segura"
   pnpm bootstrap:admin
   unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PASSWORD
   ```

   Usa valores locales propios y nunca agregues credenciales reales a `.env.example`, al README ni al repositorio. Después podrás ingresar en <http://localhost:3000/login>.

## Verificación para Cloudflare Workers

El servidor `next dev` es útil para iterar rápidamente, pero la verificación real debe ejecutarse en `workerd`:

```bash
pnpm build:worker
pnpm wrangler dev
```

El despliegue se realizará con OpenNext:

```bash
pnpm deploy
```

No se debe desplegar hasta configurar el Worker, Hyperdrive y los secretos de producción.

## Comandos

| Comando | Uso |
| --- | --- |
| `pnpm dev` | Desarrollo rápido de Next.js |
| `pnpm build` | Build estándar de Next.js |
| `pnpm build:worker` | Build compatible con Workers |
| `pnpm preview` | Preview local del Worker generado |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript sin emitir archivos |
| `pnpm test` | Pruebas Vitest |
| `pnpm db:generate` | Generar migraciones Drizzle |
| `pnpm db:migrate` | Aplicar migraciones explícitas |
| `pnpm db:check` | Revisar migraciones Drizzle |

## Convenciones iniciales

- Tablas de catálogo usan el prefijo `cat_`.
- Relaciones usan el prefijo `rel_`.
- Detalles transaccionales usan nombres como `detalle_ventas`, `detalle_ventas_medios_pagos` y `detalle_cortes`.
- Las tablas de autenticación de Better Auth se mantendrán separadas de las tablas del negocio.
- Toda tabla de negocio multiempresa debe poder asociarse a `organizacion_id`.
- Las operaciones financieras e inventario se registrarán como movimientos auditables; no se eliminarán físicamente.
