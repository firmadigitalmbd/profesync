import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, selectClasses } from "@/components/action-form";
import { AttendanceList } from "@/components/docente/attendance-list";
import { isPlanActive, requireRole, signedMediaUrls } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSubjectContext } from "@/lib/notas-data";
import { loadAlertConfig } from "@/lib/notifications";
import type { Attendance, AcademicYear, Course, CourseSubject, Institution } from "@/lib/supabase/types";

export default async function AsistenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; date?: string }>;
}) {
  const profile = await requireRole("teacher");
  const editable = isPlanActive(profile);
  const supabase = await createClient();
  const sp = await searchParams;
  // Faltas sin excusa a partir de las cuales se alerta (configurable en Mi cuenta).
  const ABSENCE_ALERT = (await loadAlertConfig()).absenceStep;

  const [{ data: subjData }, { data: courseData }, { data: yearData }, { data: instData }] = await Promise.all([
    supabase.from("course_subjects").select("*").is("deleted_at", null).order("name"),
    supabase.from("courses").select("*").is("deleted_at", null),
    supabase.from("academic_years").select("*").eq("status", "abierto"),
    supabase.from("institutions").select("*"),
  ]);
  const courses = (courseData ?? []) as Course[];
  const years = (yearData ?? []) as AcademicYear[];
  const institutions = (instData ?? []) as Institution[];
  // Solo materias de años abiertos: la asistencia se toma en el año en curso.
  const subjects = ((subjData ?? []) as CourseSubject[]).filter((s) =>
    years.some((y) => y.id === courses.find((c) => c.id === s.course_id)?.academic_year_id)
  );

  const labelOf = (s: CourseSubject) => {
    const c = courses.find((course) => course.id === s.course_id);
    const y = years.find((year) => year.id === c?.academic_year_id);
    const inst = institutions.find((i) => i.id === y?.institution_id);
    return `${c?.grade ?? ""} ${c?.section ?? ""} · ${s.name} · ${inst?.name ?? ""}`;
  };

  if (subjects.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-brand-ink">Asistencia</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-brand-muted">
            Necesitas una materia en un año abierto.{" "}
            <Link href="/dashboard/cursos" className="font-medium text-brand-dark underline">
              Ir a Cursos y materias
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  const subjectId = subjects.find((s) => s.id === sp.subject)?.id ?? subjects[0].id;
  const today = new Date().toISOString().slice(0, 10);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const ctx = await loadSubjectContext(subjectId);
  if (!ctx) return <p className="text-sm text-brand-muted">No se pudo cargar la materia.</p>;

  const { data: attData } = await supabase.from("attendance").select("*").eq("course_subject_id", subjectId);
  const attendance = (attData ?? []) as Attendance[];
  const photos = await signedMediaUrls(ctx.roster.map((r) => r.student.photo_url));

  const rows = ctx.roster.map((r) => ({
    enrollmentId: r.enrollment.id,
    name: `${r.student.last_name} ${r.student.first_name}`,
    photoUrl: r.student.photo_url ? photos.get(r.student.photo_url) ?? null : null,
    status:
      attendance.find((a) => a.enrollment_id === r.enrollment.id && a.attendance_date === date)?.status ?? null,
  }));

  // Alertas: estudiantes con muchas faltas sin excusa en esta materia.
  const alerts = ctx.roster
    .map((r) => ({
      name: `${r.student.last_name} ${r.student.first_name}`,
      absences: attendance.filter((a) => a.enrollment_id === r.enrollment.id && a.status === "falta").length,
    }))
    .filter((a) => a.absences >= ABSENCE_ALERT)
    .sort((a, b) => b.absences - a.absences);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Asistencia</h1>
        <p className="text-sm text-brand-muted">Toca una opción por estudiante; se guarda al instante.</p>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <Field label="Materia" className="min-w-[240px] flex-1">
          <select name="subject" defaultValue={subjectId} className={selectClasses}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {labelOf(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha" className="w-44">
          <Input name="date" type="date" defaultValue={date} max={today} />
        </Field>
        <button className="h-10 rounded-[var(--radius-brand-sm)] border border-brand-border px-4 text-sm hover:bg-black/5">
          Ver
        </button>
      </form>

      {alerts.length > 0 && (
        <div className="rounded-[var(--radius-brand-md)] border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" /> Inasistencias reiteradas ({ABSENCE_ALERT} o más faltas)
          </p>
          <ul className="mt-1 list-inside list-disc">
            {alerts.map((a) => (
              <li key={a.name}>
                {a.name}: {a.absences} faltas
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-brand-muted">Este curso aún no tiene estudiantes matriculados.</p>
      ) : (
        <AttendanceList key={`${subjectId}:${date}`} subjectId={subjectId} date={date} rows={rows} readOnly={!editable} />
      )}
    </div>
  );
}
