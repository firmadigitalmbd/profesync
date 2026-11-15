import "server-only";

import { createClient } from "@/lib/supabase/server";
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

export type RosterRow = { enrollment: Enrollment; student: Student };

export type SubjectContext = {
  subject: CourseSubject;
  course: Course;
  year: AcademicYear;
  institution: Institution | null;
  periods: Period[];
  roster: RosterRow[];
  activities: Activity[];
  grades: Grade[];
};

/** Carga todo lo necesario para trabajar una materia: curso, año, periodos, lista, actividades y notas. */
export async function loadSubjectContext(subjectId: string): Promise<SubjectContext | null> {
  const supabase = await createClient();

  const { data: subject } = await supabase
    .from("course_subjects")
    .select("*")
    .eq("id", subjectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!subject) return null;

  const { data: course } = await supabase.from("courses").select("*").eq("id", subject.course_id).single();
  if (!course) return null;
  const { data: year } = await supabase.from("academic_years").select("*").eq("id", course.academic_year_id).single();
  if (!year) return null;

  const [{ data: institution }, { data: periods }, { data: enrollments }, { data: activities }] = await Promise.all([
    supabase.from("institutions").select("*").eq("id", year.institution_id).maybeSingle(),
    supabase.from("periods").select("*").eq("academic_year_id", year.id).order("number"),
    supabase
      .from("enrollments")
      .select("*")
      .eq("course_id", course.id)
      .in("status", ["activa", "aprobo", "perdio"]),
    supabase.from("activities").select("*").eq("course_subject_id", subjectId).is("deleted_at", null).order("created_at"),
  ]);

  const enrollmentList = (enrollments ?? []) as Enrollment[];
  const studentIds = enrollmentList.map((e) => e.student_id);
  const { data: students } = studentIds.length
    ? await supabase.from("students").select("*").in("id", studentIds)
    : { data: [] };
  const studentById = new Map(((students ?? []) as Student[]).map((s) => [s.id, s]));

  const roster: RosterRow[] = enrollmentList
    .map((enrollment) => ({ enrollment, student: studentById.get(enrollment.student_id) }))
    .filter((r): r is RosterRow => !!r.student)
    .sort((a, b) =>
      `${a.student.last_name} ${a.student.first_name}`.localeCompare(`${b.student.last_name} ${b.student.first_name}`, "es")
    );

  const activityList = (activities ?? []) as Activity[];
  const activityIds = activityList.map((a) => a.id);
  const { data: grades } = activityIds.length
    ? await supabase.from("grades").select("*").in("activity_id", activityIds)
    : { data: [] };

  return {
    subject: subject as CourseSubject,
    course: course as Course,
    year: year as AcademicYear,
    institution: (institution as Institution) ?? null,
    periods: (periods ?? []) as Period[],
    roster,
    activities: activityList,
    grades: (grades ?? []) as Grade[],
  };
}

export type StudentResult = {
  row: RosterRow;
  periodGrades: Map<number, number | null>;
  final: number | null;
};

/** Notas por periodo y nota final de cada estudiante de la materia. */
export function computeResults(ctx: SubjectContext): StudentResult[] {
  return ctx.roster.map((row) => {
    const mine = ctx.grades.filter((g) => g.enrollment_id === row.enrollment.id);
    const periodGrades = new Map<number, number | null>();
    for (const period of ctx.periods) {
      const acts = ctx.activities.filter((a) => a.period_id === period.id);
      const own = gradeMap(mine.filter((g) => acts.some((a) => a.id === g.activity_id)));
      periodGrades.set(period.number, periodGrade(acts, own).value);
    }
    return {
      row,
      periodGrades,
      final: finalGrade(periodGrades, ctx.year.final_formula, ctx.periods),
    };
  });
}
