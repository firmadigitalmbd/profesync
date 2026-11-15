"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetTeacherPassword } from "@/lib/actions/superadmin";

export function ResetPasswordForm({ teacherId }: { teacherId: string }) {
  const [state, action, pending] = React.useActionState(resetTeacherPassword.bind(null, teacherId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <Input name="password" type="password" placeholder="Nueva contraseña" autoComplete="new-password" required />
      <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
        Cambiar contraseña
      </Button>
      {state?.error && <p className="text-sm text-brand-danger">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-success">{state.success}</p>}
    </form>
  );
}
