"use client";

import { useState, type ReactNode } from "react";

type FormTab = { id: string; label: string; content: ReactNode };

export function FormTabs({ tabs }: { tabs: FormTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-[#eee8e3]" role="tablist">
        {tabs.map((tab) => (
          <button
            aria-controls={`panel-${tab.id}`}
            aria-selected={tab.id === active}
            className={tab.id === active ? "border-b-2 border-[#8a5140] px-3 py-3 text-sm font-semibold text-[#8a5140]" : "border-b-2 border-transparent px-3 py-3 text-sm font-medium text-[#625b55] hover:text-[#8a5140]"}
            id={`tab-${tab.id}`}
            key={tab.id}
            onClick={() => setActive(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-5">
        {tabs.map((tab) => (
          <div aria-hidden={tab.id !== active} aria-labelledby={`tab-${tab.id}`} hidden={tab.id !== active} id={`panel-${tab.id}`} key={tab.id} role="tabpanel">
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
