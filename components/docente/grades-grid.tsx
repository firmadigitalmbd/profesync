"use client";

import * as React from "react";

import { StudentAvatar } from "@/components/docente/student-avatar";
import { saveGrade } from "@/lib/actions/notas";
import { periodGrade } from "@/lib/grades";

type GridActivity = { id: string; name: string; weight: number };
type GridStudent = { enrollmentId: string; name: string; photoUrl: string | null };

/**
 * Planilla de notas: una fila por estudiante, una columna por actividad.
 * Cada nota se guarda sola al salir de la casilla y la nota del periodo se
 * recalcula al instante. Acepta coma o punto decimal.
 */
export function GradesGrid({
  students,
  activities,
  initial,
  min,
  max,
  pass,
  readOnly,
}: {
  students: GridStudent[];
  activities: GridActivity[];
  /** clave `${enrollmentId}:${activityId}` → nota */
  initial: Record<string, number>;
  min: number;
  max: number;
  pass: number;
  readOnly: boolean;
}) {
  const [values, setValues] = React.useState<Record<string, number>>(initial);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});

  async function commit(enrollmentId: string, activityId: string) {
    const key = `${enrollmentId}:${activityId}`;
    const draft = drafts[key];
    if (draft === undefined) return;

    const clean = draft.trim().replace(",", ".");
    const parsed = clean === "" ? null : Number(clean);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < min || parsed > max)) {
      setErrors((e) => ({ ...e, [key]: `Entre ${min} y ${max}` }));
      return;
    }
    if ((parsed ?? undefined) === values[key]) {
      setDrafts(({ [key]: _omit, ...rest }) => rest);
      return;
    }

    setErrors(({ [key]: _omit, ...rest }) => rest);
    setSaving((s) => ({ ...s, [key]: true }));
    const result = await saveGrade(activityId, enrollmentId, parsed);
    setSaving(({ [key]: _omit, ...rest }) => rest);

    if (result.error) {
      setErrors((e) => ({ ...e, [key]: result.error! }));
      return;
    }
    setValues((v) => {
      const next = { ...v };
      if (parsed === null) delete next[key];
      else next[key] = parsed;
      return next;
    });
    setDrafts(({ [key]: _omit, ...rest }) => rest);
  }

  if (activities.length === 0) {
    return <p className="text-sm text-brand-muted">Crea la primera actividad para empezar a calificar.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-brand-border bg-black/5 text-left">
            <th className="sticky left-0 bg-[#ececee] px-3 py-2 font-medium">Estudiante</th>
            {activities.map((a) => (
              <th key={a.id} className="px-2 py-2 text-center font-medium">
                <span className="block max-w-[110px] truncate" title={a.name}>
                  {a.name}
                </span>
                <span className="text-xs font-normal text-brand-muted">{a.weight}%</span>
              </th>
            ))}
            <th className="px-3 py-2 text-center font-medium">Periodo</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => {
            const own = new Map<string, number>();
            activities.forEach((a) => {
              const v = values[`${s.enrollmentId}:${a.id}`];
              if (v !== undefined) own.set(a.id, v);
            });
            const result = periodGrade(activities, own);
            return (
              <tr key={s.enrollmentId} className="border-b border-brand-border last:border-0">
                <td className="sticky left-0 bg-white px-3 py-2">
                  <div className="flex items-center gap-2">
                    <StudentAvatar name={s.name} url={s.photoUrl} size={32} />
                    <span className="max-w-[160px] truncate">{s.name}</span>
                  </div>
                </td>
                {activities.map((a) => {
                  const key = `${s.enrollmentId}:${a.id}`;
                  const shown = drafts[key] ?? (values[key] !== undefined ? String(values[key]) : "");
                  const low = values[key] !== undefined && values[key] < pass;
                  return (
                    <td key={a.id} className="px-1.5 py-1.5 text-center">
                      <input
                        value={shown}
                        disabled={readOnly}
                        inputMode="decimal"
                        aria-label={`${s.name} – ${a.name}`}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                        onBlur={() => commit(s.enrollmentId, a.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className={`h-9 w-16 rounded border bg-white px-1 text-center focus:outline-none focus:ring-2 focus:ring-brand ${
                          errors[key] ? "border-brand-danger" : "border-brand-border"
                        } ${low ? "text-brand-danger" : ""} ${saving[key] ? "opacity-60" : ""}`}
                      />
                      {errors[key] && <p className="mt-0.5 max-w-[90px] text-[10px] leading-tight text-brand-danger">{errors[key]}</p>}
                    </td>
                  );
                })}
                <td
                  className={`px-3 py-2 text-center font-semibold ${
                    result.value !== null && result.value < pass ? "text-brand-danger" : "text-brand-ink"
                  }`}
                >
                  {result.value ?? "—"}
                  {result.value !== null && !result.complete && (
                    <span className="block text-[10px] font-normal text-brand-muted">parcial</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
