"use client";

import { Tabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type FormTab = { id: string; label: string; content: ReactNode };

/**
 * Pestañas de formulario sobre Base UI Tabs: incluyen teclado
 * (flechas, Home/End) y roles ARIA correctos.
 */
export function FormTabs({
  tabs,
  defaultValue,
  className,
}: {
  tabs: FormTab[];
  defaultValue?: string;
  className?: string;
}) {
  return (
    <Tabs.Root
      className={className}
      defaultValue={defaultValue ?? tabs[0]?.id}
    >
      <Tabs.List
        aria-label="Secciones del formulario"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {tabs.map((tab) => (
          <Tabs.Tab
            className={cn(
              "-mb-px min-h-10 shrink-0 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground outline-none transition-colors select-none",
              "hover:text-primary focus-visible:text-primary",
              "data-[active]:border-primary data-[active]:font-semibold data-[active]:text-primary",
            )}
            key={tab.id}
            value={tab.id}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Panel className="pt-5" keepMounted key={tab.id} value={tab.id}>
          {tab.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
