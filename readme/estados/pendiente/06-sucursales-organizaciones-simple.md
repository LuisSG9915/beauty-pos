# Plan 06 — Organizaciones y sucursales más intuitivas

**Modelo:** SWE-2 MAX (diseño cerrado; no requiere Opus)
**Depende de:** 01 (cookie de sucursal + `BranchSelector` global) y 02 (clave automática)
**Dolor:** "La estructura de sucursales y organizaciones se me hace compleja."

## Lo que YA está bien (verificado — no rehacer)

- Registro (`src/app/registro/actions.ts`) ya crea organización + "Sucursal principal".
- `OrganizationSelector` (`components/admin/admin-shell.tsx:54`) con 1 sola org ya
  muestra solo el nombre (sin select).
- Límites del plan por sucursal (`modules/sucursales/rules.ts`) correctos.

## Qué hace confusa la estructura hoy (causas reales)

1. **Selector de sucursal repetido por pantalla**: agenda (`agenda-toolbar.tsx:189`),
   POS, inventario, reportes… cada uno con su propio `<select>` y sin memoria
   (lo resuelve el plan 01 con un selector global en el shell).
2. **"Sucursal principal"**: nombre genérico que nadie cambia; el usuario no
   reconoce su salón en la UI.
3. **Pantalla Sucursales abre con "Cobertura del plan"** (facturación) antes que las
   sucursales; la clave técnica aparece en la descripción (`sucursal.clave · zona`).
4. **Asignación de equipo en dos lugares** (Equipo `/admin/usuarios` y Sucursales →
   "Miembros con acceso") con una regla invisible: *un miembro sin ninguna
   asignación ve TODAS las sucursales* (`sinRestriccion`), y al asignarle una
   pierde las demás. El checkbox aparece deshabilitado sin explicar por qué.
5. **Zona horaria como `America/Mexico_City`** cruda.
6. El chip de org en el sidebar no dice que es "tu negocio".

## Diseño cerrado

### A. Nombre del negocio y de la sucursal en el primer uso

- En `/admin` (inicio), si la org tiene **1 sola sucursal** llamada exactamente
  "Sucursal principal", mostrar tarjeta dismissable "¿Cómo se llama tu salón?" con
  un input prellenado con `organizacion.nombre`; al guardar renombra la sucursal
  (action existente `actualizarSucursalAction` con solo `nombre`; si exige más
  campos, crear `renombrarSucursalAction` mínima con `sucursales.editar`).
- Añadir este paso a la checklist de guía (`src/modules/onboarding/rules.ts`) si el
  modelo de pasos lo permite sin migración; si requiere migración, omitir.

### B. Shell: "Mi negocio" + sucursal

- Sidebar: el bloque de org pasa a decir **"Tu negocio"** como etiqueta (en lugar de
  "Organización") — con 1 org solo el nombre; con varias, el select actual.
- Debajo: `BranchSelector` del plan 01 con etiqueta **"Sucursal"**; con 1 sucursal,
  solo texto.
- Quitar los selects de sucursal de `agenda-toolbar.tsx`, POS, inventario (si el
  plan 01 no lo hizo ya). Reportes conserva su opción "Todas las sucursales".

### C. Pantalla Sucursales rediseñada (`/admin/sucursales`)

Orden nuevo:
1. Encabezado: "Sucursales" + botón "Nueva sucursal" (igual).
2. **Rejilla de tarjetas** (1 col móvil, 2 col `lg`), cada tarjeta:
   - nombre grande, dirección y teléfono (sin clave, sin zona horaria);
   - chips: "N personas" (asignadas o "Todo el equipo"), "Reservas en línea: sí/no",
     estado activa/inactiva;
   - acciones: "Editar" (abre `FormSheet` con `SucursalEditarForm` — quitar el
     `<details>` actual), "Equipo" (abre `FormSheet` con la asignación), toggle activar.
3. **Cobertura del plan** pasa al final, colapsada en un `AdminCard` compacto de una
   línea ("Usas 1 de 2 sucursales de tu plan · Ver suscripción").

`SucursalNuevaForm`: quitar campo Clave (plan 02 la genera) y mover "Zona horaria"
a "Más opciones" con default de la organización.

**Zona horaria legible**: mapa en `sucursal-form.tsx`:
`America/Mexico_City → "Centro (CDMX, Guadalajara, Monterrey)"`,
`America/Cancun → "Quintana Roo"`, `America/Tijuana → "Baja California"`,
`America/Hermosillo → "Sonora"`, `America/Mazatlan → "Pacífico (Sinaloa, Nayarit, BCS)"`,
`America/Chihuahua → "Chihuahua"`, `America/Monterrey → "Noreste"`,
`America/Merida → "Yucatán/Campeche"`. El `value` sigue siendo el IANA.

### D. Asignación de equipo: una sola fuente y regla visible

- La asignación vive en **la tarjeta de la sucursal → "Equipo"** (FormSheet).
  En `/admin/usuarios` se conserva la vista por persona (no se elimina) pero ambas
  usan el mismo componente/acción (`SucursalAsignacionForm` / acción actual de
  `sucursales/actions.ts`).
- Reemplazar el checkbox deshabilitado por un control explícito por persona:
  **"Todas las sucursales"** (switch) / lista de sucursales. Texto de ayuda:
  "Con 'Todas', la persona ve cualquier sucursal, incluidas las nuevas."
  Al apagar "Todas" se pre-marca la sucursal actual. Lógica de datos sin cambios:
  "Todas" = sin filas en `rel_usuarios_sucursales`.
- Validación servidor ya existente (`sucursales.editar`, `assertBranchScope`) se respeta.

### E. Vocabulario

Agregar a `src/lib/glosario.ts`: `organizacion: "negocio"`, `sucursal: "sucursal"`;
en UI cotidiana nunca "organización" salvo en panel de Plataforma (`/admin` de
plataforma) y Suscripción.

## Pasos

1. B (shell) — si el plan 01 ya creó `BranchSelector`, solo etiquetas + limpieza.
2. C (pantalla) + zona horaria legible.
3. D (asignación con switch "Todas").
4. A (renombrar "Sucursal principal").
5. E (glosario + textos).

## Criterios de aceptación

- Con 1 negocio y 1 sucursal: el usuario nunca ve "organización", ni selectores, ni
  claves técnicas.
- Crear sucursal: nombre + dirección → listo (zona y clave automáticas).
- Asignar equipo desde la tarjeta; queda claro quién ve todas las sucursales.
- "Sucursal principal" se renombra desde el inicio en 1 paso.

## Verificación

`pnpm typecheck`, `pnpm lint`, `pnpm test` (incluye `modules/sucursales/rules.test.ts`
y onboarding si se toca), `pnpm test:usability` con `pnpm dev`.

## Fuera de alcance

Franquicias/multi-negocio avanzado, precios por sucursal, cambios de billing.

## Desviaciones (la llena el implementador)

_Vacío. Anotar aquí cualquier diferencia entre el plan y el código real, y `BLOQUEO:` si algo impide continuar._
