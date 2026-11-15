import "server-only";

import { createClient } from "@/lib/supabase/server";
import { signedMediaUrls } from "@/lib/auth";
import { finalGrade, gradeMap, periodGrade } from "@/lib/grades";
import type {
  AcademicYear,
  Activity,
  Course,
  CourseSubject,
  Enrollment,
  Grade,
  Institution,
  Period,
  Student,
} from "@/lib/supabase/types";

export const DEFAULT_FAIL_LIMIT = 3;

export type ClosingRow = {
  enrollmentId: string;
  studentId: string;
  name: string;
  photoUrl: string | null;
  courseId: string;
  courseLabel: string;
  status: Enrollment["status"];
  subjects: { name: string; final: number | null }[];
  /** Materias con definitiva por debajo de la nota para aprobar. */
  lost: number;
  /** Materias sin definitiva (sin notas). */
  missing: number;
  /** Curso del año siguiente propuesto si aprueba / si repite. */
  promoteCourseId: string | null;
  repeatCourseId: string | null;
  /** Ya está matriculado en el año siguiente (curso). */
  nextCourseId: string | null;
};

export type ClosingData = {
  year: AcademicYear;
  institution: Institution | null;
  periods: Period[];
  rows: ClosingRow[];
  withdrawnCount: number;
  nextYear: AcademicYear | null;
  nextCourses: Course[];
  courseCount: number;
  /** true si los cursos no tienen orden de grado (no se puede proponer el ascenso). */
  noGradeOrder: boolean;
};

const normalize = (s: string) => s.trim().toLowerCase();

