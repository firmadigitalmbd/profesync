import "server-only";

import { createClient } from "@/lib/supabase/server";
import { signedMediaUrl } from "@/lib/auth";
import { finalGrade, gradeMap, performanceLabel, periodGrade } from "@/lib/grades";
import type {
  AcademicYear,
  Activity,
  Attendance,
  Course,
  CourseSubject,
  Enrollment,
  Grade,
  Institution,
  Observation,
  Period,
  Student,
} from "@/lib/supabase/types";

export const WITHDRAWAL_REASONS = [
  "Traslado a otra institución",
  "Cambio de ciudad",
  "Retiro voluntario del acudiente",
  "Deserción (dejó de asistir)",
  "Motivos de salud",
  "Otro",
] as const;

/** Datos serializables del informe de retiro (se pasan al navegador para armar el PDF). */
export type WithdrawalReport = {
  student: { name: string; document: string | null; photoUrl: string | null };
  institution: string;
  courseLabel: string;
  year: number;
  teacherName: string;
  withdrawnOn: string;
  reason: string;
  note: string | null;
  pass: number;
  subjects: {
    name: string;
    periods: { label: string; grade: number | null }[];
    final: number | null;
    performance: string;
    absences: number;
    excuses: number;
    late: number;
    absenceDates: string[];
  }[];
  observations: { date: string; kind: string; note: string }[];
};

/**
 * Arma el informe de retiro de una matrícula: notas hasta hoy, faltas con sus
 * fechas y observaciones. Funciona con matrículas retiradas (no depende de la
 * lista de curso activa).
 */
export async function loadWithdrawalReport(
  enrollmentId: string,
  teacherName: string
): Promise<WithdrawalReport | null> {
  const supabase = await createClient();

  const { data: enrollmentData } = await supabase.from("enrollments").select("*").eq("id", enrollmentId).maybeSingle();
  if (!enrollmentData) return null;
  const enrollment = enrollmentData as Enrollment;

  const [{ data: studentData }, { data: courseData }, { data: yearData }] = await Promise.all([
    supabase.from("students").select("*").eq("id", enrollment.student_id).maybeSingle(),
    supabase.from("courses").select("*").eq("id", enrollment.course_id).maybeSingle(),
    supabase.from("academic_years").select("*").eq("id", enrollment.academic_year_id).maybeSingle(),
  ]);
  if (!studentData || !courseData || !yearData) return null;
  const student = studentData as Student;
  const course = courseData as Course;
  const year = yearData as AcademicYear;

  const [{ data: instData }, { data: periodData }, { data: subjectData }, { data: attData }, { data: obsData }] =
    await Promise.all([
      supabase.from("institutions").select("*").eq("id", year.institution_id).maybeSingle(),
      supabase.from("periods").select("*").eq("academic_year_id", year.id).order("number"),
      supabase.from("course_subjects").select("*").eq("course_id", course.id).is("deleted_at", null).order("name"),
      supabase
        .from("attendance")
        .select("*")
        .eq("enrollment_id", enrollmentId)
        .order("attendance_date", { ascending: true }),
      supabase.from("observations").select("*").eq("student_id", student.id).order("observed_on", { ascending: true }),
    ]);
  const periods = (periodData ?? []) as Period[];
  const subjects = (subjectData ?? []) as CourseSubject[];
  const attendance = (attData ?? []) as Attendance[];
  const observations = (obsData ?? []) as Observation[];
  const institution = instData as Institution | null;

  const subjectIds = subjects.map((s) => s.id);
  const { data: activityData } = subjectIds.length
    ? await supabase.from("activities").select("*").in("course_subject_id", subjectIds).is("deleted_at", null)
    : { data: [] };
  const activities = (activityData ?? []) as Activity[];
  const activityIds = activities.map((a) => a.id);
  const { data: gradeData } = activityIds.length
    ? await supabase.from("grades").select("*").eq("enrollment_id", enrollmentId).in("activity_id", activityIds)
    : { data: [] };
  const grades = (gradeData ?? []) as Grade[];

  const pass = Number(year.pass_grade);
  const rows = subjects.map((subject) => {
    const subjectActivities = activities.filter((a) => a.course_subject_id === subject.id);
    const byPeriod = new Map<number, number | null>();
    const periodRows = periods.map((period) => {
      const acts = subjectActivities.filter((a) => a.period_id === period.id);
      const own = gradeMap(grades.filter((g) => acts.some((a) => a.id === g.activity_id)));
      const value = periodGrade(acts, own).value;
      byPeriod.set(period.number, value);
      return { label: period.name, grade: value };
    });
    const final = finalGrade(byPeriod, year.final_formula, periods);
    const mine = attendance.filter((a) => a.course_subject_id === subject.id);
    return {
      name: subject.name,
      periods: periodRows,
      final,
      performance: performanceLabel(final, Number(year.scale_min), Number(year.scale_max), pass),
      absences: mine.filter((a) => a.status === "falta").length,
      excuses: mine.filter((a) => a.status === "excusa").length,
      late: mine.filter((a) => a.status === "tarde").length,
      absenceDates: mine.filter((a) => a.status === "falta").map((a) => a.attendance_date),
    };
  });

  return {
    student: {
      name: `${student.first_name} ${student.last_name}`,
      document: student.document_number,
      photoUrl: await signedMediaUrl(student.photo_url),
    },
    institution: institution?.name ?? "",
    courseLabel: `${course.grade} ${course.section}`,
    year: year.year,
    teacherName,
    withdrawnOn: enrollment.withdrawn_on ?? new Date().toISOString().slice(0, 10),
    reason: enrollment.withdrawn_reason ?? "—",
    note: enrollment.withdrawn_note,
    pass,
    subjects: rows,
    observations: observations.map((o) => ({ date: o.observed_on, kind: o.kind, note: o.note })),
  };
}
