"use client";

import { useActionState } from "react";

import { importClients, type ImportClientsState } from "@/app/admin/client-actions";
import { FileDropzone } from "@/components/file-dropzone";
import { Button } from "@/components/ui/button";

export function ClientImport({ organizationId }: { organizationId: string }) {
  const [state, formAction, isPending] = useActionState<ImportClientsState, FormData>(importClients, {});

  return (
    <form action={formAction}>
      <input name="organizacionId" type="hidden" value={organizationId} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#625b55]">Carga un CSV guardado desde Excel.</p>
        <div className="w-full md:max-w-md">
          <FileDropzone accept=".csv,text/csv" name="archivo" required />
        </div>
      </div>
      {state.error ? <p className="mt-3 text-sm text-destructive" role="alert">{state.error}</p> : null}
      {state.success ? <p className="mt-3 text-sm text-success" role="status">{state.success}</p> : null}
      <Button className="mt-4 rounded-xl" disabled={isPending} type="submit">
        {isPending ? "Importando…" : "Importar CSV"}
      </Button>
    </form>
  );
}
