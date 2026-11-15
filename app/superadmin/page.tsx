import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";

function planLabel(p: Profile): { text: string; ok: boolean } {
  if (!p.is_active) return { text: "Inactiva", ok: false };
  if (!p.plan_expires_at) return { text: "Activa (sin vencimiento)", ok: true };
  const today = new Date().toISOString().slice(0, 10);
  if (p.plan_expires_at < today) return { text: `Vencida el ${p.plan_expires_at}`, ok: false };
  return { text: `Activa hasta ${p.plan_expires_at}`, ok: true };
}

export default async function SuperAdminPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "teacher")
    .order("created_at", { ascending: false });
  const teachers = (data ?? []) as Profile[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-brand-ink">Docentes</h1>
          <p className="text-sm text-brand-muted">
            Active cuentas según los pagos que reciba. El cobro se maneja por fuera del sistema.
          </p>
        </div>
        <Button asChild>
          <Link href="/superadmin/docentes/nuevo">
            <Plus className="h-4 w-4" /> Nuevo docente
          </Link>
        </Button>
      </div>

      {teachers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-brand-muted">
            Aún no hay docentes. Cree el primero con «Nuevo docente».
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {teachers.map((t) => {
            const plan = planLabel(t);
            return (
              <Link key={t.id} href={`/superadmin/docentes/${t.id}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-brand-ink">{t.full_name}</p>
                      <p className="text-xs text-brand-muted">
                        @{t.username} · {t.max_institutions} inst. · {t.max_courses} cursos · {t.max_students} estudiantes
                      </p>
                    </div>
                    <Badge className={plan.ok ? "" : "opacity-70"}>{plan.text}</Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
