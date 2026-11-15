import { requireProfile } from "@/lib/auth";
import { computeResults, loadSubjectContext } from "@/lib/notas-data";
import { gradeMap, periodGrade, performanceLabel } from "@/lib/grades";
import { PrintButton } from "@/components/docente/print-button";

/** Vista limpia para imprimir o guardar como PDF (Ctrl+P → Guardar como PDF). */
export default async function PrintNotasPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  await requireProfile();
  const { subject } = await searchParams;
  const ctx = subject ? await loadSubjectContext(subject) : null;
  if (!ctx) return <p className="p-6 text-sm">Materia no encontrada.</p>;

  const results = computeResults(ctx);
  const formula = (ctx.year.final_formula.length
    ? ctx.year.final_formula
    : ctx.periods.map((p) => ({ period: p.number, weight: p.weight }))
  )
    .map((f) => `P${f.period} ${f.weight}%`)
    .join(" + ");

  return (
    <div className="mx-auto w-full max-w-4xl bg-white p-6 text-sm text-black print:p-0">
      <div className="mb-4 flex items-start justify-between gap-4 print:hidden">
        <p className="text-brand-muted">Usa «Guardar como PDF» en el diálogo de impresión.</p>
        <PrintButton />
      </div>

      <h1 className="text-lg font-bold">{ctx.institution?.name}</h1>
      <p className="mb-4">
        {ctx.course.grade} {ctx.course.section} · {ctx.subject.name} · Año {ctx.year.year} · escala {ctx.year.scale_min}–
        {ctx.year.scale_max} (aprueba con {ctx.year.pass_grade})
      </p>

      {ctx.periods.map((period) => {
        const acts = ctx.activities.filter((a) => a.period_id === period.id);
        return (
          <section key={period.id} className="mb-6 break-inside-avoid">
            <h2 className="mb-1 font-semibold">{period.name}</h2>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 px-2 py-1 text-left">Estudiante</th>
                  {acts.map((a) => (
                    <th key={a.id} className="border border-gray-400 px-2 py-1">
                      {a.name} ({a.weight}%)
                    </th>
                  ))}
                  <th className="border border-gray-400 px-2 py-1">Periodo</th>
                </tr>
              </thead>
              <tbody>
                {ctx.roster.map((r) => {
                  const mine = gradeMap(ctx.grades.filter((g) => g.enrollment_id === r.enrollment.id));
                  return (
                    <tr key={r.enrollment.id}>
                      <td className="border border-gray-400 px-2 py-1">
                        {r.student.last_name} {r.student.first_name}
                      </td>
                      {acts.map((a) => (
                        <td key={a.id} className="border border-gray-400 px-2 py-1 text-center">
                          {mine.get(a.id) ?? ""}
                        </td>
                      ))}
                      <td className="border border-gray-400 px-2 py-1 text-center font-semibold">
                        {periodGrade(acts, mine).value ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      <section className="break-inside-avoid">
        <h2 className="mb-1 font-semibold">Definitivas — {formula}</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-400 px-2 py-1 text-left">Estudiante</th>
              {ctx.periods.map((p) => (
                <th key={p.id} className="border border-gray-400 px-2 py-1">
                  P{p.number}
                </th>
              ))}
              <th className="border border-gray-400 px-2 py-1">Final</th>
              <th className="border border-gray-400 px-2 py-1">Desempeño</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.row.enrollment.id}>
                <td className="border border-gray-400 px-2 py-1">
                  {r.row.student.last_name} {r.row.student.first_name}
                </td>
                {ctx.periods.map((p) => (
                  <td key={p.id} className="border border-gray-400 px-2 py-1 text-center">
                    {r.periodGrades.get(p.number) ?? ""}
                  </td>
                ))}
                <td className="border border-gray-400 px-2 py-1 text-center font-semibold">{r.final ?? ""}</td>
                <td className="border border-gray-400 px-2 py-1 text-center">
                  {performanceLabel(r.final, ctx.year.scale_min, ctx.year.scale_max, ctx.year.pass_grade)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
