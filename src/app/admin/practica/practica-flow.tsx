"use client";

import {
  ArrowLeft,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock,
  DollarSign,
  FlaskConical,
  Plus,
  Printer,
  ReceiptText,
  RotateCcw,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ServicioEjemplo {
  id: string;
  nombre: string;
  duracion: number;
  precio: number;
  categoria: string;
}

interface ProductoEjemplo {
  id: string;
  nombre: string;
  precio: number;
}

const SERVICIOS_EJEMPLO: ServicioEjemplo[] = [
  { id: "s1", nombre: "Corte y peinado estilizado", duracion: 50, precio: 380, categoria: "Cabello" },
  { id: "s2", nombre: "Balayage & iluminación", duracion: 120, precio: 950, categoria: "Color" },
  { id: "s3", nombre: "Manicura rusa con esmaltado", duracion: 45, precio: 290, categoria: "Uñas" },
  { id: "s4", nombre: "Limpieza facial hidratante", duracion: 60, precio: 450, categoria: "Facial" },
];

const PRODUCTOS_EJEMPLO: ProductoEjemplo[] = [
  { id: "p1", nombre: "Shampoo Matizador Profesional (300ml)", precio: 240 },
  { id: "p2", nombre: "Óleo Reestructurante de Argán (100ml)", precio: 190 },
];

const ESPECIALISTAS = [
  { id: "e1", nombre: "Ana Martínez", rol: "Estilista principal" },
  { id: "e2", nombre: "Carlos Morales", rol: "Colorista" },
  { id: "e3", nombre: "Valeria Ríos", rol: "Especialista en uñas" },
];

const HORAS_DISPONIBLES = ["09:30", "11:30", "14:00", "16:30"] as const;
const CLIENTES_PRESET = ["Camila Torres", "María López", "Sofía Morales", "Valentina Ortiz"];
const MEDIOS_PAGO = [
  { id: "efectivo", nombre: "Efectivo", esEfectivo: true },
  { id: "tarjeta", nombre: "Tarjeta (crédito/débito)", esEfectivo: false },
  { id: "transferencia", nombre: "Transferencia bancaria", esEfectivo: false },
];

const PASOS = [
  "Inducción",
  "Agenda",
  "Nueva cita",
  "En salón",
  "Caja y cobro",
  "Ticket final",
] as const;

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function PracticaFlow({
  ayudaHref,
  agendaHref,
  posHref,
}: {
  ayudaHref: string;
  agendaHref?: string;
  posHref?: string;
}) {
  const [paso, setPaso] = useState<number>(0);

  // Estado del simulador en memoria
  const [clienteNombre, setClienteNombre] = useState<string>("Camila Torres");
  const [servicioIdx, setServicioIdx] = useState<number>(0);
  const [especialistaIdx, setEspecialistaIdx] = useState<number>(0);
  const [horaSeleccionada, setHoraSeleccionada] = useState<string>("11:30");
  const [productoAgregado, setProductoAgregado] = useState<boolean>(false);
  const [productoIdx, setProductoIdx] = useState<number>(0);
  const [propinaPct, setPropinaPct] = useState<number>(10);
  const [medioPagoId, setMedioPagoId] = useState<string>("efectivo");
  const [montoEntregado, setMontoEntregado] = useState<string>("500");
  const [vistaImpresion, setVistaImpresion] = useState<boolean>(false);

  const servicioActual = SERVICIOS_EJEMPLO[servicioIdx];
  const especialistaActual = ESPECIALISTAS[especialistaIdx];
  const productoActual = productoAgregado ? PRODUCTOS_EJEMPLO[productoIdx] : null;

  const subtotal = servicioActual.precio + (productoActual ? productoActual.precio : 0);
  const montoPropina = Math.round((subtotal * propinaPct) / 100);
  const total = subtotal + montoPropina;

  const entregadoNum = Number(montoEntregado) || 0;
  const cambio = Math.max(0, entregadoNum - total);

  const reiniciar = () => {
    setPaso(0);
    setClienteNombre("Camila Torres");
    setServicioIdx(0);
    setEspecialistaIdx(0);
    setHoraSeleccionada("11:30");
    setProductoAgregado(false);
    setProductoIdx(0);
    setPropinaPct(10);
    setMedioPagoId("efectivo");
    setMontoEntregado("500");
    setVistaImpresion(false);
  };

  return (
    <div className="space-y-6">
      {/* Banner de protección y seguridad en memoria */}
      <div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-5 py-4 text-warning-soft-foreground shadow-xs"
        role="status"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/20 text-warning">
            <FlaskConical aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Simulador interactivo 100% en memoria</p>
            <p className="text-xs text-muted-foreground">
              Todo lo que hagas aquí se ejecuta en tu navegador. Tus ventas reales, contabilidad, citas e inventarios están completamente a salvo.
            </p>
          </div>
        </div>
        <Button
          className="shrink-0 text-xs"
          onClick={reiniciar}
          size="sm"
          type="button"
          variant="outline"
        >
          <RotateCcw className="size-3.5 mr-1" />
          Reiniciar prueba
        </Button>
      </div>

      {/* Indicador de progreso de los pasos */}
      <nav aria-label="Progreso de la práctica">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {PASOS.map((nombre, index) => {
            const esActual = index === paso;
            const esPasado = index < paso;
            return (
              <li
                aria-current={esActual ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2.5 text-xs transition-colors",
                  esActual
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : esPasado
                      ? "border-success/30 bg-success-soft/50 text-foreground"
                      : "border-border bg-card/60 text-muted-foreground",
                )}
                key={nombre}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                    esActual
                      ? "bg-primary text-primary-foreground"
                      : esPasado
                        ? "bg-success text-success-foreground"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {esPasado ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="truncate">{nombre}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Contenedor principal del simulador */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        {/* PASO 0: INDUCCIÓN */}
        {paso === 0 && (
          <div className="max-w-2xl space-y-5">
            <div className="flex items-center gap-3 text-primary">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </span>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  Entrenamiento rápido para nuevo personal
                </h2>
                <p className="text-sm text-muted-foreground">
                  Aprende el ciclo de trabajo diario del salón en menos de 2 minutos.
                </p>
              </div>
            </div>

            <p className="text-sm leading-6 text-muted-foreground">
              Como cajero o recepcionista, atenderás clientas siguiendo 4 pasos clave:
              ver los espacios en la agenda, registrar su cita, pasarla a caja cuando termine su servicio y emitir su ticket digital con cambio calculado.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted/40 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">1. Agenda</p>
                <p className="mt-1 text-xs text-muted-foreground">Elige un espacio libre y asigna estilista.</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">2. Cobro en caja</p>
                <p className="mt-1 text-xs text-muted-foreground">Agrega productos sugeridos y propina.</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">3. Ticket</p>
                <p className="mt-1 text-xs text-muted-foreground">Calcula el cambio y emite el recibo final.</p>
              </div>
            </div>

            <div className="pt-2">
              <Button
                className="rounded-xl"
                data-action-clave="1"
                data-action-id="practica.iniciar"
                onClick={() => setPaso(1)}
                size="lg"
                type="button"
              >
                Comenzar práctica interactiva
                <ChevronRight className="size-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 1: AGENDA DE EJEMPLO */}
        {paso === 1 && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <CalendarCheck className="size-5 text-primary" />
                  Agenda del día (Simulador)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Martes · Haz clic en cualquier espacio libre para agendar la cita de prueba.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1 text-success">
                  <span className="size-2 rounded-full bg-success" /> Ocupada
                </span>
                <span className="flex items-center gap-1 text-primary">
                  <span className="size-2 rounded-full bg-primary" /> Disponible para agendar
                </span>
              </div>
            </div>

            <div className="space-y-2.5">
              {/* Cita fija ocupada 1 */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">09:00</span>
                  <div>
                    <p className="font-medium text-foreground">Sofía Morales · Balayage & Brushing</p>
                    <p className="text-xs text-muted-foreground">Atiende: Carlos Morales (Colorista)</p>
                  </div>
                </div>
                <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                  En proceso
                </span>
              </div>

              {/* Hueco libre 1 */}
              <button
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border border-dashed px-4 py-3 text-sm transition-all hover:border-primary hover:bg-primary/5",
                  horaSeleccionada === "09:30" ? "border-primary bg-primary/10" : "border-border",
                )}
                onClick={() => {
                  setHoraSeleccionada("09:30");
                  setPaso(2);
                }}
                type="button"
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="font-mono text-xs font-semibold text-primary">09:30</span>
                  <div>
                    <p className="font-medium text-primary">Espacio libre · 45 minutos</p>
                    <p className="text-xs text-muted-foreground">Disponible con Ana Martínez</p>
                  </div>
                </div>
                <span className="inline-flex items-center text-xs font-semibold text-primary">
                  Agendar aquí <ChevronRight className="size-3.5 ml-1" />
                </span>
              </button>

              {/* Hueco libre 2 (Recomendado) */}
              <button
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border border-dashed px-4 py-3 text-sm transition-all hover:border-primary hover:bg-primary/5",
                  horaSeleccionada === "11:30" ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border",
                )}
                onClick={() => {
                  setHoraSeleccionada("11:30");
                  setPaso(2);
                }}
                type="button"
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="font-mono text-xs font-semibold text-primary">11:30</span>
                  <div>
                    <p className="font-medium text-foreground">Espacio libre · Recomendado para corte</p>
                    <p className="text-xs text-muted-foreground">Especialistas disponibles</p>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Agendar aquí
                </span>
              </button>

              {/* Cita fija ocupada 2 */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">13:00</span>
                  <div>
                    <p className="font-medium text-foreground">Laura Méndez · Manicura Spa</p>
                    <p className="text-xs text-muted-foreground">Atiende: Valeria Ríos (Uñas)</p>
                  </div>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Confirmada
                </span>
              </div>

              {/* Hueco libre 3 */}
              <button
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border border-dashed px-4 py-3 text-sm transition-all hover:border-primary hover:bg-primary/5",
                  horaSeleccionada === "14:00" ? "border-primary bg-primary/10" : "border-border",
                )}
                onClick={() => {
                  setHoraSeleccionada("14:00");
                  setPaso(2);
                }}
                type="button"
              >
                <div className="flex items-center gap-3 text-left">
                  <span className="font-mono text-xs font-semibold text-primary">14:00</span>
                  <div>
                    <p className="font-medium text-primary">Espacio libre · Turno tarde</p>
                    <p className="text-xs text-muted-foreground">Disponible para cualquier servicio</p>
                  </div>
                </div>
                <span className="inline-flex items-center text-xs font-semibold text-primary">
                  Agendar aquí <ChevronRight className="size-3.5 ml-1" />
                </span>
              </button>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <Button onClick={() => setPaso(0)} type="button" variant="ghost">
                <ArrowLeft className="size-4 mr-1" /> Regresar
              </Button>
              <Button onClick={() => setPaso(2)} type="button">
                Continuar con hora seleccionada ({horaSeleccionada})
                <ChevronRight className="size-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 2: FORMULARIO DE NUEVA CITA */}
        {paso === 2 && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="text-lg font-bold text-foreground">Registrar cita de prueba</h2>
              <p className="text-xs text-muted-foreground">
                Configura los datos de la cita simulada. Nota cómo el precio y duración se calculan en vivo.
              </p>
            </div>

            {/* Selector de Cliente */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <User className="size-3.5" /> Clienta de ejemplo
              </label>
              <div className="flex flex-wrap gap-2">
                {CLIENTES_PRESET.map((nombre) => (
                  <button
                    className={cn(
                      "rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                      clienteNombre === nombre
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border hover:bg-muted/50 text-foreground",
                    )}
                    key={nombre}
                    onClick={() => setClienteNombre(nombre)}
                    type="button"
                  >
                    {nombre}
                  </button>
                ))}
              </div>
              <input
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                onChange={(e) => setClienteNombre(e.target.value)}
                placeholder="O escribe otro nombre de prueba..."
                value={clienteNombre}
              />
            </div>

            {/* Selector de Servicio */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Servicio a realizar
              </label>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SERVICIOS_EJEMPLO.map((item, index) => {
                  const seleccionado = servicioIdx === index;
                  return (
                    <button
                      aria-pressed={seleccionado}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-all",
                        seleccionado
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border hover:border-foreground/30 hover:bg-muted/30",
                      )}
                      key={item.id}
                      onClick={() => setServicioIdx(index)}
                      type="button"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">{item.nombre}</span>
                        <span className="text-xs font-bold text-primary">{money.format(item.precio)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{item.categoria}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" /> {item.duracion} min
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selector de Especialista y Hora */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="size-3.5" /> Profesional asignado
                </label>
                <div className="space-y-1.5">
                  {ESPECIALISTAS.map((item, index) => (
                    <button
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                        especialistaIdx === index
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "border-border hover:bg-muted/40 text-foreground",
                      )}
                      key={item.id}
                      onClick={() => setEspecialistaIdx(index)}
                      type="button"
                    >
                      <p>{item.nombre}</p>
                      <p className="text-[10px] text-muted-foreground">{item.rol}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-3.5" /> Hora de inicio
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {HORAS_DISPONIBLES.map((hora) => (
                    <button
                      className={cn(
                        "rounded-xl border py-2.5 text-center text-xs font-semibold transition-colors",
                        horaSeleccionada === hora
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:bg-muted/40 text-foreground",
                      )}
                      key={hora}
                      onClick={() => setHoraSeleccionada(hora)}
                      type="button"
                    >
                      {hora}
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-xl bg-muted/60 p-3 text-xs space-y-1">
                  <p className="font-semibold text-foreground">Resumen de la cita:</p>
                  <p className="text-muted-foreground">
                    {clienteNombre || "Clienta"} · {horaSeleccionada} ({servicioActual.duracion} min)
                  </p>
                  <p className="font-semibold text-primary">{money.format(servicioActual.precio)}</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <Button onClick={() => setPaso(1)} type="button" variant="ghost">
                <ArrowLeft className="size-4 mr-1" /> Regresar
              </Button>
              <Button
                data-action-clave="1"
                data-action-id="practica.agendar"
                onClick={() => setPaso(3)}
                type="button"
              >
                Confirmar cita simulada
                <ChevronRight className="size-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 3: CITA EN EL SALÓN / LLEGADA */}
        {paso === 3 && (
          <div className="max-w-xl space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Cita programada con éxito</h2>
              <p className="text-xs text-muted-foreground">
                La cita quedó visible en la agenda. Cuando la clienta concluye su servicio, se transfiere al módulo de cobro.
              </p>
            </div>

            <div className="rounded-2xl border border-success/30 bg-success-soft/30 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-success/20 px-3 py-1 text-xs font-bold text-success">
                  En atención
                </span>
                <span className="font-mono text-sm font-bold text-foreground">{horaSeleccionada} hrs</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">{clienteNombre}</h3>
                <p className="text-xs text-muted-foreground">
                  {servicioActual.nombre} ({servicioActual.duracion} min)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Atendió: <strong className="text-foreground">{especialistaActual.nombre}</strong> ({especialistaActual.rol})
                </p>
              </div>
              <div className="border-t border-success/20 pt-2 flex justify-between text-sm font-semibold">
                <span>Total a cobrar</span>
                <span className="text-primary font-bold">{money.format(servicioActual.precio)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">💡 Tip de recepción:</p>
              <p>
                Al pasar a caja, puedes añadir productos de reventa (shampoo, tratamientos) o propina para el estilista en una sola transacción.
              </p>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <Button onClick={() => setPaso(2)} type="button" variant="ghost">
                <ArrowLeft className="size-4 mr-1" /> Editar cita
              </Button>
              <Button
                data-action-clave="1"
                data-action-id="practica.cobrar"
                onClick={() => setPaso(4)}
                size="lg"
                type="button"
              >
                Cobrar en caja ({money.format(servicioActual.precio)})
                <ChevronRight className="size-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 4: COBRO EN CAJA (MINI POS INTERACTIVO) */}
        {paso === 4 && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <ReceiptText className="size-5 text-primary" />
                Caja y Cobro interactivo
              </h2>
              <p className="text-xs text-muted-foreground">
                Aprende a registrar venta cruzada, propinas y el cálculo de cambio en efectivo.
              </p>
            </div>

            {/* Líneas del ticket */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Líneas del ticket</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm py-1 border-b border-border/50">
                  <div>
                    <p className="font-medium text-foreground">{servicioActual.nombre}</p>
                    <p className="text-xs text-muted-foreground">{especialistaActual.nombre}</p>
                  </div>
                  <span className="font-semibold tabular-nums">{money.format(servicioActual.precio)}</span>
                </div>

                {productoAgregado && productoActual && (
                  <div className="flex items-center justify-between text-sm py-1 border-b border-border/50 text-foreground">
                    <div className="flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-primary" />
                      <p className="font-medium">{productoActual.nombre}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{money.format(productoActual.precio)}</span>
                      <button
                        className="text-xs text-destructive hover:underline"
                        onClick={() => setProductoAgregado(false)}
                        type="button"
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Venta sugerida de producto */}
              {!productoAgregado ? (
                <div className="mt-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <p className="font-semibold text-primary">Sugerir producto de reventa (+ comisión):</p>
                    <p className="text-muted-foreground">{PRODUCTOS_EJEMPLO[0].nombre}</p>
                  </div>
                  <Button
                    onClick={() => {
                      setProductoAgregado(true);
                      setProductoIdx(0);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus className="size-3.5 mr-1" />
                    Agregar ({money.format(PRODUCTOS_EJEMPLO[0].precio)})
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Propina */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Propina para {especialistaActual.nombre}</span>
                <span className="text-primary font-bold">{money.format(montoPropina)}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {[0, 10, 15, 20].map((pct) => (
                  <button
                    className={cn(
                      "rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                      propinaPct === pct
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted text-muted-foreground",
                    )}
                    key={pct}
                    onClick={() => setPropinaPct(pct)}
                    type="button"
                  >
                    {pct === 0 ? "Sin propina" : `${pct}% (${money.format((subtotal * pct) / 100)})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Medio de Pago */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Medio de pago
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {MEDIOS_PAGO.map((medio) => (
                  <button
                    className={cn(
                      "rounded-xl border p-3 text-left transition-colors",
                      medioPagoId === medio.id
                        ? "border-primary bg-primary/10 ring-1 ring-primary text-primary font-semibold"
                        : "border-border hover:bg-muted text-foreground",
                    )}
                    key={medio.id}
                    onClick={() => setMedioPagoId(medio.id)}
                    type="button"
                  >
                    <p className="text-xs">{medio.nombre}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Calculadora de Efectivo y Cambio */}
            {medioPagoId === "efectivo" && (
              <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <DollarSign className="size-4 text-success" />
                    Calculadora de cambio (Efectivo)
                  </label>
                  <span className="text-xs text-muted-foreground">Total: {money.format(total)}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Billetes rápidos:</span>
                  {[total, 500, 1000].map((monto) => (
                    <button
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
                      key={monto}
                      onClick={() => setMontoEntregado(String(monto))}
                      type="button"
                    >
                      {monto === total ? "Exacto" : money.format(monto)}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Monto entregado por la clienta</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">$</span>
                      <input
                        className="w-full rounded-xl border border-input bg-background pl-7 pr-3 py-2 text-sm font-semibold tabular-nums"
                        inputMode="decimal"
                        onChange={(e) => setMontoEntregado(e.target.value)}
                        value={montoEntregado}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background p-3 flex flex-col justify-center">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Cambio a devolver
                    </span>
                    <span
                      className={cn(
                        "text-lg font-extrabold tabular-nums",
                        entregadoNum >= total ? "text-success" : "text-destructive",
                      )}
                    >
                      {entregadoNum >= total ? money.format(cambio) : "Monto insuficiente"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Total General */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total final a registrar</p>
                <p className="text-2xl font-extrabold text-foreground tabular-nums">{money.format(total)}</p>
              </div>
              <Button
                className="rounded-xl"
                data-action-clave="1"
                data-action-id="practica.confirmar_cobro"
                disabled={medioPagoId === "efectivo" && entregadoNum < total}
                onClick={() => setPaso(5)}
                size="lg"
                type="button"
              >
                Confirmar cobro y ver ticket
                <ChevronRight className="size-4 ml-1.5" />
              </Button>
            </div>

            <div className="pt-2 flex justify-between items-center">
              <Button onClick={() => setPaso(3)} type="button" variant="ghost">
                <ArrowLeft className="size-4 mr-1" /> Regresar a la cita
              </Button>
            </div>
          </div>
        )}

        {/* PASO 5: TICKET DIGITAL Y REPORTE EDUCATIVO */}
        {paso === 5 && (
          <div className="max-w-xl space-y-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-success/10 text-success">
                <Check className="size-6" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-foreground">¡Cobro completado con éxito!</h2>
                <p className="text-xs text-muted-foreground">
                  Comprobante digital generado en memoria. Nada se guardó en tu contabilidad real.
                </p>
              </div>
            </div>

            {/* Vista del Ticket Simulado */}
            <div
              className={cn(
                "rounded-2xl border border-border bg-card p-6 shadow-md font-mono text-xs space-y-4",
                vistaImpresion && "border-2 border-primary bg-background shadow-xl",
              )}
            >
              {/* Encabezado */}
              <div className="text-center space-y-1 border-b border-dashed border-border pb-4">
                <p className="text-base font-bold tracking-widest uppercase">MELENA SALÓN</p>
                <p className="text-[11px] text-muted-foreground">Sucursal Principal · Demostración</p>
                <p className="text-[10px] text-muted-foreground">
                  Folio: #SIM-4821 · Demo de práctica
                </p>
                <span className="inline-block rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-bold text-warning uppercase mt-1">
                  Ticket de entrenamiento
                </span>
              </div>

              {/* Datos de la clienta */}
              <div className="text-[11px] space-y-0.5">
                <p>Clienta: <strong className="font-sans">{clienteNombre}</strong></p>
                <p>Atendió: <strong className="font-sans">{especialistaActual.nombre}</strong></p>
              </div>

              {/* Detalle */}
              <div className="border-t border-b border-dashed border-border py-3 space-y-1.5">
                <div className="flex justify-between">
                  <span>1x {servicioActual.nombre}</span>
                  <span className="tabular-nums font-semibold">{money.format(servicioActual.precio)}</span>
                </div>
                {productoAgregado && productoActual && (
                  <div className="flex justify-between">
                    <span>1x {productoActual.nombre}</span>
                    <span className="tabular-nums font-semibold">{money.format(productoActual.precio)}</span>
                  </div>
                )}
                {montoPropina > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Propina ({propinaPct}%)</span>
                    <span className="tabular-nums">{money.format(montoPropina)}</span>
                  </div>
                )}
              </div>

              {/* Totales y Pago */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-sm font-bold">
                  <span>TOTAL COBRADO</span>
                  <span className="tabular-nums text-primary">{money.format(total)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground pt-1">
                  <span>Método de pago:</span>
                  <span className="uppercase">{medioPagoId}</span>
                </div>
                {medioPagoId === "efectivo" && (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Efectivo entregado:</span>
                      <span className="tabular-nums">{money.format(entregadoNum)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-success">
                      <span>Cambio devuelto:</span>
                      <span className="tabular-nums">{money.format(cambio)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="text-center pt-3 text-[10px] text-muted-foreground border-t border-dashed border-border">
                ¡Gracias por su visita!
              </div>
            </div>

            {/* Controles del Ticket */}
            <div className="flex flex-wrap gap-2.5">
              <Button
                onClick={() => setVistaImpresion(!vistaImpresion)}
                type="button"
                variant="outline"
              >
                <Printer className="size-4 mr-1.5" />
                {vistaImpresion ? "Ocultar formato térmico" : "Simular ticket térmico"}
              </Button>
              <Button onClick={reiniciar} type="button" variant="outline">
                <RotateCcw className="size-4 mr-1.5" />
                Repetir con otro servicio
              </Button>
            </div>

            {/* Caja de Logros Aprendidos */}
            <div className="rounded-2xl border border-success/30 bg-success-soft/30 p-4 text-xs space-y-2">
              <p className="font-bold text-success flex items-center gap-1.5">
                <Check className="size-4" /> ¡Felicidades! Completaste el entrenamiento
              </p>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>Buscaste y elegiste un horario disponible en la agenda.</li>
                <li>Registraste la cita asignando a la estilista correspondiente.</li>
                <li>Hiciste venta sugerida de un producto de reventa en caja.</li>
                <li>Cobraste con cálculo automático de cambio sin errores mentales.</li>
                <li>Emitiste el ticket final sin tocar datos de la empresa real.</li>
              </ul>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              {agendaHref && (
                <Button nativeButton={false} render={<Link href={agendaHref} />}>
                  Ir a la Agenda real
                </Button>
              )}
              {posHref && (
                <Button nativeButton={false} render={<Link href={posHref} />} variant="outline">
                  Ir al Punto de Venta real
                </Button>
              )}
              <Link
                className="inline-flex min-h-6 items-center text-sm font-medium text-primary hover:underline ml-auto"
                href={ayudaHref}
              >
                Volver a Ayuda
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Navegación inferior global */}
      <div className="flex items-center justify-between text-sm">
        {paso > 0 && paso < PASOS.length - 1 ? (
          <Button onClick={() => setPaso(paso - 1)} type="button" variant="ghost">
            <ArrowLeft className="size-4 mr-1" /> Paso anterior
          </Button>
        ) : <span />}
        <Link
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          href={ayudaHref}
        >
          Salir de la práctica y volver a Ayuda
        </Link>
      </div>
    </div>
  );
}
