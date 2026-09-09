export const defaultPermissions = [
  { clave: "organizaciones.ver", nombre: "Ver organizaciones", modulo: "organizaciones" },
  { clave: "organizaciones.editar", nombre: "Editar organizaciones", modulo: "organizaciones" },
  { clave: "sucursales.ver", nombre: "Ver sucursales", modulo: "sucursales" },
  { clave: "sucursales.editar", nombre: "Editar sucursales", modulo: "sucursales" },
  { clave: "usuarios.ver", nombre: "Ver usuarios", modulo: "usuarios" },
  { clave: "usuarios.invitar", nombre: "Invitar usuarios", modulo: "usuarios" },
  { clave: "usuarios.editar", nombre: "Editar usuarios", modulo: "usuarios" },
  { clave: "roles.ver", nombre: "Ver roles", modulo: "roles" },
  { clave: "roles.editar", nombre: "Editar roles", modulo: "roles" },
  { clave: "clientes.ver", nombre: "Ver clientes", modulo: "clientes" },
  { clave: "clientes.editar", nombre: "Editar clientes", modulo: "clientes" },
  { clave: "expedientes.alergias_ver", nombre: "Ver alergias", modulo: "expedientes" },
  { clave: "agenda.ver", nombre: "Ver agenda", modulo: "agenda" },
  { clave: "agenda.editar", nombre: "Editar agenda", modulo: "agenda" },
  { clave: "ventas.ver", nombre: "Ver ventas", modulo: "ventas" },
  { clave: "ventas.crear", nombre: "Crear ventas", modulo: "ventas" },
  { clave: "ventas.cobrar", nombre: "Cobrar ventas", modulo: "ventas" },
  { clave: "caja.abrir", nombre: "Abrir caja", modulo: "caja" },
  { clave: "caja.cerrar", nombre: "Cerrar caja", modulo: "caja" },
  { clave: "inventario.ver", nombre: "Ver inventario", modulo: "inventario" },
  { clave: "inventario.editar", nombre: "Editar inventario", modulo: "inventario" },
  { clave: "reportes.operativos", nombre: "Ver reportes operativos", modulo: "reportes" },
  { clave: "reportes.financieros", nombre: "Ver reportes financieros", modulo: "reportes" },
] as const;

export const defaultRoles = [
  {
    clave: "propietario",
    nombre: "Propietario",
    permissions: defaultPermissions.map((permission) => permission.clave),
  },
  {
    clave: "administrador",
    nombre: "Administrador",
    permissions: defaultPermissions.map((permission) => permission.clave),
  },
  {
    clave: "gerente",
    nombre: "Gerente",
    permissions: defaultPermissions
      .filter((permission) => !permission.clave.startsWith("organizaciones."))
      .map((permission) => permission.clave),
  },
  {
    clave: "recepcion",
    nombre: "Recepción",
    permissions: [
      "sucursales.ver",
      "usuarios.ver",
      "clientes.ver",
      "clientes.editar",
      "agenda.ver",
      "agenda.editar",
      "ventas.ver",
      "ventas.crear",
    ],
  },
  {
    clave: "cajero",
    nombre: "Cajero",
    permissions: [
      "clientes.ver",
      "agenda.ver",
      "ventas.ver",
      "ventas.crear",
      "ventas.cobrar",
      "caja.abrir",
      "caja.cerrar",
    ],
  },
  {
    clave: "especialista",
    nombre: "Especialista",
    permissions: [
      "clientes.ver",
      "clientes.editar",
      "expedientes.alergias_ver",
      "agenda.ver",
      "agenda.editar",
      "ventas.ver",
    ],
  },
  {
    clave: "almacen",
    nombre: "Almacén",
    permissions: ["inventario.ver", "inventario.editar"],
  },
] as const;
