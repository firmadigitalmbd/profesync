import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm, Field } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { isPlanActive, requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAcademicYear, createInstitution, deleteInstitution } from "@/lib/actions/docente";
import { updatePeriodWeights } from "@/lib/actions/notas";
import type { AcademicYear, Institution, Period } from "@/lib/supabase/types";

export default async function InstitucionesPage() {
  const profile = await requireRole("teacher");
  const editable = isPlanActive(profile);
  const supabase = await createClient();

  const [{ data: instData }, { data: yearData }, { data: periodData }] = await Promise.all([
    supabase.from("institutions").select("*").is("deleted_at", null).order("name"),
    supabase.from("academic_years").select("*").order("year", { ascending: false }),
    supabase.from("periods").select("*").order("number"),
  ]);
  const institutions = (instData ?? []) as Institution[];
  const years = (yearData ?? []) as AcademicYear[];
  const periods = (periodData ?? []) as Period[];
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Instituciones y años lectivos</h1>
        <p className="text-sm text-brand-muted">
          Tienes {institutions.length} de {profile.max_institutions} instituciones permitidas por tu plan.
        </p>
      </div>

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva institución</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createInstitution} submitLabel="Agregar institución" className="sm:flex-row sm:items-end">
              <Field label="Nombre" className="flex-1">
                <Input name="name" required />
              </Field>
              <Field label="Ciudad (opcional)" className="flex-1">
                <Input name="city" />
              </Field>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      {institutions.map((inst) => {
        const instYears = years.filter((y) => y.institution_id === inst.id);
        return (
          <Card key={inst.id}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>{inst.name}</CardTitle>
                {inst.city && <CardDescription>{inst.city}</CardDescription>}
              </div>
              {editable && (
                <ConfirmButton
                  action={deleteInstitution.bind(null, inst.id)}
                  message={`¿Eliminar la institución "${inst.name}"?`}
                  variant="outline"
                  size="sm"
                >
                  Eliminar
                </ConfirmButton>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {instYears.length === 0 && <p className="text-sm text-brand-muted">Aún no tiene años lectivos.</p>}
              {instYears.map((y) => (
                <div key={y.id} className="rounded-[var(--radius-brand-sm)] border border-brand-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-brand-ink">Año {y.year}</p>
                    <Badge className={y.status === "cerrado" ? "opacity-60" : ""}>
                      {y.status === "cerrado" ? "Cerrado" : "Abierto"}
                    </Badge>
                    <span className="text-xs text-brand-muted">
                      Escala {y.scale_min}–{y.scale_max} · aprueba con {y.pass_grade}
                    </span>
                  </div>
                  <p className="mt-1 text-xs">
                    <Link href={`/dashboard/cierre/${y.id}`} className="font-medium text-brand-dark underline">
                      {y.status === "cerrado" ? "Ver resultados del año" : "Cerrar año y promover estudiantes"}
                    </Link>
                  </p>
                  <ul className="mt-2 flex flex-wrap gap-2 text-xs text-brand-muted">
                    {periods
                      .filter((p) => p.academic_year_id === y.id)
                      .map((p) => (
                        <li key={p.id} className="rounded-full bg-black/5 px-2 py-1">
                          {p.name} · {p.weight}% {p.status === "cerrado" ? "🔒" : ""}
                        </li>
                      ))}
                  </ul>
                  {editable && y.status === "abierto" && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-brand-dark">
                        Editar fórmula de la nota final (peso de cada periodo)
                      </summary>
                      <ActionForm
                        action={updatePeriodWeights.bind(null, y.id)}
                        submitLabel="Guardar fórmula"
                        resetOnSuccess={false}
                        className="mt-2"
                      >
                        <div className="flex flex-col gap-2">
                          {periods
                            .filter((p) => p.academic_year_id === y.id)
                            .map((p) => (
                              <div key={p.id} className="grid items-end gap-2 sm:grid-cols-[1fr_6rem_9rem_9rem]">
                                <span className="text-sm font-medium text-brand-ink">{p.name}</span>
                                <Field label="Peso %">
                                  <Input name={`w_${p.id}`} inputMode="decimal" defaultValue={String(p.weight)} required />
                                </Field>
                                <Field label="Inicia">
                                  <Input name={`start_${p.id}`} type="date" defaultValue={p.starts_on ?? ""} />
                                </Field>
                                <Field label="Termina">
                                  <Input name={`end_${p.id}`} type="date" defaultValue={p.ends_on ?? ""} />
                                </Field>
                              </div>
                            ))}
                        </div>
                        <p className="text-xs text-brand-muted">
                          Los pesos deben sumar 100%. Las fechas son opcionales: con ellas el sistema te avisa cuando un
                          periodo está por terminar y cuenta las faltas del boletín por periodo.
                        </p>
                      </ActionForm>
                    </details>
                  )}
                </div>
              ))}

              {editable && (
                <details className="rounded-[var(--radius-brand-sm)] border border-dashed border-brand-border p-3">
                  <summary className="cursor-pointer text-sm font-medium text-brand-dark">+ Nuevo año lectivo</summary>
                  <ActionForm
                    action={createAcademicYear.bind(null, inst.id)}
                    submitLabel="Crear año"
                    className="mt-3 grid gap-3 sm:grid-cols-3"
                    resetOnSuccess={false}
                  >
                    <Field label="Año">
                      <Input name="year" type="number" defaultValue={currentYear} required />
                    </Field>
                    <Field label="Número de periodos">
                      <Input name="periods" type="number" min={2} max={6} defaultValue={4} required />
                    </Field>
                    <Field label="Nota para aprobar">
                      <Input name="passGrade" defaultValue="3.0" required />
                    </Field>
                    <Field label="Escala: mínima">
                      <Input name="scaleMin" defaultValue="1.0" required />
                    </Field>
                    <Field label="Escala: máxima">
                      <Input name="scaleMax" defaultValue="5.0" required />
                    </Field>
                  </ActionForm>
                </details>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