/** Datos para el asistente de cierre (año abierto) o el resumen de resultados (año cerrado). */
export async function loadClosingData(yearId: string): Promise<ClosingData | null> {
  const supabase = await createClient();

  const { data: yearData } = await supabase.from("academic_years").select("*").eq("id", yearId).maybeSingle();
  if (!yearData) return null;
  const year = yearData as AcademicYear;

  const [{ data: instData }, { data: periodData }, { data: courseData }, { data: nextData }] = await Promise.all([
    supabase.from("institutions").select("*").eq("id", year.institution_id).maybeSingle(),
    supabase.from("periods").select("*").eq("academic_year_id", year.id).order("number"),
    supabase.from("courses").select("*").eq("academic_year_id", year.id).is("deleted_at", null),
    supabase
      .from("academic_years")
      .select("*")
      .eq("institution_id", year.institution_id)
      .eq("year", year.year + 1)
      .maybeSingle(),
  ]);
  const periods = (periodData ?? []) as Period[];
  const courses = (courseData ?? []) as Course[];
  const nextYear = (nextData as AcademicYear | null) ?? null;
  const courseIds = courses.map((c) => c.id);

  const [{ data: enrollData }, { data: subjectData }, { data: nextCourseData }, { data: nextEnrollData }] =
    await Promise.all([
      supabase.from("enrollments").select("*").eq("academic_year_id", year.id),
      courseIds.length
        ? supabase.from("course_subjects").select("*").in("course_id", courseIds).is("deleted_at", null)
        : Promise.resolve({ data: [] }),
      nextYear
        ? supabase.from("courses").select("*").eq("academic_year_id", nextYear.id).is("deleted_at", null)
        : Promise.resolve({ data: [] }),
      nextYear
        ? supabase.from("enrollments").select("student_id, course_id, status").eq("academic_year_id", nextYear.id)
        : Promise.resolve({ data: [] }),
    ]);
  const allEnrollments = (enrollData ?? []) as Enrollment[];
  const subjects = (subjectData ?? []) as CourseSubject[];
  const nextCourses = ((nextCourseData ?? []) as Course[]).sort(
    (a, b) => a.grade_order - b.grade_order || a.grade.localeCompare(b.grade, "es") || a.section.localeCompare(b.section)
  );
  const nextEnrollments = (nextEnrollData ?? []) as Pick<Enrollment, "student_id" | "course_id" | "status">[];

  const enrollments = allEnrollments.filter((e) => e.status !== "retirado");
  const withdrawnCount = allEnrollments.length - enrollments.length;

  const studentIds = [...new Set(enrollments.map((e) => e.student_id))];
  const subjectIds = subjects.map((s) => s.id);
  const [{ data: studentData }, { data: activityData }] = await Promise.all([
    studentIds.length ? supabase.from("students").select("*").in("id", studentIds) : Promise.resolve({ data: [] }),
    subjectIds.length
      ? supabase.from("activities").select("*").in("course_subject_id", subjectIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);
  const students = new Map(((studentData ?? []) as Student[]).map((s) => [s.id, s]));
  const activities = (activityData ?? []) as Activity[];
  const activityIds = activities.map((a) => a.id);
  const { data: gradeData } = activityIds.length
    ? await supabase.from("grades").select("*").in("activity_id", activityIds)
    : { data: [] };
  const gradesByEnrollment = new Map<string, Grade[]>();
  for (const g of (gradeData ?? []) as Grade[]) {
    const list = gradesByEnrollment.get(g.enrollment_id) ?? [];
    list.push(g);
    gradesByEnrollment.set(g.enrollment_id, list);
  }
  const photos = await signedMediaUrls([...students.values()].map((s) => s.photo_url));

  const pass = Number(year.pass_grade);
  const anyOrder = courses.some((c) => c.grade_order > 0);

  const matchNext = (course: Course, delta: 0 | 1): string | null => {
    if (!nextCourses.length) return null;
    if (delta === 0) {
      const same =
        nextCourses.find((c) => normalize(c.grade) === normalize(course.grade) && normalize(c.section) === normalize(course.section)) ??
        nextCourses.find((c) => c.grade_order === course.grade_order && course.grade_order > 0 && c.section === course.section);
      return same?.id ?? null;
    }
    if (course.grade_order <= 0) return null;
    const target = course.grade_order + 1;
    const next =
      nextCourses.find((c) => c.grade_order === target && normalize(c.section) === normalize(course.section)) ??
      nextCourses.find((c) => c.grade_order === target);
    return next?.id ?? null;
  };

  const rows: ClosingRow[] = enrollments
    .map((enrollment): ClosingRow | null => {
      const student = students.get(enrollment.student_id);
      const course = courses.find((c) => c.id === enrollment.course_id);
      if (!student || !course) return null;
      const mine = gradesByEnrollment.get(enrollment.id) ?? [];
      const subjectRows = subjects
        .filter((s) => s.course_id === course.id)
        .map((subject) => {
          const subjectActivities = activities.filter((a) => a.course_subject_id === subject.id);
          const byPeriod = new Map<number, number | null>();
          for (const period of periods) {
            const acts = subjectActivities.filter((a) => a.period_id === period.id);
            const own = gradeMap(mine.filter((g) => acts.some((a) => a.id === g.activity_id)));
            byPeriod.set(period.number, periodGrade(acts, own).value);
          }
          return { name: subject.name, final: finalGrade(byPeriod, year.final_formula, periods) };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      const already = nextEnrollments.find((n) => n.student_id === enrollment.student_id && n.status !== "retirado");
      return {
        enrollmentId: enrollment.id,
        studentId: student.id,
        name: `${student.last_name} ${student.first_name}`,
        photoUrl: student.photo_url ? (photos.get(student.photo_url) ?? null) : null,
        courseId: course.id,
        courseLabel: `${course.grade} ${course.section}`,
        status: enrollment.status,
        subjects: subjectRows,
        lost: subjectRows.filter((s) => s.final !== null && s.final < pass).length,
        missing: subjectRows.filter((s) => s.final === null).length,
        promoteCourseId: matchNext(course, 1),
        repeatCourseId: matchNext(course, 0),
        nextCourseId: already?.course_id ?? null,
      };
    })
    .filter((r): r is ClosingRow => r !== null)
    .sort((a, b) => a.courseLabel.localeCompare(b.courseLabel, "es") || a.name.localeCompare(b.name, "es"));

  return {
    year,
    institution: (instData as Institution | null) ?? null,
    periods,
    rows,
    withdrawnCount,
    nextYear,
    nextCourses,
    courseCount: courses.length,
    noGradeOrder: courses.length > 0 && !anyOrder,
  };
}
