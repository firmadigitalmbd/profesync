import Link from "next/link";
import { Download, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm, Field, selectClasses } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { GradesGrid } from "@/components/docente/grades-grid";
import { StudentAvatar } from "@/components/docente/student-avatar";
import { isPlanActive, requireRole, signedMediaUrls } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createActivity, deleteActivity, setPeriodStatus } from "@/lib/actions/notas";
import { computeResults, loadSubjectContext } from "@/lib/notas-data";
import { performanceLabel } from "@/lib/grades";
import type { AcademicYear, Course, CourseSubject, Institution } from "@/lib/supabase/types";

export default async function NotasPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; period?: string; tab?: string }>;
}) {
  const profile = await requireRole("teacher");
  const editable = isPlanActive(profile);
  const supabase = await createClient();
  const sp = await searchParams;

  const [{ data: subjData }, { data: courseData }, { data: yearData }, { data: instData }] = await Promise.all([
    supabase.from("course_subjects").select("*").is("deleted_at", null).order("name"),
    supabase.from("courses").select("*").is("deleted_at", null),
    supabase.from("academic_years").select("*").order("year", { ascending: false }),
    supabase.from("institutions").select("*"),
  ]);
  const subjects = (subjData ?? []) as CourseSubject[];
  const courses = (courseData ?? []) as Course[];
  const years = (yearData ?? []) as AcademicYear[];
  const institutions = (instData ?? []) as Institution[];

  const labelOf = (s: CourseSubject) => {
    const c = courses.find((course) => course.id === s.course_id);
    const y = years.find((year) => year.id === c?.academic_year_id);
    const inst = institutions.find((i) => i.id === y?.institution_id);
    return `${c?.grade ?? ""} ${c?.section ?? ""} · ${s.name} · ${inst?.name ?? ""} ${y?.year ?? ""}`;
  };

  // Primero las materias de años abiertos, de más reciente a más antigua.
  const ordered = [...subjects].sort((a, b) => {
    const ya = years.find((y) => y.id === courses.find((c) => c.id === a.course_id)?.academic_year_id);
    const yb = years.find((y) => y.id === courses.find((c) => c.id === b.course_id)?.academic_year_id);
    return Number(yb?.status === "abierto") - Number(ya?.status === "abierto") || (yb?.year ?? 0) - (ya?.year ?? 0);
  });

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-brand-ink">Cuaderno de notas</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-brand-muted">
            Aún no tienes materias. Créalas en{" "}
            <Link href="/dashboard/cursos" className="font-medium text-brand-dark underline">
              Cursos y materias
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  const subjectId = ordered.find((s) => s.id === sp.subject)?.id ?? ordered[0].id;
  const ctx = await loadSubjectContext(subjectId);
  if (!ctx) return <p className="text-sm text-brand-muted">No se pudo cargar la materia.</p>;

  const openPeriod = ctx.periods.find((p) => p.status === "abierto") ?? ctx.periods[0];
  const period = ctx.periods.find((p) => p.id === sp.period) ?? openPeriod;
  const tab = sp.tab === "definitivas" ? "definitivas" : "planilla";

  const periodActivities = ctx.activities.filter((a) => a.period_id === period?.id);
  const weightTotal = periodActivities.reduce((sum, a) => sum + Number(a.weight), 0);
  const yearOpen = ctx.year.status === "abierto";
  const periodOpen = period?.status === "abierto" && yearOpen;
  const canWrite = editable && periodOpen;

  const photos = await signedMediaUrls(ctx.roster.map((r) => r.student.photo_url));
  const photoOf = (url: string | null) => (url ? photos.get(url) ?? null : null);

  const initial: Record<string, number> = {};
  ctx.grades.forEach((g) => {
    initial[`${g.enrollment_id}:${g.activity_id}`] = Number(g.value);
  });

  const results = computeResults(ctx);
  const { scale_min: min, scale_max: max, pass_grade: pass } = ctx.year;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">Cuaderno de notas</h1>
          <p className="text-sm text-brand-muted">
            {ctx.roster.length} estudiantes · escala {min}–{max} · aprueba con {pass}
          </p>
        </div>
        <div className="flex gap-2">
          <Button2 href={`/api/export/notas?subject=${subjectId}`} icon="download">
            Excel
          </Button2>
          <Button2 href={`/imprimir/notas?subject=${subjectId}`} icon="print">
            PDF / imprimir
          </Button2>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <Field label="Materia" className="min-w-[260px] flex-1">
          <select name="subject" defaultValue={subjectId} className={selectClasses}>
            {ordered.map((s) => (
              <option key={s.id} value={s.id}>
                {labelOf(s)}
              </option>
            ))}
          </select>
        </Field>
        <input type="hidden" name="tab" value={tab} />
        <button className="h-10 rounded-[var(--radius-brand-sm)] border border-brand-border px-4 text-sm hover:bg-black/5">
          Abrir
        </button>
      </form>

      <div className="flex flex-wrap gap-1 border-b border-brand-border text-sm">
        {[
          { key: "planilla", label: "Planilla por periodo" },
          { key: "definitivas", label: "Definitivas del año" },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/dashboard/notas?subject=${subjectId}&tab=${t.key}${period ? `&period=${period.id}` : ""}`}
            className={`-mb-px border-b-2 px-4 py-2 ${
              tab === t.key ? "border-brand font-medium text-brand-ink" : "border-transparent text-brand-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "planilla" && period && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {ctx.periods.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/notas?subject=${subjectId}&period=${p.id}`}
                className={`rounded-full border px-3 py-1 text-sm ${
                  p.id === period.id ? "border-brand bg-brand text-brand-ink" : "border-brand-border text-brand-muted"
                }`}
              >
                {p.name}
                {p.status === "cerrado" ? " 🔒" : ""}
              </Link>
            ))}
            {editable && yearOpen && (
              <ConfirmButton
                action={setPeriodStatus.bind(null, period.id, period.status === "abierto" ? "cerrado" : "abierto")}
                message={
                  period.status === "abierto"
                    ? `¿Cerrar el ${period.name}? Las notas y actividades quedarán bloqueadas.`
                    : `¿Reabrir el ${period.name}?`
                }
                variant="outline"
                size="sm"
                className="ml-auto"
              >
                {period.status === "abierto" ? "Cerrar periodo" : "Reabrir periodo"}
              </ConfirmButton>
            )}
          </div>

          {!periodOpen && (
            <p className="text-sm text-brand-muted">
              {yearOpen ? "Este periodo está cerrado: solo consulta." : "El año está cerrado: solo consulta."}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Actividades del {period.name}</CardTitle>
              <p className="text-sm text-brand-muted">
                Pesos asignados: <strong className={Math.abs(weightTotal - 100) < 0.01 ? "text-brand-success" : "text-brand-danger"}>{weightTotal}%</strong>{" "}
                {Math.abs(weightTotal - 100) >= 0.01 && "(deberían sumar 100%)"}
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {periodActivities.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-black/5 py-1 pl-3 pr-1 text-sm">
                    {a.name} · {a.weight}%
                    {canWrite && (
                      <ConfirmButton
                        action={deleteActivity.bind(null, a.id)}
                        message={`¿Eliminar la actividad "${a.name}"? Sus notas dejarán de contar.`}
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                      >
                        ✕
                      </ConfirmButton>
                    )}
                  </span>
                ))}
                {periodActivities.length === 0 && <span className="text-sm text-brand-muted">Sin actividades.</span>}
              </div>
              {canWrite && (
                <ActionForm
                  action={createActivity.bind(null, subjectId, period.id)}
                  submitLabel="Agregar actividad"
                  className="sm:flex-row sm:items-end"
                >
                  <Field label="Nombre (ej. Quiz 1, Taller, Examen)" className="flex-1">
                    <Input name="name" required />
                  </Field>
                  <Field label="Peso %" className="w-24">
                    <Input name="weight" inputMode="decimal" required />
                  </Field>
                  <Field label="Fecha (opcional)" className="w-40">
                    <Input name="date" type="date" />
                  </Field>
                </ActionForm>
              )}
            </CardContent>
          </Card>

          <GradesGrid
            key={`${subjectId}:${period.id}:${periodActivities.map((a) => a.id).join(",")}`}
            students={ctx.roster.map((r) => ({
              enrollmentId: r.enrollment.id,
              name: `${r.student.last_name} ${r.student.first_name}`,
              photoUrl: photoOf(r.student.photo_url),
            }))}
            activities={periodActivities.map((a) => ({ id: a.id, name: a.name, weight: Number(a.weight) }))}
            initial={initial}
            min={min}
            max={max}
            pass={pass}
            readOnly={!canWrite}
          />
        </>
      )}

      {tab === "definitivas" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-brand-muted">
            Fórmula de la nota final:{" "}
            {(ctx.year.final_formula.length ? ctx.year.final_formula : ctx.periods.map((p) => ({ period: p.number, weight: p.weight })))
              .map((f) => `P${f.period} ${f.weight}%`)
              .join(" + ")}
            . Se ajusta en{" "}
            <Link href="/dashboard/instituciones" className="underline">
              Instituciones y años
            </Link>
            .
          </p>
          <div className="overflow-x-auto rounded-[var(--radius-brand-md)] border border-brand-border bg-white">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-black/5 text-left">
                  <th className="px-3 py-2 font-medium">Estudiante</th>
                  {ctx.periods.map((p) => (
                    <th key={p.id} className="px-3 py-2 text-center font-medium">
                      P{p.number}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-medium">Final</th>
                  <th className="px-3 py-2 text-center font-medium">Desempeño</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.row.enrollment.id} className="border-b border-brand-border last:border-0">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StudentAvatar
                          name={`${r.row.student.first_name} ${r.row.student.last_name}`}
                          url={photoOf(r.row.student.photo_url)}
                          size={32}
                        />
                        {r.row.student.last_name} {r.row.student.first_name}
                      </div>
                    </td>
                    {ctx.periods.map((p) => (
                      <td key={p.id} className="px-3 py-2 text-center">
                        {r.periodGrades.get(p.number) ?? "—"}
                      </td>
                    ))}
                    <td
                      className={`px-3 py-2 text-center font-semibold ${
                        r.final !== null && r.final < pass ? "text-brand-danger" : ""
                      }`}
                    >
                      {r.final ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge className={r.final !== null && r.final < pass ? "opacity-70" : ""}>
                        {performanceLabel(r.final, min, max, pass)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Button2({ href, icon, children }: { href: string; icon: "download" | "print"; children: React.ReactNode }) {
  const Icon = icon === "download" ? Download : Printer;
  return (
    <a
      href={href}
      {...(icon === "print" ? { target: "_blank", rel: "noopener" } : {})}
      className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-brand-sm)] border border-brand-border px-4 text-sm font-medium hover:bg-black/5"
    >
      <Icon className="h-4 w-4" />
      {children}
    </a>
  );
}
