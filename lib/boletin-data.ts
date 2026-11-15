import "server-only";

import { createClient } from "@/lib/supabase/server";
import { finalGrade, gradeMap, performanceLabel, periodGrade } from "@/lib/grades";
import type {
  AcademicYear,
  Activity,
  Attendance,
  Course,
  CourseSubject,
  Enrollment,
  Grade,
  Guardian,
  Institution,
  Period,
  Student,
} from "@/lib/supabase/types";

export type BulletinSubjectRow = {
  subject: string;
  grade: number | null;
  performance: string;
  absences: number;
};

export type BulletinGuardian = { id: string; name: string; relationship: string | null; whatsapp: string | null };

export type BulletinStudent = {
  enrollmentId: string;
  studentId: string;
  name: string;
  /** "Nombres Apellidos", para el PDF y el mensaje. */
  displayName: string;
  document: string | null;
  photoPath: string | null;
  rows: BulletinSubjectRow[];
  average: number | null;
  guardians: BulletinGuardian[];
};

export type CourseBulletins = {
  institution: string;
  courseLabel: string;
  year: number;
  periodLabel: string;
  periodNumber: number | null;
  scale: { min: number; max: number; pass: number };
  students: BulletinStudent[];
  periods: Period[];
};

/**
 * Datos de los boletines de un curso: por estudiante, la nota de cada materia
 * que dicta el docente en ese periodo (o la nota final del año si
 * periodNumber es null), con desempeño e inasistencias.
 */
export async function loadCourseBulletins(
  courseId: string,
  periodNumber: number | null
): Promise<CourseBulletins | null> {
  const supabase = await createClient();

  const { data: course } = await supabase.from("courses").select("*").eq("id", courseId).is("deleted_at", null).maybeSingle();
  if (!course) return null;
  const { data: year } = await supabase.from("academic_years").select("*").eq("id", (course as Course).academic_year_id).single();
  if (!year) return null;
  const y = year as AcademicYear;

  const [{ data: inst }, { data: periodData }, { data: subjData }, { data: enrollData }] = await Promise.all([
    supabase.from("institutions").select("*").eq("id", y.institution_id).maybeSingle(),
    supabase.from("periods").select("*").eq("academic_year_id", y.id).order("number"),
    supabase.from("course_subjects").select("*").eq("course_id", courseId).is("deleted_at", null).order("name"),
    supabase.from("enrollments").select("*").eq("course_id", courseId).in("status", ["activa", "aprobo", "perdio"]),
  ]);
  const periods = (periodData ?? []) as Period[];
  const subjects = (subjData ?? []) as CourseSubject[];
  const enrollments = (enrollData ?? []) as Enrollment[];
  const period = periodNumber === null ? null : periods.find((p) => p.number === periodNumber) ?? null;
  if (periodNumber !== null && !period) return null;

  const enrollmentIds = enrollments.map((e) => e.id);
  const subjectIds = subjects.map((s) => s.id);
  const studentIds = enrollments.map((e) => e.student_id);

  const [{ data: studentData }, { data: guardianData }, { data: activityData }, { data: attData }] = await Promise.all([
    studentIds.length ? supabase.from("students").select("*").in("id", studentIds) : Promise.resolve({ data: [] }),
    studentIds.length ? supabase.from("guardians").select("*").in("student_id", studentIds) : Promise.resolve({ data: [] }),
    subjectIds.length
      ? supabase.from("activities").select("*").in("course_subject_id", subjectIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    subjectIds.length && enrollmentIds.length
      ? supabase.from("attendance").select("*").in("course_subject_id", subjectIds).eq("status", "falta")
      : Promise.resolve({ data: [] }),
  ]);
  const activities = (activityData ?? []) as Activity[];
  const activityIds = activities.map((a) => a.id);
  const { data: gradeData } = activityIds.length
    ? await supabase.from("grades").select("*").in("activity_id", activityIds)
    : { data: [] };
  const grades = (gradeData ?? []) as Grade[];
  const absencesAll = (attData ?? []) as Attendance[];
  const students = new Map(((studentData ?? []) as Student[]).map((s) => [s.id, s]));
  const guardians = (guardianData ?? []) as Guardian[];

  const result: BulletinStudent[] = [];
  for (const enrollment of enrollments) {
    const student = students.get(enrollment.student_id);
    if (!student) continue;
    const mine = grades.filter((g) => g.enrollment_id === enrollment.id);

    const rows: BulletinSubjectRow[] = subjects.map((subject) => {
      const subjectActivities = activities.filter((a) => a.course_subject_id === subject.id);

      const perPeriod = new Map<number, number | null>();
      for (const p of periods) {
        const acts = subjectActivities.filter((a) => a.period_id === p.id);
        const own = gradeMap(mine.filter((g) => acts.some((a) => a.id === g.activity_id)));
        perPeriod.set(p.number, periodGrade(acts, own).value);
      }
      const value = period ? perPeriod.get(period.number) ?? null : finalGrade(perPeriod, y.final_formula, periods);

      // Faltas: las del periodo si tiene fechas; si no, todas las del año.
      const absences = absencesAll.filter((a) => {
        if (a.enrollment_id !== enrollment.id || a.course_subject_id !== subject.id) return false;
        if (!period || (!period.starts_on && !period.ends_on)) return true;
        if (period.starts_on && a.attendance_date < period.starts_on) return false;
        if (period.ends_on && a.attendance_date > period.ends_on) return false;
        return true;
      }).length;

      return {
        subject: subject.name,
        grade: value,
        performance: performanceLabel(value, y.scale_min, y.scale_max, y.pass_grade),
        absences,
      };
    });

    const graded = rows.filter((r) => r.grade !== null) as (BulletinSubjectRow & { grade: number })[];
    const average = graded.length ? Math.round((graded.reduce((s, r) => s + r.grade, 0) / graded.length) * 10) / 10 : null;

    result.push({
      enrollmentId: enrollment.id,
      studentId: student.id,
      name: `${student.last_name} ${student.first_name}`,
      displayName: `${student.first_name} ${student.last_name}`,
      document: student.document_number,
      photoPath: student.photo_url,
      rows,
      average,
      guardians: guardians
        .filter((g) => g.student_id === student.id)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((g) => ({ id: g.id, name: g.full_name, relationship: g.relationship, whatsapp: g.whatsapp })),
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const c = course as Course;
  return {
    institution: (inst as Institution | null)?.name ?? "",
    courseLabel: `${c.grade} ${c.section}`,
    year: y.year,
    periodLabel: period ? period.name : `Nota final ${y.year}`,
    periodNumber: period ? period.number : null,
    scale: { min: y.scale_min, max: y.scale_max, pass: y.pass_grade },
    students: result,
    periods,
  };
}
