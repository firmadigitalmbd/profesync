import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Field, selectClasses } from "@/components/action-form";
import { BulletinRow } from "@/components/docente/bulletin-row";
import { isPlanActive, requireRole, signedMediaUrls } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadCourseBulletins } from "@/lib/boletin-data";
import type { AcademicYear, BulletinSend, Course, Institution } from "@/lib/supabase/types";

export default async function BoletinesPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string; period?: string }>;
}) {
  const profile = await requireRole("teacher");
  const editable = isPlanActive(profile);
  const supabase = await createClient();
  const sp = await searchParams;

  const [{ data: courseData }, { data: yearData }, { data: instData }] = await Promise.all([
    supabase.from("courses").select("*").is("deleted_at", null).order("grade_order"),
    supabase.from("academic_years").select("*").order("year", { ascending: false }),
    supabase.from("institutions").select("*"),
  ]);
  const years = (yearData ?? []) as AcademicYear[];
  const institutions = (instData ?? []) as Institution[];
  const courses = ((courseData ?? []) as Course[]).sort((a, b) => {
    const ya = years.find((y) => y.id === a.academic_year_id);
    const yb = years.find((y) => y.id === b.academic_year_id);
    return Number(yb?.status === "abierto") - Number(ya?.status === "abierto") || (yb?.year ?? 0) - (ya?.year ?? 0);
  });

  const labelOf = (c: Course) => {
    const y = years.find((year) => year.id === c.academic_year_id);
    const inst = institutions.find((i) => i.id === y?.institution_id);
    return `${c.grade} ${c.section} · ${inst?.name ?? ""} ${y?.year ?? ""}`;
  };

  if (courses.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-brand-ink">Boletines</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-brand-muted">
            Aún no tienes cursos.{" "}
            <Link href="/dashboard/cursos" className="font-medium text-brand-dark underline">
              Crear cursos
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  const courseId = courses.find((c) => c.id === sp.course)?.id ?? courses[0].id;
  let periodNumber: number | null;
  if (sp.period === "final") {
    periodNumber = null;
  } else if (Number(sp.period) > 0) {
    periodNumber = Number(sp.period);
  } else {
    // Periodo por defecto: el primero abierto (o el último).
    const { data: yearPeriods } = await supabase
      .from("periods")
      .select("number, status")
      .eq("academic_year_id", courses.find((c) => c.id === courseId)!.academic_year_id)
      .order("number");
    periodNumber = yearPeriods?.find((p) => p.status === "abierto")?.number ?? yearPeriods?.at(-1)?.number ?? 1;
  }
  const data = await loadCourseBulletins(courseId, periodNumber);
  if (!data) return <p className="text-sm text-brand-muted">No se pudo cargar el curso.</p>;

  const photos = await signedMediaUrls(data.students.map((s) => s.photoPath));

  const enrollmentIds = data.students.map((s) => s.enrollmentId);
  const { data: sendData } = enrollmentIds.length
    ? await supabase.from("bulletin_sends").select("*").in("enrollment_id", enrollmentIds).order("created_at", { ascending: false })
    : { data: [] };
  const sends = (sendData ?? []) as BulletinSend[];
  const sentLabel = (enrollmentId: string) => {
    const send = sends.find(
      (s) => s.enrollment_id === enrollmentId && s.period_number === data.periodNumber && s.channel !== "descarga"
    );
    return send ? new Date(send.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : null;
  };

  const selectedPeriod = data.periodNumber === null ? "final" : String(data.periodNumber);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Boletines</h1>
        <p className="text-sm text-brand-muted">
          Descarga el boletín en PDF o envíalo al acudiente por WhatsApp. En el celular el PDF va adjunto; en el
          computador se descarga y se abre el chat.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <Field label="Curso" className="min-w-[240px] flex-1">
          <select name="course" defaultValue={courseId} className={selectClasses}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {labelOf(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Periodo" className="w-48">
          <select name="period" defaultValue={selectedPeriod} className={selectClasses}>
            {data.periods.map((p) => (
              <option key={p.id} value={p.number}>
                {p.name}
              </option>
            ))}
            <option value="final">Nota final del año</option>
          </select>
        </Field>
        <button className="h-10 rounded-[var(--radius-brand-sm)] border border-brand-border px-4 text-sm hover:bg-black/5">
          Ver
        </button>
      </form>

      {data.students.length === 0 ? (
        <p className="text-sm text-brand-muted">Este curso aún no tiene estudiantes matriculados.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.students.map((s) => (
            <BulletinRow
              key={`${s.enrollmentId}:${selectedPeriod}`}
              enrollmentId={s.enrollmentId}
              periodNumber={data.periodNumber}
              listName={s.name}
              student={{ name: s.displayName, document: s.document, rows: s.rows, average: s.average }}
              photoUrl={s.photoPath ? photos.get(s.photoPath) ?? null : null}
              guardians={s.guardians}
              sentAt={sentLabel(s.enrollmentId)}
              readOnly={!editable}
              header={{
                institution: data.institution,
                courseLabel: data.courseLabel,
                year: data.year,
                periodLabel: data.periodLabel,
                teacherName: profile.full_name,
                pass: data.scale.pass,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
