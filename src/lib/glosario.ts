/**
 * Glosario del salón — vocabulario permitido en la UI operativa.
 *
 * El sistema lo usa gente sin perfil técnico: nada de jerga de software ni
 * estados internos crudos. Cuando necesites una etiqueta, usa estos términos;
 * si falta uno, agrégalo aquí (fuente única) en vez de improvisar.
 *
 *   cliente de paso   venta sin cita registrada (nunca "walk-in")
 *   profesional       quien atiende la cita (no "estilista" técnico ni "user")
 *   sin asignar       cita sin profesional elegido todavía
 *   por cobrar        cita terminada que aún no se cobra
 *   cobrada           cita con venta ya cobrada
 *   agendada          cita registrada, cliente aún no llega
 *   ya llegó          check-in: la cliente está en el salón (en_proceso)
 *   no vino           la cliente no se presentó (no_asistio)
 *   cancelar cita     única acción destructiva visible de la agenda
 *   cabina / silla    recurso físico (el campo técnico es "recurso")
 *   descanso          bloqueo de agenda por comida/descanso
 *   cerrado           bloqueo porque la sucursal no abre
 *   abrir caja        iniciar turno con fondo; "cerrar caja" lo termina
 *   venta sin cita    cobro directo en Cobrar sin cita agendada
 *   cambiar fecha     reagendar (nunca "reagendar" ni "reschedule")
 *   ocultar cita      quita la cita de la agenda sin borrarla (auditable)
 *   negocio           la organización del salón (en la UI cotidiana nunca
 *                     "organización"; solo admin de plataforma y suscripción)
 *   sucursal          local del negocio (ya era el término visible)
 *   clave             código interno del producto/servicio (el campo técnico
 *                     es "sku" en productos; en la UI nunca "SKU")
 *   vendedor          quien cobró la venta (ventas.usuario_id); quien atiende
 *                     la cita sigue siendo "profesional"
 *   plano             mapa de la sucursal por pisos y celdas (plan 11)
 *   ubicación         lugar donde se guarda mercancía (vitrina, estante,
 *                     bodega, mostrador); el campo técnico es "ubicaciones"
 *   mobiliario        muebles y activos físicos (asientos, mesas, camillas);
 *                     el campo técnico es "mobiliario", nunca "recursos"
 *                     (los recursos son los agendables de la agenda)
 *   sin ubicar        stock de la sucursal sin ubicación asignada en el plano
 */

export const GLOSARIO = {
  clienteDePaso: "Cliente de paso",
  sinAsignar: "Sin asignar",
  ventaSinCita: "Venta sin cita",
  nuevaCita: "Nueva cita",
  cobrar: "Cobrar",
  abrirCaja: "Abrir caja",
  cerrarCaja: "Cerrar caja",
  negocio: "negocio",
  sucursal: "sucursal",
  plano: "plano",
  ubicacion: "ubicación",
  mobiliario: "mobiliario",
  sinUbicar: "Sin ubicar",
  aquiCobras: "Aquí cobras los servicios y productos del salón.",
  conteoCajaTitulo: "Cuenta el dinero de la caja",
  conteoCajaDescripcion:
    "Escribe cuánto dinero en efectivo hay en el cajón y cuánto sumaron los cobros con tarjeta o transferencia. Al confirmar, verás si la cuenta cuadra.",
  otrosMediosCajaTitulo: "Cobros con tarjeta y transferencia",
  otrosMediosCajaDescripcion:
    "Suma los comprobantes cobrados con tarjeta o transferencia durante el turno.",
} as const;

/**
 * Mensajes de error de acceso con responsable claro: cada texto le dice a la
 * persona del salón a quién pedirle ayuda. La clave es el código estable del
 * error, no el mensaje crudo.
 */
export const MENSAJES_ERROR_ACCESO: Record<string, string> = {
  "permiso-denegado":
    "No tienes permiso para entrar a esta sección. Pídele a la dueña o encargada del salón que te dé acceso desde Roles.",
  "organization-access-denied":
    "Tu cuenta no tiene acceso a este salón. Pídele a la dueña o encargada que revise tu invitación en Equipo.",
};

/**
 * Heurística de presentación/copy para la UI: traduce el texto de un error
 * operativo a un mensaje llano que indica quién puede resolverlo en el salón.
 * Solo sirve para mostrar texto amable; NUNCA para lógica de negocio ni para
 * decidir permisos (eso se valida en el servidor).
 */
export function explicarErrorOperativo(mensaje?: string | null): string {
  const texto = (mensaje ?? "").toLowerCase();
  if (texto.includes("permiso") || texto.includes("autoriz")) {
    return MENSAJES_ERROR_ACCESO["permiso-denegado"];
  }
  if (
    texto.includes("caja") &&
    (texto.includes("abiert") || texto.includes("cerrad") || texto.includes("turno"))
  ) {
    return "La caja está cerrada. Pídele a recepción o a la encargada que toque «Abrir caja» para poder cobrar.";
  }
  if (texto.includes("stock") || texto.includes("existencia")) {
    return "No hay suficientes piezas registradas en el inventario. Pídele a la encargada o a almacén que registre la entrada del producto.";
  }
  return "No se pudo completar la acción. Intenta de nuevo; si vuelve a pasar, avísale a la encargada del salón o escribe a soporte.";
}
