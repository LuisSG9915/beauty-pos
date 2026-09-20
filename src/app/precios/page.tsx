import Link from "next/link";

import { PreciosPlanes, type PlanPrecioCard } from "@/app/precios/precios-planes";
import { CAPACIDADES, PLANES_CATALOGO, type CapacidadClave } from "@/modules/billing/capacidades";
import { getPlanesActivos } from "@/modules/billing/queries";
import { TRIAL_DIAS } from "@/modules/billing/service";

export const metadata = { title: "Planes y precios — Beauty POS" };

export const dynamic = "force-dynamic";

type PlanCard = PlanPrecioCard;

/** Funciones base del plan Esencial (todo lo demás son capacidades del catálogo). */
const BASE_ESENCIAL = [
  "Agenda y citas",
  "Clientes y servicios",
  "POS, caja y cortes",
  "Correcciones auditables de ventas",
  "Inventario básico",
  "Reportes básicos",
  "Guía inicial y modo práctica",
];

function beneficiosPlan(input: {
  clave: string;
  capacidades: readonly string[];
  maxSucursales: number | null;
  maxUsuarios: number | null;
}): string[] {
  const limite = [
    input.maxSucursales == null
      ? "Sucursales sin límite"
      : input.maxSucursales === 1
        ? "1 sucursal incluida"
        : `Hasta ${input.maxSucursales} sucursales incluidas`,
    input.maxUsuarios == null ? "Usuarios sin límite" : `Hasta ${input.maxUsuarios} usuarios`,
  ];
  const caps = input.capacidades.flatMap((c) => {
    const cap = CAPACIDADES[c as CapacidadClave];
    return cap ? [cap.nombre] : [];
  });

  if (input.clave === "esencial") return [...BASE_ESENCIAL, ...limite];
  if (input.clave === "crecimiento") return ["Todo lo de Esencial", ...caps, ...limite];
  return ["Todo lo de Crecimiento", ...caps.filter((c) => !CAPACIDADES_CRECIMIENTO_NOMBRES.has(c)), ...limite];
}

const CAPACIDADES_CRECIMIENTO_NOMBRES = new Set(
  (PLANES_CATALOGO.find((p) => p.clave === "crecimiento")?.capacidades ?? []).map(
    (c) => CAPACIDADES[c].nombre,
  ),
);

const planesFallback: PlanCard[] = PLANES_CATALOGO.map((p) => ({
  clave: p.clave,
  nombre: p.nombre,
  descripcion: p.descripcion,
  precioMensual: p.precioMensual,
  precioAnual: p.precioAnual,
  sucursalesIncluidas: p.sucursalesIncluidas,
  precioSucursalExtra: p.precioSucursalExtra,
  moneda: "MXN",
  destacado: p.recomendado,
  maxSucursales: p.maxSucursales,
  beneficios: beneficiosPlan(p),
}));

async function cargarPlanes(): Promise<PlanCard[]> {
  try {
    const rows = await getPlanesActivos();
    if (rows.length === 0) return planesFallback;
    return rows.map((row) => ({
      clave: row.clave,
      nombre: row.nombre,
      descripcion: row.descripcion ?? "",
      precioMensual: row.precioMensual,
      precioAnual: row.precioAnual,
      sucursalesIncluidas: row.sucursalesIncluidas,
      precioSucursalExtra: row.precioSucursalExtra,
      moneda: row.moneda,
      destacado: row.recomendado,
      maxSucursales: row.maxSucursales,
      beneficios: beneficiosPlan(row),
    }));
  } catch {
    return planesFallback;
  }
}

export default async function PreciosPage() {
  const lista = await cargarPlanes();

  return (
    <main className="min-h-screen bg-[#faf9f7] text-[#292522]">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 lg:px-10">
        <Link className="flex items-center gap-3" href="/">
          <div className="flex size-10 items-center justify-center rounded-2xl bg-[#2c2522] text-sm font-semibold text-[#f6eadf]">
            BP
          </div>
          <div>
            <p className="font-semibold tracking-tight">Beauty POS</p>
            <p className="text-xs text-[#8a7b72]">Gestión para tu belleza</p>
          </div>
        </Link>
        <Link
          className="inline-flex h-8 items-center rounded-lg border border-[#ded5ce] bg-white px-4 text-sm font-medium transition-colors hover:bg-[#f4f1ee]"
          href="/login"
        >
          Iniciar sesión
        </Link>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 pb-8 pt-10 text-center lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#ae6f54]">
          Planes simples
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Prueba {TRIAL_DIAS} días gratis. Sin tarjeta.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#74675f]">
          Registra tu salón, trabaja con datos reales durante la prueba y, si te
          convence, conserva todo al contratar. Nada se borra.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16 lg:px-10">
        <PreciosPlanes planes={lista} />
      </section>

      <section className="border-t border-[#eee6e0] bg-white/70">
        <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-12 lg:px-10">
          <h2 className="text-2xl font-semibold tracking-tight">Preguntas frecuentes</h2>
          <div className="space-y-5 text-sm leading-6 text-[#5d524b]">
            <div>
              <p className="font-semibold text-[#292522]">¿Cómo funciona el precio por sucursal?</p>
              <p className="mt-1">
                Cada plan incluye sucursales en su precio base: Esencial 1,
                Crecimiento hasta 2 y Profesional 3. En Profesional, cada
                sucursal adicional a la tercera suma un precio fijo mensual —
                el pago anual equivale a 10 mensualidades.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#292522]">¿Qué pasa cuando termina la prueba?</p>
              <p className="mt-1">
                Tu cuenta pasa a solo lectura: puedes consultar toda tu información,
                pero no registrar cambios hasta reactivar tu plan. Tus datos se
                conservan intactos.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#292522]">¿Pierdo mis datos si no contrato de inmediato?</p>
              <p className="mt-1">
                No. Clientes, ventas, agenda y configuración permanecen guardados y
                listos para seguir usándose cuando actives tu suscripción.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#292522]">¿Cómo pago mi suscripción?</p>
              <p className="mt-1">
                Aceptamos transferencia y tarjeta. Escríbenos desde la sección de
                Ayuda dentro del sistema y activamos tu plan el mismo día.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#292522]">¿Emiten facturas fiscales (CFDI)?</p>
              <p className="mt-1">
                El sistema genera comprobantes internos de tus ventas. La emisión de
                CFDI con validez fiscal estará disponible en una etapa posterior.
              </p>
            </div>
          </div>
          <p className="pt-2 text-center text-sm text-[#81746c]">
            ¿Dudas?{" "}
            <Link className="font-semibold text-[#b8795d] hover:text-[#96573f]" href="/registro">
              Crea tu cuenta gratis
            </Link>{" "}
            y descúbrelo por dentro.
          </p>
        </div>
      </section>
    </main>
  );
}
