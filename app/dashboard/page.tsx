import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, BookOpen, School, Users } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { isPlanActive, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { syncNotifications } from "@/lib/notifications";

export default async function DashboardPage() {
  const profile = await requireProfile();
  if (profile.role === "super_admin") redirect("/superadmin");

  await syncNotifications(profile);
  const supabase = await createClient();
  const count = (table: "institutions" | "courses" | "students") =>
    supabase.from(table).select("id", { count: "exact", head: true }).is("deleted_at", null);
  const [inst, courses, students] = await Promise.all([count("institutions"), count("courses"), count("students")]);
  const active = isPlanActive(profile);

  const stats = [
    { label: "Instituciones", value: inst.count ?? 0, max: profile.max_institutions, icon: School, href: "/dashboard/instituciones" },
    { label: "Cursos", value: courses.count ?? 0, max: profile.max_courses, icon: BookOpen, href: "/dashboard/cursos" },
    { label: "Estudiantes", value: students.count ?? 0, max: profile.max_students, icon: Users, href: "/dashboard/estudiantes" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-brand-ink">Hola, {profile.full_name.split(" ")[0]}</h1>
        <p className="text-sm text-brand-muted">Este es el resumen de tu espacio en ProfeSync.</p>
      </div>

      {!active && (
        <div className="flex items-start gap-3 rounded-[var(--radius-brand-md)] border border-brand-danger/30 bg-brand-danger/10 p-4 text-sm text-brand-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Tu plan no está activo
            {profile.plan_expires_at ? ` (venció el ${profile.plan_expires_at})` : ""}. Puedes consultar tu información,
            pero no registrar cambios. Comunícate con el proveedor para reactivarlo.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, max, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand-dark">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-2xl font-semibold text-brand-ink">
                    {value}
                    <span className="text-sm font-normal text-brand-muted"> / {max}</span>
                  </p>
                  <p className="text-sm text-brand-muted">{label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {profile.plan_expires_at && active && (
        <p className="text-xs text-brand-muted">Tu plan está activo hasta el {profile.plan_expires_at}.</p>
      )}
    </div>
  );
}
