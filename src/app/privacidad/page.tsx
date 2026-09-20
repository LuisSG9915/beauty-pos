import Link from "next/link";

export const metadata = { title: "Aviso de privacidad — Beauty POS" };

const secciones = [
  {
    titulo: "Responsable y datos que recabamos",
    cuerpo:
      "Beauty POS recaba los datos necesarios para operar tu cuenta: nombre, correo y los datos de operación que registras (clientes, citas, ventas). No recabamos datos personales sensibles por cuenta propia.",
  },
  {
    titulo: "Uso de la información",
    cuerpo:
      "Usamos tus datos exclusivamente para proporcionar el servicio: autenticación, operación del negocio, recordatorios de citas por correo y soporte. No vendemos ni compartimos información con fines publicitarios.",
  },
  {
    titulo: "Datos de tus clientes",
    cuerpo:
      "Como titular de la cuenta, tú eres responsable de los datos de tus clientes que registres en el sistema. Nosotros actuamos como encargados del tratamiento y los protegemos con las mismas medidas que aplicamos a tus datos de cuenta.",
  },
  {
    titulo: "Seguridad",
    cuerpo:
      "Aplicamos cifrado en tránsito, control de acceso por roles y organización, bitácora de auditoría y respaldos. Las contraseñas se almacenan con funciones de derivación seguras; nunca en texto plano.",
  },
  {
    titulo: "Conservación",
    cuerpo:
      "Conservamos los datos mientras la cuenta esté activa o en solo lectura. Puedes solicitar la eliminación definitiva de tu organización escribiendo a soporte; procesamos la baja con un periodo de gracia para exportar tu información.",
  },
  {
    titulo: "Tus derechos (ARCO)",
    cuerpo:
      "Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiendo a soporte@beautypos.app. Respondemos en los plazos previstos por la legislación mexicana aplicable.",
  },
];

export default function PrivacidadPage() {
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
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">Aviso de privacidad</h1>
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
