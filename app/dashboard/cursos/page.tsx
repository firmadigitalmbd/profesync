import Link from "next/link";
import { ChevronRight, School } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm, Field } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { isPlanActive, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createCourse, deleteCourse } from "@/lib/actions/docente";
import { YearSelect } from "@/components/docente/year-select";
import { cn } from "@/lib/utils";
import type { AcademicYear, Course, CourseSubject, Institution } from "@/lib/supabase/types";

const chip = (active: boolean) =>
  cn(
    "rounded-full border px-3 py-1.5 text-sm transition-colors",
    active
      ? "border-brand bg-brand font-medium text-brand-ink"
      : "border-brand-border bg-white text-brand-muted hover:bg-black/5"
  );

export default async function CursosPage({
  searchParams,
}: {
  searchParams: Promise<{ inst?: string; year?: string }>;
}) {
  const profile = await requireRole("teacher");
  const editable = isPlanActive(profile);
  const supabase = await createClient();
  const sp = await searchParams;

  const [{ data: instData }, { data: yearData }] = await Promise.all([
    supabase.from("institutions").select("*").is("deleted_at", null).order("name"),
    supabase.from("academic_years").select("*").order("year", { ascending: false }),
  ]);
  const institutions = (instData ?? []) as Institution[];
  const allYears = (yearData ?? []) as AcademicYear[];
  const years = allYears.filter((y) => institutions.some((i) => i.id === y.institution_id));

  if (years.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-brand-ink">Cursos</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-brand-muted">
            Primero crea una institución y su año lectivo en{" "}
            <Link href="/dashboard/instituciones" className="font-medium text-brand-dark underline">
              Instituciones y años
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  // Selección: año > institución > primer año abierto.
  const byYear = years.find((y) => y.id === sp.year);
  const institution =
    institutions.find((i) => i.id === byYear?.institution_id) ??
    institutions.find((i) => i.id === sp.inst && years.some((y) => y.institution_id === i.id)) ??
    institutions.find((i) => i.id === (years.find((y) => y.status === "abierto") ?? years[0]).institution_id)!;
  const institutionYears = years.filter((y) => y.institution_id === institution.id);
  // Por defecto, el año actual; si la institución no lo tiene, el abierto más reciente.
  const currentYear = new Date().getFullYear();
  const selected =
    byYear?.institution_id === institution.id
      ? byYear
      : (institutionYears.find((y) => y.year === currentYear) ??
        institutionYears.find((y) => y.status === "abierto") ??
        institutionYears[0]);

  const { data: courseData } = await supabase
    .from("courses")
    .select("*")
    .eq("academic_year_id", selected.id)
    .is("deleted_at", null)
    .order("grade_order")
    .order("grade")
    .order("section");
  const courses = (courseData ?? []) as Course[];
  const courseIds = courses.map((c) => c.id);

  const [{ data: enrollData }, { data: subjectData }] = await Promise.all([
    courseIds.length
      ? supabase.from("enrollments").select("course_id").in("course_id", courseIds).in("status", ["activa", "aprobo", "perdio"])
      : Promise.resolve({ data: [] }),
    courseIds.length
      ? supabase.from("course_subjects").select("id, course_id").in("course_id", courseIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);
  const studentsByCourse = new Map<string, number>();
  (enrollData ?? []).forEach((e) => studentsByCourse.set(e.course_id, (studentsByCourse.get(e.course_id) ?? 0) + 1));
  const subjectsByCourse = new Map<string, number>();
  ((subjectData ?? []) as Pick<CourseSubject, "id" | "course_id">[]).forEach((s) =>
    subjectsByCourse.set(s.course_id, (subjectsByCourse.get(s.course_id) ?? 0) + 1)
  );

  const canEdit = editable && selected.status === "abierto";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Cursos</h1>
        <p className="text-sm text-brand-muted">
          Elige la institución y el año; abre un curso para ver sus estudiantes y materias.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <School className="h-4 w-4 text-brand-muted" />
          {institutions
            .filter((i) => years.some((y) => y.institution_id === i.id))
            .map((i) => (
              <Link key={i.id} href={`/dashboard/cursos?inst=${i.id}`} className={chip(i.id === institution.id)}>
                {i.name}
              </Link>
            ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <YearSelect
            value={selected.id}
            options={[...institutionYears]
              .sort((a, b) => b.year - a.year)
              .map((y) => ({ id: y.id, label: `${y.year}${y.status === "cerrado" ? " (cerrado)" : ""}` }))}
          />
          {selected.status === "cerrado" ? (
            <Link href={`/dashboard/cierre/${selected.id}`} className="text-sm font-medium text-brand-dark underline">
              Ver resultados del año
            </Link>
          ) : (
            editable && (
              <Link href={`/dashboard/cierre/${selected.id}`} className="text-sm font-medium text-brand-dark underline">
                Cerrar año…
              </Link>
            )
          )}
        </div>
      </div>
      {selected.year !== currentYear && (
        <p className="text-sm text-brand-muted">
          Estás viendo el año {selected.year}
          {institutionYears.some((y) => y.year === currentYear) ? "." : `; esta institución aún no tiene el año ${currentYear}.`}
        </p>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo curso en {institution.name} · {selected.year}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createCourse} submitLabel="Crear curso" className="sm:flex-row sm:items-end">
              <input type="hidden" name="academicYearId" value={selected.id} />
              <Field label="Grado (ej. 6°, Transición)" className="flex-1">
                <Input name="grade" required />
              </Field>
              <Field label="Grupo" className="w-28">
                <Input name="section" defaultValue="A" required />
              </Field>
              <Field label="Orden del grado (1, 2, 3…)" className="w-40">
                <Input name="gradeOrder" type="number" defaultValue={0} />
              </Field>
            </ActionForm>
            <p className="mt-2 text-xs text-brand-muted">
              Llevas {courses.length} curso(s) en este año; tu plan permite {profile.max_courses} en total. El orden sirve
              para ubicar el grado y, al cerrar el año, promover a los estudiantes al siguiente.
            </p>
          </CardContent>
        </Card>
      )}

      {selected.status === "cerrado" && <p className="text-sm text-brand-muted">Este año está cerrado: solo consulta.</p>}
      {courses.length === 0 && <p className="text-sm text-brand-muted">Este año aún no tiene cursos.</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <Card key={course.id} className="transition-shadow hover:shadow-md">
            <CardContent className="flex flex-col gap-3 p-4">
              <Link href={`/dashboard/cursos/${course.id}`} className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold text-brand-ink">
                    {course.grade} {course.section}
                  </p>
                  <p className="text-sm text-brand-muted">
                    {studentsByCourse.get(course.id) ?? 0} estudiantes · {subjectsByCourse.get(course.id) ?? 0} materias
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-brand-muted" />
              </Link>
              {canEdit && (
                <ConfirmButton
                  action={deleteCourse.bind(null, course.id)}
                  message={`¿Eliminar el curso ${course.grade} ${course.section}?`}
                  variant="outline"
                  size="sm"
                >
                  Eliminar
                </ConfirmButton>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
