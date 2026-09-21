"use client";

import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

export function FileDropzone({ name, accept, required }: { name: string; accept?: string; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  function setFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    if (inputRef.current) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
    }
  }

  return (
    <button className="flex min-h-28 w-full flex-col items-center justify-center rounded-xl border border-dashed border-input bg-muted/60 px-4 py-4 text-center transition-colors hover:border-primary hover:bg-accent/50" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setFile(event.dataTransfer.files[0]); }} type="button">
      <FileUp className="size-6 text-primary" />
      <span className="mt-2 text-sm font-medium text-foreground">{fileName || "Seleccionar archivo CSV"}</span>
      <span className="mt-1 text-xs text-muted-foreground">Arrastra o selecciona un archivo compatible con Excel · Máximo 5 MB</span>
      <input accept={accept} className="sr-only" name={name} onChange={(event) => setFile(event.target.files?.[0])} ref={inputRef} required={required} type="file" />
    </button>
  );
}
