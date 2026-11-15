"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Result = { error?: string; success?: string } | void;

/**
 * Formulario genérico ligado a una server action: muestra error/éxito,
 * deshabilita el botón mientras guarda y limpia los campos al terminar bien.
 */
export function ActionForm({
  action,
  submitLabel,
  className,
  resetOnSuccess = true,
  children,
}: {
  action: (prev: Result, formData: FormData) => Promise<Result>;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  children: React.ReactNode;
}) {
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = React.useActionState(action, undefined);

  React.useEffect(() => {
    if (state?.success && resetOnSuccess) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className={cn("flex flex-col gap-3", className)}>
      {children}
      {state?.error && (
        <p className="rounded-[var(--radius-brand-sm)] bg-brand-danger/10 px-3 py-2 text-sm text-brand-danger">
          {state.error}
        </p>
      )}
      {state?.success && <p className="text-sm text-brand-success">{state.success}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm font-medium text-brand-ink", className)}>
      {label}
      {children}
    </label>
  );
}

export const selectClasses =
  "flex h-10 w-full rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 py-2 text-sm text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
