"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-brand-sm)] bg-black px-4 text-sm font-medium text-white"
    >
      <Printer className="h-4 w-4" />
      Imprimir / PDF
    </button>
  );
}
