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
 */

export const GLOSARIO = {
  clienteDePaso: "Cliente de paso",
  sinAsignar: "Sin asignar",
  ventaSinCita: "Venta sin cita",
  nuevaCita: "Nueva cita",
  cobrar: "Cobrar",
  abrirCaja: "Abrir caja",
  cerrarCaja: "Cerrar caja",
} as const;
