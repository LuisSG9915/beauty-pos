import Link from "next/link";

export const metadata = { title: "Términos de servicio — Beauty POS" };

const secciones = [
  {
    titulo: "1. El servicio",
    cuerpo:
      "Beauty POS es un sistema de gestión para estéticas, salones de belleza y spas: agenda, clientes, punto de venta, caja, inventario, reportes, gastos, comisiones, reservas en línea y recordatorios por correo. El acceso se otorga por suscripción o periodo de prueba.",
  },
  {
    titulo: "2. Periodo de prueba",
    cuerpo:
      "El registro incluye 14 días de prueba gratuita sin tarjeta. Los datos que registres durante la prueba se conservan si contratas una suscripción. Al terminar la prueba sin contratar, la cuenta pasa a solo lectura: puedes consultar tu información pero no registrar cambios.",
  },
  {
    titulo: "3. Pagos y renovación",
    cuerpo:
      "La suscripción se cobra por periodo mensual por transferencia o tarjeta. El pago activa el acceso completo por el periodo contratado. No hay cargos automáticos sin tu autorización.",
  },
  {
    titulo: "4. Tus datos",
    cuerpo:
      "La información de tu negocio (clientes, ventas, agenda, finanzas) es tuya. La usamos únicamente para operar el servicio. No vendemos ni compartimos tus datos con terceros.",
  },
  {
    titulo: "5. Uso aceptable",
    cuerpo:
      "La cuenta es personal e intransferible. No está permitido usar el servicio para actividades ilegales ni intentar acceder a datos de otras organizaciones. Cada organización solo ve su propia información.",
  },
  {
    titulo: "6. Comprobantes y facturación fiscal",
    cuerpo:
      "Los comprobantes generados por el sistema son documentos internos de la operación del negocio. La emisión de CFDI con validez fiscal ante el SAT estará disponible en una etapa posterior y se anunciará claramente cuando lo esté.",
  },
  {
    titulo: "7. Disponibilidad",
    cuerpo:
      "Trabajamos para mantener el servicio disponible, pero no garantizamos operación ininterrumpida. Las ventas registradas en modo offline se sincronizan cuando se recupera la conexión.",
  },
  {
    titulo: "8. Cancelación",
    cuerpo:
      "Puedes cancelar tu suscripción en cualquier momento. Conservas el acceso hasta el fin del periodo pagado y tus datos permanecen disponibles en solo lectura.",
  },
];

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-[#faf9f7] text-[#292522]">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6 lg:px-10">
        <Link className="flex items-center gap-3" href="/">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#2c2522] text-sm font-semibold text-[#f6eadf]">
            BP
          </div>
          <p className="font-semibold tracking-tight">Beauty POS</p>
        </Link>
        <Link
          className="inline-flex h-8 items-center rounded-lg border border-[#ded5ce] bg-white px-4 text-sm font-medium transition-colors hover:bg-[#f4f1ee]"
          href="/registro"
        >
          Crear cuenta
        </Link>
      </header>

      <article className="mx-auto w-full max-w-4xl px-6 pb-20 pt-10 lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#ae6f54]">Legal</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Términos de servicio</h1>
        <p className="mt-4 text-sm text-[#81746c]">Última actualización: enero 2026</p>

        <div className="mt-10 space-y-8">
          {secciones.map((seccion) => (
            <section key={seccion.titulo}>
              <h2 className="font-semibold">{seccion.titulo}</h2>
              <p className="mt-2 text-sm leading-7 text-[#5d524b]">{seccion.cuerpo}</p>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
