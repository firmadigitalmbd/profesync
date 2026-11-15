import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm, Field, selectClasses } from "@/components/action-form";
import { PhotoInput } from "@/components/photo-input";
import { StudentAvatar } from "@/components/docente/student-avatar";
import { isPlanActive, requireRole, signedMediaUrls } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createStudent } from "@/lib/actions/docente";
import { importStudents } from "@/lib/actions/notas";
import type { AcademicYear, Course, Enrollment, Institution, Student } from "@/lib/supabase/types";

export default async function EstudiantesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; course?: string }>;
}) {
  const profile = await requireRole("teacher");
  const editable = isPlanActive(profile);
  const supabase = await createClient();
  const { q, course: presetCourse } = await searchParams;
  const term = (q ?? "").trim();

  let query = supabase.from("students").select("*").is("deleted_at", null).order("last_name").order("first_name");
  if (term) {
    const safe = term.replace(/[,()%*]/g, " ");
    query = query.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,document_number.ilike.%${safe}%`);
  }

  const [{ data: studentData }, { data: courseData }, { data: yearData }, { data: instData }, { data: enrollData }] =
    await Promise.all([
      query,
      supabase.from("courses").select("*").is("deleted_at", null).order("grade_order"),
      supabase.from("academic_years").select("*").eq("status", "abierto"),
      supabase.from("institutions").select("*").is("deleted_at", null),
      supabase.from("enrollments").select("*").in("status", ["activa", "aprobo", "perdio"]),
    ]);

  const students = (studentData ?? []) as Student[];
  const courses = (courseData ?? []) as Course[];
  const years = (yearData ?? []) as AcademicYear[];
  const institutions = (instData ?? []) as Institution[];
  const enrollments = (enrollData ?? []) as Enrollment[];

  const openCourses = courses.filter((c) => years.some((y) => y.id === c.academic_year_id));
  const presetId = presetCourse && openCourses.some((c) => c.id === presetCourse) ? presetCourse : "";
  const courseLabel = (c: Course) => {
    const y = years.find((year) => year.id === c.academic_year_id);
    const inst = institutions.find((i) => i.id === y?.institution_id);
    return `${c.grade} ${c.section} — ${inst?.name ?? ""} ${y?.year ?? ""}`;
  };

  const photos = await signedMediaUrls(students.map((s) => s.photo_url));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Estudiantes</h1>
        <p className="text-sm text-brand-muted">
          {students.length} registrados · máximo {profile.max_students} en tu plan.
        </p>
      </div>

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar estudiante</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createStudent} submitLabel="Registrar" className="gap-4">
              <PhotoInput label="Foto del estudiante" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nombres">
                  <Input name="firstName" required />
                </Field>
                <Field label="Apellidos">
                  <Input name="lastName" required />
                </Field>
                <Field label="Documento (opcional)">
                  <Input name="documentNumber" />
                </Field>
                <Field label="Fecha de nacimiento (opcional)">
                  <Input name="birthDate" type="date" />
                </Field>
                <Field label="Matricular en (opcional)" className="sm:col-span-2">
                  <select name="courseId" className={selectClasses} defaultValue={presetId}>
                    <option value="">— Solo registrar, matricular después —</option>
                    {openCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {courseLabel(c)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="rounded-[var(--radius-brand-sm)] border border-brand-border p-3">
                <p className="mb-2 text-sm font-medium text-brand-ink">Acudiente (para enviar boletines por WhatsApp)</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Nombre">
                    <Input name="guardianName" />
                  </Field>
                  <Field label="Parentesco">
                    <Input name="guardianRelationship" placeholder="Madre, padre…" />
                  </Field>
                  <Field label="WhatsApp con indicativo">
                    <Input name="guardianWhatsapp" inputMode="numeric" placeholder="573001112233" />
                  </Field>
                </div>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {editable && (
        <details className="rounded-[var(--radius-brand-md)] border border-brand-border bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-brand-dark">
            Importar lista pegando desde Excel
          </summary>
          <ActionForm action={importStudents} submitLabel="Importar" className="mt-3 gap-3">
            <p className="text-xs text-brand-muted">
              Copia las filas en Excel y pégalas aquí. Columnas, en este orden: <strong>Apellidos, Nombres</strong>,
              Documento, Acudiente, WhatsApp con indicativo (las tres últimas son opcionales).
            </p>
            <textarea
              name="rows"
              required
              rows={6}
              placeholder={"Pérez Gómez\tJuan Camilo\t1001234567\tMaría Gómez\t573001112233"}
              className="w-full rounded-[var(--radius-brand-sm)] border border-brand-border bg-white px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <Field label="Matricular a todos en (opcional)">
              <select name="courseId" className={selectClasses} defaultValue={presetId}>
                <option value="">— Solo registrar —</option>
                {openCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {courseLabel(c)}
                  </option>
                ))}
              </select>
            </Field>
          </ActionForm>
        </details>
      )}

      <form className="flex gap-2">
        <Input name="q" defaultValue={term} placeholder="Buscar por nombre o documento…" />
        <button className="h-10 rounded-[var(--radius-brand-sm)] border border-brand-border px-4 text-sm hover:bg-black/5">
          Buscar
        </button>
      </form>

      {students.length === 0 ? (
        <p className="text-sm text-brand-muted">No hay estudiantes {term ? "con ese criterio" : "registrados todavía"}.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.map((s) => {
            const enr = enrollments.find((e) => e.student_id === s.id && years.some((y) => y.id === e.academic_year_id));
            const course = enr ? courses.find((c) => c.id === enr.course_id) : undefined;
            return (
              <Link key={s.id} href={`/dashboard/estudiantes/${s.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center gap-3 p-4">
                    <StudentAvatar
                      name={`${s.first_name} ${s.last_name}`}
                      url={s.photo_url ? photos.get(s.photo_url) ?? null : null}
                      size={56}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-brand-ink">
                        {s.last_name} {s.first_name}
                      </p>
                      <p className="truncate text-xs text-brand-muted">
                        {course ? `${course.grade} ${course.section}` : "Sin matrícula en año abierto"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
