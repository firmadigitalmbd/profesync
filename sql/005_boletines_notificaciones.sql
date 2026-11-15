-- ProfeSync — fase 3: registro de boletines enviados y notificaciones.
-- Ejecutar después de 001-004. Idempotente.

-- Cada vez que el docente descarga o envía un boletín queda constancia.
create table if not exists bulletin_sends (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  enrollment_id uuid not null references enrollments (id) on delete cascade,
  period_number int,                       -- null = boletín final del año
  guardian_id uuid references guardians (id) on delete set null,
  channel text not null check (channel in ('whatsapp_compartir', 'whatsapp_enlace', 'descarga')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists bulletin_sends_enrollment_idx on bulletin_sends (enrollment_id, created_at desc);

-- Notificaciones del docente (alertas generadas por el sistema).
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text not null,                -- evita repetir la misma alerta
  read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (teacher_id, dedupe_key)
);
create index if not exists notifications_teacher_idx on notifications (teacher_id, read, created_at desc);

alter table bulletin_sends enable row level security;
drop policy if exists bulletin_sends_select on bulletin_sends;
create policy bulletin_sends_select on bulletin_sends for select
  using (teacher_id = auth.uid() or is_super_admin());
drop policy if exists bulletin_sends_write on bulletin_sends;
create policy bulletin_sends_write on bulletin_sends for all
  using (teacher_id = auth.uid() and plan_is_active())
  with check (teacher_id = auth.uid() and plan_is_active());

-- Notificaciones: se pueden leer y marcar como leídas aunque el plan esté vencido.
alter table notifications enable row level security;
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select
  using (teacher_id = auth.uid() or is_super_admin());
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert
  with check (teacher_id = auth.uid());
drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications for delete
  using (teacher_id = auth.uid());
