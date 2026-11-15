import "server-only";

import { createClient } from "@/lib/supabase/server";
import { finalGrade, gradeMap, periodGrade } from "@/lib/grades";
import type {
  AcademicYear,
  Activity,
  AlertSettings,
  Course,
  CourseSubject,
  Enrollment,
  Grade,
  Period,
  Profile,
} from "@/lib/supabase/types";

/** Valores por defecto de las alertas (el docente los cambia en Mi cuenta). */
export const DEFAULT_ABSENCE_STEP = 3;

export type AlertConfig = {
  /** Cada cuántas faltas sin excusa (por estudiante y materia) se alerta. */
  absenceStep: number;
  /** Alertar si la nota de un periodo es ≤ a este valor. null = la nota para aprobar del año. */
  periodGradeMax: number | null;
  /** Alertar si la nota final de una materia es ≤ a este valor. null = la nota para aprobar del año. */
  finalGradeMax: number | null;
};

export async function loadAlertConfig(): Promise<AlertConfig> {
  const supabase = await createClient();
  const { data } = await supabase.from("alert_settings").select("*").maybeSingle();
  const s = data as AlertSettings | null;
  return {
    absenceStep: s?.absence_step ?? DEFAULT_ABSENCE_STEP,
    periodGradeMax: s?.period_grade_max == null ? null : Number(s.period_grade_max),
    finalGradeMax: s?.final_grade_max == null ? null : Number(s.final_grade_max),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

type Draft = { kind: string; title: string; body: string; link: string; dedupe_key: string };

/**
 * Genera las alertas pendientes del docente. Es idempotente: cada alerta
 * tiene una clave única (dedupe_key), así que correrla muchas veces no repite
 * notificaciones ya creadas (ni resucita las que ya leyó).
 */
export async function syncNotifications(profile: Profile): Promise<void> {
  if (profile.role !== "teacher") return;
  const supabase = await createClient();
  const config = await loadAlertConfig();
  const today = isoDay(new Date());
  const in7 = isoDay(new Date(Date.now() + 7 * DAY));
  const drafts: Draft[] = [];

  // 1. Plan por vencer
  if (profile.is_active && profile.plan_expires_at && profile.plan_expires_at >= today && profile.plan_expires_at <= in7) {
    drafts.push({
      kind: "plan",
      title: "Tu plan está por vencer",
      body: `Vence el ${profile.plan_expires_at}. Después quedará en solo lectura; comunícate con el proveedor para renovarlo.`,
      link: "/dashboard/cuenta",
      dedupe_key: `plan:${profile.plan_expires_at}`,
    });
  }

  // 2. Seguimientos del observador vencidos o de hoy
  const { data: obs } = await supabase
    .from("observations")
    .select("id, student_id, follow_up_on, note")
    .eq("resolved", false)
    .not("follow_up_on", "is", null)
    .lte("follow_up_on", today);
  const obsStudentIds = [...new Set((obs ?? []).map((o) => o.student_id))];
  const { data: obsStudents } = obsStudentIds.length
    ? await supabase.from("students").select("id, first_name, last_name").in("id", obsStudentIds)
    : { data: [] };
  const obsStudentName = new Map((obsStudents ?? []).map((s) => [s.id, `${s.first_name} ${s.last_name}`]));
  for (const o of obs ?? []) {
    drafts.push({
      kind: "seguimiento",
      title: `Seguimiento pendiente: ${obsStudentName.get(o.student_id) ?? "estudiante"}`,
      body: `Estaba programado para el ${o.follow_up_on}. ${o.note.slice(0, 120)}`,
      link: `/dashboard/estudiantes/${o.student_id}`,
      dedupe_key: `obs:${o.id}`,
    });
  }

  // 3. Periodos abiertos que terminan pronto (o ya terminaron)
  const { data: periodsEnding } = await supabase
    .from("periods")
    .select("id, name, ends_on, status")
    .eq("status", "abierto")
    .not("ends_on", "is", null)
    .lte("ends_on", in7);
  for (const p of periodsEnding ?? []) {
    const passed = (p.ends_on as string) < today;
    drafts.push({
      kind: "periodo",
      title: passed ? `${p.name}: ya terminó y sigue abierto` : `${p.name} termina pronto`,
      body: passed
        ? `Terminó el ${p.ends_on}. Revisa las notas y ciérralo para bloquear cambios.`
        : `Termina el ${p.ends_on}. Ve cerrando notas.`,
      link: "/dashboard/notas",
      dedupe_key: `period:${p.id}:${p.ends_on}`,
    });
  }

  // 4. Inasistencias reiteradas (por estudiante y materia), con el umbral del docente
  const step = Math.max(1, config.absenceStep);
  const { data: faltas } = await supabase.from("attendance").select("enrollment_id, course_subject_id").eq("status", "falta");
  const counts = new Map<string, { enrollmentId: string; subjectId: string; n: number }>();
  for (const f of faltas ?? []) {
    const key = `${f.enrollment_id}:${f.course_subject_id}`;
    const entry = counts.get(key) ?? { enrollmentId: f.enrollment_id, subjectId: f.course_subject_id, n: 0 };
    entry.n++;
    counts.set(key, entry);
  }
  const flaggedAbsences = [...counts.values()].filter((c) => c.n >= step);

  // 5. Notas bajas (periodo y final), con los umbrales del docente
  type GradeFlag = {
    kind: "nota_periodo" | "nota_final";
    enrollmentId: string;
    subjectId: string;
    label: string;
    value: number;
    threshold: number;
    key: string;
  };
  const gradeFlags: GradeFlag[] = [];

  const { data: yearData } = await supabase.from("academic_years").select("*").eq("status", "abierto");
  const years = (yearData ?? []) as AcademicYear[];
  if (years.length > 0) {
    const yearIds = years.map((y) => y.id);
    const [{ data: periodData }, { data: courseData }, { data: enrollData }] = await Promise.all([
      supabase.from("periods").select("*").in("academic_year_id", yearIds),
      supabase.from("courses").select("*").in("academic_year_id", yearIds).is("deleted_at", null),
      supabase.from("enrollments").select("*").in("academic_year_id", yearIds).eq("status", "activa"),
    ]);
    const periods = (periodData ?? []) as Period[];
    const courses = (courseData ?? []) as Course[];
    const enrollments = (enrollData ?? []) as Enrollment[];
    const courseIds = courses.map((c) => c.id);

    const { data: subjectData } = courseIds.length
      ? await supabase.from("course_subjects").select("*").in("course_id", courseIds).is("deleted_at", null)
      : { data: [] };
    const subjects = (subjectData ?? []) as CourseSubject[];
    const subjectIds = subjects.map((s) => s.id);

    const { data: activityData } = subjectIds.length
      ? await supabase.from("activities").select("*").in("course_subject_id", subjectIds).is("deleted_at", null)
      : { data: [] };
    const activities = (activityData ?? []) as Activity[];
    const activityIds = activities.map((a) => a.id);
    const { data: gradeData } = activityIds.length
      ? await supabase.from("grades").select("*").in("activity_id", activityIds)
      : { data: [] };
    const grades = (gradeData ?? []) as Grade[];

    const gradesByEnrollment = new Map<string, Grade[]>();
    for (const g of grades) {
      const list = gradesByEnrollment.get(g.enrollment_id) ?? [];
      list.push(g);
      gradesByEnrollment.set(g.enrollment_id, list);
    }

    for (const enrollment of enrollments) {
      const year = years.find((y) => y.id === enrollment.academic_year_id);
      if (!year) continue;
      const yearPeriods = periods.filter((p) => p.academic_year_id === year.id).sort((a, b) => a.number - b.number);
      const periodMax = config.periodGradeMax ?? Number(year.pass_grade);
      const finalMax = config.finalGradeMax ?? Number(year.pass_grade);
      const mine = gradesByEnrollment.get(enrollment.id) ?? [];

      for (const subject of subjects.filter((s) => s.course_id === enrollment.course_id)) {
        const subjectActivities = activities.filter((a) => a.course_subject_id === subject.id);
        const byPeriod = new Map<number, number | null>();

        for (const period of yearPeriods) {
          const acts = subjectActivities.filter((a) => a.period_id === period.id);
          const own = gradeMap(mine.filter((g) => acts.some((a) => a.id === g.activity_id)));
          const result = periodGrade(acts, own);
          byPeriod.set(period.number, result.value);
          // Solo se alerta con la nota del periodo cuando ya es confiable:
          // periodo cerrado o ya calificado el 100% de sus actividades.
          if (result.value !== null && result.value <= periodMax && (period.status === "cerrado" || result.complete)) {
            gradeFlags.push({
              kind: "nota_periodo",
              enrollmentId: enrollment.id,
              subjectId: subject.id,
              label: period.name,
              value: result.value,
              threshold: periodMax,
              key: `gp:${enrollment.id}:${subject.id}:${period.number}:${result.value}`,
            });
          }
        }

        // Nota final: solo cuando todos los periodos ya tienen nota.
        const allGraded = yearPeriods.length > 0 && yearPeriods.every((p) => byPeriod.get(p.number) != null);
        if (allGraded) {
          const final = finalGrade(byPeriod, year.final_formula, yearPeriods);
          if (final !== null && final <= finalMax) {
            gradeFlags.push({
              kind: "nota_final",
              enrollmentId: enrollment.id,
              subjectId: subject.id,
              label: "Nota final",
              value: final,
              threshold: finalMax,
              key: `gf:${enrollment.id}:${subject.id}:${final}`,
            });
          }
        }
      }
    }
  }

  // Nombres de estudiantes y materias para redactar las alertas de faltas y notas.
  const flaggedEnrollmentIds = [
    ...new Set([...flaggedAbsences.map((c) => c.enrollmentId), ...gradeFlags.map((f) => f.enrollmentId)]),
  ];
  const flaggedSubjectIds = [
    ...new Set([...flaggedAbsences.map((c) => c.subjectId), ...gradeFlags.map((f) => f.subjectId)]),
  ];
  if (flaggedEnrollmentIds.length > 0) {
    const [{ data: enrollments }, { data: subjects }] = await Promise.all([
      supabase.from("enrollments").select("id, student_id").in("id", flaggedEnrollmentIds),
      supabase.from("course_subjects").select("id, name").in("id", flaggedSubjectIds),
    ]);
    const studentIds = [...new Set((enrollments ?? []).map((e) => e.student_id))];
    const { data: students } = studentIds.length
      ? await supabase.from("students").select("id, first_name, last_name").in("id", studentIds)
      : { data: [] };
    const studentByEnrollment = new Map(
      (enrollments ?? []).map((e) => {
        const s = (students ?? []).find((st) => st.id === e.student_id);
        return [e.id, { id: e.student_id, name: s ? `${s.first_name} ${s.last_name}` : "Estudiante" }];
      })
    );
    const subjectName = new Map((subjects ?? []).map((s) => [s.id, s.name]));

    for (const c of flaggedAbsences) {
      const student = studentByEnrollment.get(c.enrollmentId);
      if (!student) continue;
      drafts.push({
        kind: "inasistencia",
        title: `Inasistencias reiteradas: ${student.name}`,
        body: `${c.n} faltas sin excusa en ${subjectName.get(c.subjectId) ?? "una materia"}.`,
        link: `/dashboard/estudiantes/${student.id}`,
        dedupe_key: `abs:${c.enrollmentId}:${c.subjectId}:${Math.floor(c.n / step)}:${step}`,
      });
    }

    for (const f of gradeFlags) {
      const student = studentByEnrollment.get(f.enrollmentId);
      if (!student) continue;
      const subject = subjectName.get(f.subjectId) ?? "una materia";
      drafts.push({
        kind: f.kind,
        title:
          f.kind === "nota_final"
            ? `Nota final baja: ${student.name}`
            : `Nota baja en ${f.label}: ${student.name}`,
        body: `${subject}: ${f.value.toFixed(1)} (tu alerta es en ${f.threshold.toFixed(1)} o menos).`,
        link: `/dashboard/estudiantes/${student.id}`,
        dedupe_key: f.key,
      });
    }
  }

  if (drafts.length === 0) return;
  await supabase.from("notifications").upsert(
    drafts.map((d) => ({ ...d, teacher_id: profile.id })),
    { onConflict: "teacher_id,dedupe_key", ignoreDuplicates: true }
  );
}

export async function unreadNotificationCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("read", false);
  return count ?? 0;
}
