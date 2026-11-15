"use server";

import { revalidatePath } from "next/cache";

import { requireActiveTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/db-errors";
import type { AcademicYear, Course, CourseSubject, Period } from "@/lib/supabase/types";

type Result = { error?: string; success?: string };

const key = (c: Pick<Course, "grade" | "section">) => `${c.grade.trim().toLowerCase()}|${c.section.trim().toLowerCase()}`;

/**
 * Prepara el año siguiente: lo crea (con la misma escala, periodos y fórmula)
 * si no existe, y copia los cursos y materias que aún no tenga. Sirve para
 * tener a dónde promover a los estudiantes.
 */
export async function prepareNextYear(yearId: string): Promise<Result> {
  const profile = await requireActiveTeacher();
  const supabase = await createClient();

  const { data: yearData } = await supabase.from("academic_years").select("*").eq("id", yearId).single();
  if (!yearData) return { error: "Año lectivo no encontrado" };
  const year = yearData as AcademicYear;
  const nextNumber = year.year + 1;

  const { data: nextData } = await supabase
    .from("academic_years")
    .select("*")
    .eq("institution_id", year.institution_id)
    .eq("year", nextNumber)
    .maybeSingle();
  let next = nextData as AcademicYear | null;
  if (next?.status === "cerrado") return { error: `El año ${nextNumber} ya está cerrado.` };

  if (!next) {
    const { data: periodData } = await supabase.from("periods").select("*").eq("academic_year_id", year.id).order("number");
    const periods = (periodData ?? []) as Period[];
    const { data: created, error } = await supabase
      .from("academic_years")
      .insert({
        teacher_id: profile.id,
        institution_id: year.institution_id,
        year: nextNumber,
        scale_min: year.scale_min,
        scale_max: year.scale_max,
        pass_grade: year.pass_grade,
        final_formula: year.final_formula,
      })
      .select("*")
      .single();
    if (error || !created) {
      return { error: friendlyDbError(error, "prepareNextYear:year", "No se pudo crear el año siguiente") };
    }
    next = created as AcademicYear;
    const { error: periodsError } = await supabase.from("periods").insert(
      periods.map((p) => ({
        teacher_id: profile.id,
        academic_year_id: next!.id,
        number: p.number,
        name: p.name,
        weight: p.weight,
      }))
    );
    if (periodsError) {
      await supabase.from("academic_years").delete().eq("id", next.id);
      return { error: friendlyDbError(periodsError, "prepareNextYear:periods", "No se pudieron crear los periodos") };
    }
  }

  // Cursos y materias que faltan en el año siguiente.
  const [{ data: courseData }, { data: nextCourseData }] = await Promise.all([
    supabase.from("courses").select("*").eq("academic_year_id", year.id).is("deleted_at", null),
    supabase.from("courses").select("*").eq("academic_year_id", next.id).is("deleted_at", null),
  ]);
  const courses = (courseData ?? []) as Course[];
  const existing = new Set(((nextCourseData ?? []) as Course[]).map(key));
  const missing = courses.filter((c) => !existing.has(key(c)));

  if (missing.length > 0) {
    const { data: createdCourses, error: coursesError } = await supabase
      .from("courses")
      .insert(
        missing.map((c) => ({
          teacher_id: profile.id,
          academic_year_id: next!.id,
          grade: c.grade,
          grade_order: c.grade_order,
          section: c.section,
        }))
      )
      .select("*");
    if (coursesError || !createdCourses) {
      return {
        error: friendlyDbError(coursesError, "prepareNextYear:courses", "No se pudieron copiar los cursos"),
      };
    }
    const newByKey = new Map((createdCourses as Course[]).map((c) => [key(c), c.id]));

    const { data: subjectData } = await supabase
      .from("course_subjects")
      .select("*")
      .in("course_id", missing.map((c) => c.id))
      .is("deleted_at", null);
    const subjectRows = ((subjectData ?? []) as CourseSubject[])
      .map((s) => {
        const source = missing.find((c) => c.id === s.course_id);
        const target = source ? newByKey.get(key(source)) : undefined;
        return target
          ? { teacher_id: profile.id, course_id: target, name: s.name, weekly_hours: s.weekly_hours }
          : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
    if (subjectRows.length > 0) {
      const { error: subjectsError } = await supabase.from("course_subjects").insert(subjectRows);
      if (subjectsError) {
        return { error: friendlyDbError(subjectsError, "prepareNextYear:subjects", "Se copiaron los cursos, pero no las materias") };
      }
    }
  }

  revalidatePath("/dashboard", "layout");
  return {
    success:
      missing.length > 0
        ? `Año ${nextNumber} listo: ${missing.length} curso(s) con sus materias copiados.`
        : `El año ${nextNumber} ya tenía todos los cursos.`,
  };
}

export type CloseDecision = {
  enrollment_id: string;
  result: "aprobo" | "perdio";
  destination_course_id: string | null;
};

/** Cierra el año de forma atómica: resultados, matrículas del año siguiente y congelamiento. */
export async function closeAcademicYear(
  yearId: string,
  failLimit: number,
  decisions: CloseDecision[]
): Promise<Result> {
  await requireActiveTeacher();
  if (!Number.isInteger(failLimit) || failLimit < 1) return { error: "La regla de materias perdidas no es válida" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_academic_year", {
    p_year: yearId,
    p_limit: failLimit,
    p_decisions: decisions,
  });
  if (error) {
    return {
      error: friendlyDbError(error, "closeAcademicYear", "No se pudo cerrar el año", {
        "23505": "Un estudiante ya está matriculado en el año siguiente. Recarga la página y revisa los destinos.",
      }),
    };
  }
  revalidatePath("/dashboard", "layout");
  return { success: "Año cerrado" };
}
