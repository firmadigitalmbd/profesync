"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Profile } from "@/lib/supabase/types";

type Result = { error?: string; success?: string } | void;
type Action = (prev: Result, formData: FormData) => Promise<Result>;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Formulario para crear (sin `teacher`) o editar un docente. */
export function TeacherForm({ action, teacher }: { action: Action; teacher?: Profile }) {
  const [state, formAction, pending] = React.useActionState(action, undefined);
  const editing = !!teacher;

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombre completo">
        <Input name="fullName" defaultValue={teacher?.full_name} required />
      </Field>
      <Field label="WhatsApp / teléfono (opcional)">
        <Input name="phone" defaultValue={teacher?.phone ?? ""} />
      </Field>

      {!editing && (
        <>
          <Field label="Usuario (para iniciar sesión)">
            <Input name="username" autoComplete="off" required />
          </Field>
          <Field label="Contraseña inicial">
            <Input name="password" type="password" autoComplete="new-password" required />
          </Field>
        </>
      )}

      <Field label="Plan vence el (vacío = sin vencimiento)">
        <Input name="planExpiresAt" type="date" defaultValue={teacher?.plan_expires_at ?? ""} />
      </Field>
      <Field label="Máx. instituciones">
        <Input name="maxInstitutions" type="number" min={0} defaultValue={teacher?.max_institutions ?? 1} required />
      </Field>
      <Field label="Máx. cursos">
        <Input name="maxCourses" type="number" min={0} defaultValue={teacher?.max_courses ?? 10} required />
      </Field>
      <Field label="Máx. estudiantes">
        <Input name="maxStudents" type="number" min={0} defaultValue={teacher?.max_students ?? 200} required />
      </Field>

      {editing && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="isActive" defaultChecked={teacher.is_active} className="h-4 w-4" />
          Cuenta activa (si la desactiva, queda en solo lectura)
        </label>
      )}

      <div className="flex flex-col gap-2 sm:col-span-2">
        {state?.error && (
          <p className="rounded-[var(--radius-brand-sm)] bg-brand-danger/10 px-3 py-2 text-sm text-brand-danger">
            {state.error}
          </p>
        )}
        {state?.success && <p className="text-sm text-brand-success">{state.success}</p>}
        <Button type="submit" disabled={pending} className="self-start">
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Guardar cambios" : "Crear docente"}
        </Button>
      </div>
    </form>
  );
}
