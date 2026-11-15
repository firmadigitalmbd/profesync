"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClasses } from "@/components/action-form";
import { createClient } from "@/lib/supabase/client";
import { getWithdrawalReport, saveWithdrawalReportPath, withdrawEnrollment } from "@/lib/actions/docente";
import { buildWithdrawalPdf } from "@/lib/retiro-pdf";
import type { WithdrawalReport } from "@/lib/retiro-data";

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Retiro del estudiante: motivo, fecha y nota; al confirmar genera, descarga y guarda el informe PDF. */
export function WithdrawForm({
  enrollmentId,
  studentId,
  teacherId,
  reasons,
}: {
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  reasons: readonly string[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!window.confirm("¿Retirar al estudiante de este curso? Sus notas y faltas se conservan.")) return;
    setPending(true);
    setError(null);
    setNotice(null);

    const result = await withdrawEnrollment(enrollmentId, studentId, {
      reason: String(form.get("reason") ?? ""),
      date: String(form.get("date") ?? ""),
      note: String(form.get("note") ?? ""),
    });
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }

    // El retiro ya quedó hecho; el informe es un extra que no debe bloquearlo.
    try {
      if (result.report) {
        const file = await buildWithdrawalPdf(result.report);
        downloadFile(file);
        const path = `${teacherId}/retiros/${enrollmentId}.pdf`;
        const { error: uploadError } = await createClient()
          .storage.from("media")
          .upload(path, file, { contentType: "application/pdf", upsert: true });
        if (!uploadError) await saveWithdrawalReportPath(enrollmentId, studentId, path);
        else setNotice("Retirado. El informe se descargó, pero no se pudo guardar una copia en la nube.");
      }
    } catch {
      setNotice("Estudiante retirado, pero no se pudo generar el informe PDF. Puedes generarlo desde su matrícula.");
    }
    setPending(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Retirar
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-2 flex w-full flex-col gap-3 rounded-[var(--radius-brand-sm)] border border-brand-border bg-white p-3"
    >
      <p className="text-sm font-medium text-brand-ink">Retiro del estudiante</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Motivo">
          <select name="reason" required defaultValue="" className={selectClasses}>
            <option value="" disabled>
              Elige un motivo…
            </option>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha del retiro">
          <Input name="date" type="date" defaultValue={today} max={today} required />
        </Field>
      </div>
      <Field label="Nota (opcional)">
        <textarea
          name="note"
          rows={2}
          className="w-full rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </Field>
      <p className="text-xs text-brand-muted">
        Al confirmar se genera un informe PDF con sus notas, faltas (con fechas) y observaciones hasta hoy; se descarga y
        queda guardado en su matrícula.
      </p>
      {error && (
        <p className="rounded-[var(--radius-brand-sm)] bg-brand-danger/10 px-3 py-2 text-sm text-brand-danger">{error}</p>
      )}
      {notice && <p className="text-sm text-brand-muted">{notice}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirmar retiro
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Descarga el informe de retiro: el PDF guardado o, si no existe, uno nuevo armado con los datos conservados. */
export function WithdrawalReportButton({ enrollmentId }: { enrollmentId: string }) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function download() {
    setPending(true);
    setError(null);
    try {
      const result = await getWithdrawalReport(enrollmentId);
      if (result.error) {
        setError(result.error);
      } else if (result.url) {
        window.open(result.url, "_blank", "noopener");
      } else if (result.report) {
        downloadFile(await buildWithdrawalPdf(result.report as WithdrawalReport));
      }
    } catch {
      setError("No se pudo generar el informe");
    }
    setPending(false);
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={download}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Informe de retiro
      </Button>
      {error && <span className="text-xs text-brand-danger">{error}</span>}
    </span>
  );
}
