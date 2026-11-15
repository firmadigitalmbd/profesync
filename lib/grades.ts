import type { Activity, FinalFormulaItem, Grade, Period } from "@/lib/supabase/types";

/** Redondeo a 1 decimal (escala 1.0–5.0), igual que se usa en boletines. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Nota del periodo de un estudiante: promedio ponderado de las actividades que
 * ya tienen nota (los pesos se normalizan sobre lo calificado, así una
 * actividad aún sin calificar no hunde la nota). `complete` indica si ya están
 * calificadas actividades por el 100% del peso.
 */
export function periodGrade(
  activities: Pick<Activity, "id" | "weight">[],
  gradeByActivity: Map<string, number>
): { value: number | null; complete: boolean } {
  let weighted = 0;
  let weightSum = 0;
  for (const a of activities) {
    const v = gradeByActivity.get(a.id);
    if (v === undefined) continue;
    weighted += v * a.weight;
    weightSum += a.weight;
  }
  if (weightSum === 0) return { value: null, complete: false };
  return { value: round1(weighted / weightSum), complete: Math.abs(weightSum - 100) < 0.01 };
}

/**
 * Nota final del año: promedio ponderado de las notas de periodo con la
 * fórmula del año (por defecto el peso de cada periodo). Solo cuenta los
 * periodos que ya tienen nota.
 */
export function finalGrade(
  periodGrades: Map<number, number | null>,
  formula: FinalFormulaItem[],
  periods: Pick<Period, "number" | "weight">[]
): number | null {
  const weights = formula.length
    ? formula
    : periods.map((p) => ({ period: p.number, weight: p.weight }));
  let weighted = 0;
  let weightSum = 0;
  for (const { period, weight } of weights) {
    const v = periodGrades.get(period);
    if (v === null || v === undefined) continue;
    weighted += v * weight;
    weightSum += weight;
  }
  return weightSum === 0 ? null : round1(weighted / weightSum);
}

export function gradeMap(grades: Pick<Grade, "activity_id" | "value">[]): Map<string, number> {
  return new Map(grades.map((g) => [g.activity_id, Number(g.value)]));
}

/** Desempeño cualitativo según la escala del año (Bajo/Básico/Alto/Superior). */
export function performanceLabel(value: number | null, min: number, max: number, pass: number): string {
  if (value === null) return "—";
  if (value < pass) return "Bajo";
  const span = max - pass;
  const ratio = span > 0 ? (value - pass) / span : 1;
  if (ratio < 0.34) return "Básico";
  if (ratio < 0.67) return "Alto";
  return "Superior";
}
