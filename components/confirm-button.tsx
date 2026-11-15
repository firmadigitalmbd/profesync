"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button, type ButtonProps } from "@/components/ui/button";

/** Botón que pide confirmación y ejecuta una server action; muestra el error si falla. */
export function ConfirmButton({
  action,
  message,
  children,
  ...props
}: {
  action: () => Promise<{ error?: string }>;
  /** Si se omite, ejecuta la acción sin preguntar. */
  message?: string;
  children: React.ReactNode;
} & Omit<ButtonProps, "onClick">) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          if (message && !window.confirm(message)) return;
          setError(null);
          startTransition(async () => {
            const result = await action();
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        {...props}
      >
        {children}
      </Button>
      {error && <span className="max-w-xs text-xs text-brand-danger">{error}</span>}
    </span>
  );
}
