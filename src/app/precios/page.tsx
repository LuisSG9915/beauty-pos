import Link from "next/link";

import { PreciosPlanes, type PlanPrecioCard } from "@/app/precios/precios-planes";
import { BrandWordmark } from "@/components/brand-mark";
import { TelemetriaPing } from "@/components/telemetria-ping";
import {
  CAPACIDADES,
  PLANES_CATALOGO,
  planCatalogoPorClave,
  type CapacidadClave,
} from "@/modules/billing/capacidades";
import { getPlanesActivos } from "@/modules/billing/queries";
import { TRIAL_DIAS } from "@/modules/billing/service";

export const metadata = { title: "Planes y precios" };

export const dynamic = "force-dynamic";

type PlanCard = PlanPrecioCard;

/** Funciones base de todos los planes (todo lo demás son capacidades del catálogo). */
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

  if (input.clave === "esencial") return [...BASE_ESENCIAL, ...caps, ...limite];
  if (input.clave === "crecimiento") {
    return [
      "Todo lo de Esencial",
      ...caps.filter((c) => !CAPACIDADES_ESENCIAL_NOMBRES.has(c)),
      ...limite,
    ];
  }
  return ["Todo lo de Crecimiento", ...caps.filter((c) => !CAPACIDADES_CRECIMIENTO_NOMBRES.has(c)), ...limite];
}

const CAPACIDADES_ESENCIAL_NOMBRES = new Set(
  (PLANES_CATALOGO.find((p) => p.clave === "esencial")?.capacidades ?? []).map(
    (c) => CAPACIDADES[c].nombre,
  ),
);

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
  precioListaMensual: p.precioListaMensual,
  precioListaAnual: p.precioListaAnual,
  precioListaSucursalExtra: p.precioListaSucursalExtra,
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
    return rows.map((row) => {
      const lista = planCatalogoPorClave(row.clave);
      return {
        clave: row.clave,
        nombre: row.nombre,
        descripcion: row.descripcion ?? "",
        precioMensual: row.precioMensual,
        precioAnual: row.precioAnual,
        precioListaMensual: lista?.precioListaMensual ?? null,
        precioListaAnual: lista?.precioListaAnual ?? null,
        precioListaSucursalExtra: lista?.precioListaSucursalExtra ?? null,
        sucursalesIncluidas: row.sucursalesIncluidas,
        precioSucursalExtra: row.precioSucursalExtra,
        moneda: row.moneda,
        destacado: row.recomendado,
        maxSucursales: row.maxSucursales,
        beneficios: beneficiosPlan(row),
      };
    });
  } catch {
    return planesFallback;
  }
}

export default async function PreciosPage() {
  const lista = await cargarPlanes();

  return (
    <main className="min-h-screen bg-[#f9f8f9] text-[#272328]">
      <TelemetriaPing origen="precios" />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 lg:px-10">
        <Link className="inline-flex rounded-lg outline-offset-4" href="/">
          <BrandWordmark markSize={40} withDescriptor />
        </Link>
        <Link
          className="inline-flex h-8 items-center rounded-lg border border-[#d8d3d9] bg-white px-4 text-sm font-medium transition-colors hover:bg-[#f2f0f2]"
          href="/login"
        >
          Iniciar sesión
        </Link>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 pb-8 pt-10 text-center lg:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#7a5c88]">
          Planes simples
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl font-serif text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          Un precio por tu negocio.{" "}
          <span className="italic text-[#6f4b7d]">No por cada persona del equipo.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#6d6271]">
          Prueba {TRIAL_DIAS} días gratis, sin tarjeta. Registra tu salón, trabaja
          con datos reales durante la prueba y, si te convence, conserva todo al
          contratar. Nada se borra.
        </p>
        <p className="mx-auto mt-5 w-fit rounded-full border border-[#e3dce6] bg-[#f2ecf4] px-4 py-2 text-sm font-medium text-[#6f4b7d]">
          Precio fundador para los primeros 100 negocios: tu tarifa queda
          protegida mientras tu suscripción esté activa.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16 lg:px-10">
        <PreciosPlanes planes={lista} />
        <p className="mt-6 text-center text-sm text-[#6d6271]">
          Todos los planes son por negocio: tu equipo entra en el límite de
          usuarios de cada plan, sin costo por colaborador ni comisión por
          cliente nuevo.
        </p>
      </section>

      <section className="border-t border-[#e8e4ea] bg-white/70">
        <div className="mx-auto w-full max-w-4xl space-y-6 px-6 py-12 lg:px-10">
          <h2 className="text-2xl font-semibold tracking-tight">Preguntas frecuentes</h2>
          <div className="space-y-5 text-sm leading-6 text-[#574e5a]">
            <div>
              <p className="font-semibold text-[#272328]">¿Por qué cobran por negocio y no por persona?</p>
              <p className="mt-1">
                Otras plataformas cobran por cada miembro del equipo disponible
                para reservar: un salón de 5 personas puede terminar pagando más
                del doble que una estética individual. En Melena el precio es por
                negocio — tu equipo entra en el límite de usuarios del plan.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#272328]">¿Qué es el precio fundador?</p>
              <p className="mt-1">
                Es una tarifa de lanzamiento para los primeros 100 negocios que
                contraten. Si mantienes tu suscripción activa conservas ese precio
                aunque la lista suba después; si cancelas y regresas, contratas al
                precio vigente en ese momento.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#272328]">¿Cómo funciona el precio por sucursal?</p>
              <p className="mt-1">
                Cada plan incluye sucursales en su precio base: Esencial 1,
                Crecimiento hasta 2 y Profesional 3 — el plan para cadenas se
                contrata a partir de la tercera sucursal y cada adicional suma un
                precio fijo mensual. El pago anual equivale a 10 mensualidades.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#272328]">¿Melena cobra comisión por mis ventas o clientes nuevos?</p>
              <p className="mt-1">
                No. No cobramos porcentaje sobre tus ventas ni tarifa por cliente
                nuevo que llegue a tu agenda. Lo que vendes es tuyo.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#272328]">¿Qué pasa cuando termina la prueba?</p>
              <p className="mt-1">
                Tu cuenta pasa a solo lectura: puedes consultar toda tu información,
                pero no registrar cambios hasta reactivar tu plan. Tus datos se
                conservan intactos.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#272328]">¿Pierdo mis datos si no contrato de inmediato?</p>
              <p className="mt-1">
                No. Clientes, ventas, agenda y configuración permanecen guardados y
                listos para seguir usándose cuando actives tu suscripción.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#272328]">¿Cómo pago mi suscripción?</p>
              <p className="mt-1">
                Aceptamos transferencia y tarjeta. Escríbenos desde la sección de
                Ayuda dentro del sistema y activamos tu plan el mismo día.
              </p>
            </div>
            <div>
              <p className="font-semibold text-[#272328]">¿Emiten facturas fiscales (CFDI)?</p>
              <p className="mt-1">
                El sistema genera comprobantes internos de tus ventas. La emisión de
                CFDI con validez fiscal estará disponible en una etapa posterior.
              </p>
            </div>
          </div>
          <p className="pt-2 text-center text-sm text-[#675d6a]">
            ¿Dudas?{" "}
            <Link className="font-semibold text-[#724b7f] hover:text-[#7a4c89]" href="/registro">
              Crea tu cuenta gratis
            </Link>{" "}
            y descúbrelo por dentro.
          </p>
        </div>
      </section>
    </main>
  );
}
