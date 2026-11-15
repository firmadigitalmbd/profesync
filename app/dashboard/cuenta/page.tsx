import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActionForm, Field } from "@/components/action-form";
import { PhotoInput } from "@/components/photo-input";
import { ThemeColorForm } from "@/components/cuenta/theme-color-form";
import { requireProfile, signedMediaUrl } from "@/lib/auth";
import { changeMyPassword, updateAlertSettings, updateMyProfile } from "@/lib/actions/docente";
import { loadAlertConfig } from "@/lib/notifications";

export default async function CuentaPage() {
  const profile = await requireProfile();
  const alerts = profile.role === "teacher" ? await loadAlertConfig() : null;
  const photoUrl = await signedMediaUrl(profile.photo_url);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-brand-ink">Mi cuenta</h1>

      <Card>
        <CardHeader>
          <CardTitle>Mi perfil</CardTitle>
          <CardDescription>Usuario: @{profile.username}</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateMyProfile} submitLabel="Guardar perfil" resetOnSuccess={false}>
            <PhotoInput currentUrl={photoUrl} label="Mi foto" />
            <Field label="Nombre completo">
              <Input name="fullName" defaultValue={profile.full_name} required />
            </Field>
            <Field label="WhatsApp / teléfono">
              <Input name="phone" defaultValue={profile.phone ?? ""} />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>

      <ThemeColorForm savedColor={profile.theme_color} />

      {alerts && (
        <Card>
          <CardHeader>
            <CardTitle>Mis alertas</CardTitle>
            <CardDescription>
              Tú decides cuándo te avisa el sistema. Las alertas llegan a la campana de Notificaciones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateAlertSettings} submitLabel="Guardar alertas" resetOnSuccess={false}>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Faltas sin excusa para alertar">
                  <Input name="absenceStep" type="number" min={1} max={30} defaultValue={alerts.absenceStep} required />
                </Field>
                <Field label="Nota de periodo menor o igual a">
                  <Input
                    name="periodGradeMax"
                    inputMode="decimal"
                    defaultValue={alerts.periodGradeMax ?? ""}
                    placeholder="Nota para aprobar"
                  />
                </Field>
                <Field label="Nota final menor o igual a">
                  <Input
                    name="finalGradeMax"
                    inputMode="decimal"
                    defaultValue={alerts.finalGradeMax ?? ""}
                    placeholder="Nota para aprobar"
                  />
                </Field>
              </div>
              <p className="text-xs text-brand-muted">
                Faltas: te avisa cada vez que un estudiante suma ese número de faltas sin excusa en una materia (3, 6, 9…).
                Notas: si dejas el campo vacío se usa la nota para aprobar de cada año lectivo. La alerta de periodo sale
                cuando el periodo está cerrado o ya calificaste todas sus actividades; la de nota final, cuando todos los
                periodos ya tienen nota.
              </p>
            </ActionForm>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={changeMyPassword} submitLabel="Actualizar contraseña">
            <Field label="Nueva contraseña">
              <Input name="password" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Confirmar contraseña">
              <Input name="confirmPassword" type="password" autoComplete="new-password" required />
            </Field>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
