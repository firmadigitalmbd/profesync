import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherForm } from "@/components/superadmin/teacher-form";
import { createTeacher } from "@/lib/actions/superadmin";

export default function NewTeacherPage() {
  return (
    <div className="flex flex-col gap-4">
      <Link href="/superadmin" className="text-sm text-brand-muted hover:underline">
        ← Volver
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo docente</CardTitle>
        </CardHeader>
        <CardContent>
          <TeacherForm action={createTeacher} />
        </CardContent>
      </Card>
    </div>
  );
}
