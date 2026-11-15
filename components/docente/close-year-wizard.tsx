"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClasses } from "@/components/action-form";
import { StudentAvatar } from "@/components/docente/student-avatar";
import { closeAcademicYear } from "@/lib/actions/cierre";
import type { ClosingRow } from "@/lib/cierre-data";

type Result = "aprobo" | "perdio";

export function CloseYearWizard({
  yearId,
  yearLabel,
  passGrade,
  defaultLimit,
  rows,
  nextYearLabel,
  nextCourses,
  openPeriods,
}: {
  yearId: string;
  yearLabel: string;
  passGrade: number;
  defaultLimit: number;
  rows: ClosingRow[];
  nextYearLabel: string | null;
  nextCourses: { id: string; label: string }[];
  openPeriods: number;
}) {
  const router = useRouter();
  const [limit, setLimit] = React.useState(String(defaultLimit));
  const [resultOverride, setResultOverride] = React.useState<Record<string, Result>>({});
  const [destOverride, setDestOverride] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const limitNumber = Math.max(1, Math.floor(Number(limit) || defaultLimit));

  const resolved = rows.map((row) => {
    const result: Result = resultOverride[row.enrollmentId] ?? (row.lost >= limitNumber ? "perdio" : "aprobo");
    const proposed = result === "aprobo" ? row.promoteCourseId : row.repeatCourseId;
    const dest = row.nextCourseId ? "" : (destOverride[row.enrollmentId] ?? proposed ?? "");
    return { row, result, dest };
  });

  const approved = resolved.filter((r) => r.result === "aprobo").length;
  const failed = resolved.length - approved;
  const withoutDestination = resolved.filter((r) => !r.row.nextCourseId && !r.dest).length;
  const withMissing = rows.filter((r) => r.missing > 0).length;

  const courseLabels = [...new Set(rows.map((r) => r.courseLabel))];

  async function submit() {
    const message =
      `Vas a cerrar el año ${yearLabel}.\n\n` +
      `• ${approved} aprobados y ${failed} perdidos.\n` +
      `• ${resolved.filter((r) => r.dest).length} estudiantes se matricularán en el año siguiente.\n\n` +
      `Al cerrar, las notas y la asistencia de este año quedan congeladas (solo consulta). ¿Continuar?`;
    if (!window.confirm(message)) return;
    setPending(true);
    setError(null);
    const result = await closeAcademicYear(
      yearId,
      limitNumber,
      resolved.map((r) => ({
        enrollment_id: r.row.enrollmentId,
        result: r.result,
        destination_course_id: r.dest || null,
      }))
    );
    if (result.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-4">
        <p className="text-sm font-medium text-brand-ink">Regla para perder el año</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-brand-muted">
          Pierde el año con
          <Input
            type="number"
            min={1}
            max={30}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="h-9 w-20"
            aria-label="Materias perdidas para perder el año"
          />
          o más materias con definitiva menor a {passGrade.toFixed(1)}.
        </div>
        <p className="mt-2 text-xs text-brand-muted">
          Es solo una propuesta: puedes cambiar el resultado y el curso destino de cada estudiante antes de cerrar.
        </p>
      </div>

      {openPeriods > 0 && (
        <p className="flex items-start gap-2 rounded-[var(--radius-brand-sm)] bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Hay {openPeriods} periodo(s) abierto(s). Se cerrarán automáticamente al cerrar el año.
        </p>
      )}
      {withMissing > 0 && (
        <p className="flex items-start gap-2 rounded-[var(--radius-brand-sm)] bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {withMissing} estudiante(s) tienen materias sin nota. Esas materias no cuentan como perdidas: revísalos.
        </p>
      )}
      {!nextYearLabel && (
        <p className="rounded-[var(--radius-brand-sm)] bg-black/5 px-3 py-2 text-sm text-brand-muted">
          Aún no hay año siguiente: puedes cerrar sin matricular a nadie, o prepararlo arriba para promover a los estudiantes.
        </p>
      )}

      {courseLabels.map((courseLabel) => (
        <section key={courseLabel} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-brand-ink">{courseLabel}</h3>
          {resolved
            .filter((r) => r.row.courseLabel === courseLabel)
            .map(({ row, result, dest }) => (
              <div
                key={row.enrollmentId}
                className="rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <StudentAvatar name={row.name} url={row.photoUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-brand-ink">{row.name}</p>
                    <p className={`text-xs ${row.lost > 0 ? "text-red-700" : "text-brand-muted"}`}>
                      {row.lost === 0 ? "Sin materias perdidas" : `${row.lost} materia(s) perdida(s)`}
                      {row.missing > 0 ? ` · ${row.missing} sin nota` : ""}
                    </p>
                  </div>
                  <select
                    value={result}
                    onChange={(e) => {
                      setResultOverride((s) => ({ ...s, [row.enrollmentId]: e.target.value as Result }));
                      // Al cambiar el resultado, el destino vuelve a la propuesta.
                      setDestOverride((s) => {
                        const { [row.enrollmentId]: _dropped, ...rest } = s;
                        void _dropped;
                        return rest;
                      });
                    }}
                    className={selectClasses + " w-32"}
                    aria-label={`Resultado de ${row.name}`}
                  >
                    <option value="aprobo">Aprobó</option>
                    <option value="perdio">Perdió</option>
                  </select>
                  {row.nextCourseId ? (
                    <span className="w-56 text-xs text-brand-muted">
                      Ya matriculado en el año siguiente (
                      {nextCourses.find((c) => c.id === row.nextCourseId)?.label ?? "otro curso"})
                    </span>
                  ) : (
                    <select
                      value={dest}
                      onChange={(e) => setDestOverride((s) => ({ ...s, [row.enrollmentId]: e.target.value }))}
                      disabled={nextCourses.length === 0}
                      className={selectClasses + " w-56"}
                      aria-label={`Curso del año siguiente para ${row.name}`}
                    >
                      <option value="">— No matricular —</option>
                      {nextCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {row.subjects.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-brand-dark">Ver definitivas</summary>
                    <ul className="mt-1 grid gap-x-6 text-sm sm:grid-cols-2">
                      {row.subjects.map((s) => (
                        <li key={s.name} className="flex justify-between border-b border-brand-border py-1">
                          <span>{s.name}</span>
                          <span
                            className={
                              s.final === null ? "text-brand-muted" : s.final < passGrade ? "font-medium text-red-700" : ""
                            }
                          >
                            {s.final === null ? "—" : s.final.toFixed(1)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
        </section>
      ))}

      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-3 shadow-md">
        <p className="flex-1 text-sm text-brand-ink">
          {approved} aprobados · {failed} perdidos
          {nextYearLabel ? ` · ${withoutDestination} sin matricular en ${nextYearLabel}` : ""}
        </p>
        {error && <p className="w-full text-sm text-brand-danger">{error}</p>}
        <Button type="button" disabled={pending || rows.length === 0} onClick={submit}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Cerrar el año {yearLabel}
        </Button>
      </div>
    </div>
  );
}
