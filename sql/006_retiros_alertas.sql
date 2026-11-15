-- ProfeSync — retiros con motivo/informe y alertas parametrizables.
-- Ejecutar después de 001-005. Idempotente.

-- Datos del retiro de un estudiante (la matrícula queda con estado 'retirado').
alter table enrollments add column if not exists withdrawn_on date;
alter table enrollments add column if not exists withdrawn_reason text;
alter table enrollments add column if not exists withdrawn_note text;
-- Ruta del PDF del informe de retiro en el bucket "media" (<teacher_id>/retiros/...).
alter table enrollments add column if not exists withdrawn_report_path text;

-- Parámetros de las alertas de cada docente. Una fila por docente.
-- grade_* en null = usar la nota para aprobar de cada año lectivo.
create table if not exists alert_settings (
  teacher_id uuid primary key references profiles (id) on delete cascade,
  absence_step int not null default 3 check (absence_step between 1 and 30),
  period_grade_max numeric(5, 2),
  final_grade_max numeric(5, 2),
  updated_at timestamptz not null default now()
);

alter table alert_settings enable row level security;
drop policy if exists alert_settings_select on alert_settings;
create policy alert_settings_select on alert_settings for select
  using (teacher_id = auth.uid() or is_super_admin());
drop policy if exists alert_settings_write on alert_settings;
create policy alert_settings_write on alert_settings for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
