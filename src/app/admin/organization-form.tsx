"use client";

import { Building2, CheckCircle2, Plus } from "lucide-react";
import { useActionState } from "react";

import { createOrganization } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export function OrganizationForm() {
  const [state, formAction, isPending] = useActionState(createOrganization, {});

  return (
    <form action={formAction} className="rounded-2xl border border-[#eadfd8] bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#f8eee8] text-[#a76348]">
          <Building2 className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold">Crear organización</h2>
          <p className="mt-1 text-sm leading-6 text-[#81746c]">Registra el negocio y su primera sucursal.</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 sm:col-span-2">
          <span className="text-sm font-medium">Nombre del negocio</span>
          <input className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" name="nombre" placeholder="Casa Magnolia" required />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Identificador</span>
          <input className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" name="slug" placeholder="casa-magnolia" required />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Nombre de sucursal</span>
          <input className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm outline-none focus:border-[#b8795d]" name="sucursalNombre" placeholder="Sucursal principal" required />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium">Clave de sucursal</span>
          <input className="h-10 w-full rounded-xl border border-[#e3d9d1] bg-[#fffdfb] px-3 text-sm uppercase outline-none focus:border-[#b8795d]" minLength={1} name="sucursalClave" placeholder="MATRIZ" required />
        </label>
      </div>

      {state.error ? (
        <p className="mt-4 rounded-xl border border-[#edc8bd] bg-[#fff3ef] px-4 py-3 text-sm text-[#a34e3b]" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="mt-4 flex items-center gap-2 rounded-xl border border-[#cce5d2] bg-[#f1faf3] px-4 py-3 text-sm text-[#3d7b50]" role="status">
          <CheckCircle2 className="size-4" /> Organización creada correctamente.
        </p>
      ) : null}

      <Button className="mt-6 rounded-xl bg-[#2c2522] text-[#fffaf5] hover:bg-[#463a34]" disabled={isPending} type="submit">
        <Plus className="size-4" />
        {isPending ? "Creando..." : "Crear organización"}
      </Button>
    </form>
  );
}
