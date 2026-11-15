"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { StudentAvatar } from "@/components/docente/student-avatar";
import { markAllPresent, saveAttendance } from "@/lib/actions/notas";
import type { AttendanceStatus } from "@/lib/supabase/types";

const OPTIONS: { value: AttendanceStatus; label: string; short: string; active: string }[] = [
  { value: "presente", label: "Presente", short: "P", active: "bg-brand-success text-white border-brand-success" },
  { value: "tarde", label: "Tarde", short: "T", active: "bg-amber-500 text-white border-amber-500" },
  { value: "excusa", label: "Excusa", short: "E", active: "bg-sky-600 text-white border-sky-600" },
  { value: "falta", label: "Falta", short: "F", active: "bg-brand-danger text-white border-brand-danger" },
];

type Row = { enrollmentId: string; name: string; photoUrl: string | null; status: AttendanceStatus | null };

/** Lista del día: un toque por estudiante (tocar otra vez el mismo estado lo quita). */
export function AttendanceList({
  subjectId,
  date,
  rows,
  readOnly,
}: {
  subjectId: string;
  date: string;
  rows: Row[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<Record<string, AttendanceStatus | null>>(
    Object.fromEntries(rows.map((r) => [r.enrollmentId, r.status]))
  );
  const [error, setError] = React.useState<string | null>(null);
  const [bulk, startBulk] = React.useTransition();

  async function choose(enrollmentId: string, value: AttendanceStatus) {
    const previous = state[enrollmentId] ?? null;
    const next = previous === value ? null : value;
    setState((s) => ({ ...s, [enrollmentId]: next }));
    setError(null);
    const result = await saveAttendance(subjectId, enrollmentId, date, next);
    if (result.error) {
      setState((s) => ({ ...s, [enrollmentId]: previous }));
      setError(result.error);
    }
  }

  const counts = OPTIONS.map((o) => ({ ...o, n: Object.values(state).filter((v) => v === o.value).length }));
  const pending = rows.filter((r) => !state[r.enrollmentId]).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {counts.map((c) => (
          <span key={c.value} className="rounded-full bg-black/5 px-3 py-1">
            {c.label}: <strong>{c.n}</strong>
          </span>
        ))}
        <span className="rounded-full bg-black/5 px-3 py-1">
          Sin marcar: <strong>{pending}</strong>
        </span>
        {!readOnly && pending > 0 && (
          <button
            disabled={bulk}
            onClick={() =>
              startBulk(async () => {
                const result = await markAllPresent(
                  subjectId,
                  date,
                  rows.map((r) => r.enrollmentId)
                );
                if (result.error) setError(result.error);
                else {
                  setState((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v ?? "presente"])));
                  router.refresh();
                }
              })
            }
            className="ml-auto h-9 rounded-[var(--radius-brand-sm)] border border-brand-border px-3 text-sm font-medium hover:bg-black/5 disabled:opacity-50"
          >
            Marcar a todos presentes
          </button>
        )}
      </div>
      {error && <p className="text-sm text-brand-danger">{error}</p>}

      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.enrollmentId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <StudentAvatar name={r.name} url={r.photoUrl} size={44} />
              <span className="truncate text-sm font-medium text-brand-ink">{r.name}</span>
            </div>
            <div className="flex gap-1.5">
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  disabled={readOnly}
                  onClick={() => choose(r.enrollmentId, o.value)}
                  aria-label={`${o.label}: ${r.name}`}
                  aria-pressed={state[r.enrollmentId] === o.value}
                  className={`h-10 min-w-11 rounded-[var(--radius-brand-sm)] border px-3 text-sm font-semibold transition-colors disabled:opacity-60 ${
                    state[r.enrollmentId] === o.value ? o.active : "border-brand-border bg-white text-brand-muted hover:bg-black/5"
                  }`}
                >
                  <span className="sm:hidden">{o.short}</span>
                  <span className="hidden sm:inline">{o.label}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
