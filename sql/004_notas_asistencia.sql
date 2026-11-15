-- ProfeSync — fase 2: actividades, notas, asistencia y observador.
-- Ejecutar después de 001-003. Idempotente.

-- ==========================================================================
-- Actividades de una materia en un periodo, con peso (%) libre
-- ==========================================================================
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  course_subject_id uuid not null references course_subjects (id) on delete cascade,
  period_id uuid not null references periods (id) on delete cascade,
  name text not null,
  weight numeric(5,2) not null check (weight > 0 and weight <= 100),
  activity_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists activities_subject_period_idx on activities (course_subject_id, period_id);

-- ==========================================================================
-- Notas (una por actividad y matrícula) + historial de cambios
-- ==========================================================================
create table if not exists grades (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  activity_id uuid not null references activities (id) on delete cascade,
  enrollment_id uuid not null references enrollments (id) on delete cascade,
  value numeric(6,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, enrollment_id)
);
create index if not exists grades_enrollment_idx on grades (enrollment_id);

create table if not exists grade_history (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null,
  grade_id uuid,
  activity_id uuid not null,
  enrollment_id uuid not null,
  old_value numeric(6,2),
  new_value numeric(6,2),
  changed_at timestamptz not null default now()
);

-- Reglas: el periodo debe estar abierto; la nota debe caer en la escala del año;
-- la matrícula debe ser de la misma materia/curso y del mismo docente.
create or replace function activities_check() returns trigger
language plpgsql as $$
declare p_status text; p_year uuid; c_year uuid; s_teacher uuid; y_status text;
begin
  select status, academic_year_id into p_status, p_year from periods where id = new.period_id;
  select c.academic_year_id, s.teacher_id into c_year, s_teacher
    from course_subjects s join courses c on c.id = s.course_id where s.id = new.course_subject_id;
  if p_year is distinct from c_year then
    raise exception 'El periodo no corresponde al año de esa materia.';
  end if;
  if s_teacher is distinct from new.teacher_id then
    raise exception 'La materia no pertenece a este docente.';
  end if;
  select status into y_status from academic_years where id = p_year;
  if y_status = 'cerrado' or p_status = 'cerrado' then
    raise exception 'El periodo o el año está cerrado: no se pueden crear ni cambiar actividades.';
  end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists activities_check_trg on activities;
create trigger activities_check_trg before insert or update on activities
  for each row execute function activities_check();

create or replace function grades_check() returns trigger
language plpgsql as $$
declare a_course uuid; a_teacher uuid; a_period uuid; e_course uuid; e_teacher uuid;
        p_status text; y_status text; smin numeric; smax numeric;
begin
  select s.course_id, a.teacher_id, a.period_id into a_course, a_teacher, a_period
    from activities a join course_subjects s on s.id = a.course_subject_id where a.id = new.activity_id;
  select course_id, teacher_id into e_course, e_teacher from enrollments where id = new.enrollment_id;
  if a_course is distinct from e_course then
    raise exception 'El estudiante no está matriculado en el curso de esta actividad.';
  end if;
  if a_teacher is distinct from new.teacher_id or e_teacher is distinct from new.teacher_id then
    raise exception 'Datos de otro docente.';
  end if;
  select p.status, y.status, y.scale_min, y.scale_max into p_status, y_status, smin, smax
    from periods p join academic_years y on y.id = p.academic_year_id where p.id = a_period;
  if p_status = 'cerrado' or y_status = 'cerrado' then
    raise exception 'El periodo está cerrado: no se pueden cambiar notas.';
  end if;
  if new.value < smin or new.value > smax then
    raise exception 'La nota debe estar entre % y %.', smin, smax;
  end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists grades_check_trg on grades;
create trigger grades_check_trg before insert or update on grades
  for each row execute function grades_check();

create or replace function grades_history_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into grade_history (teacher_id, grade_id, activity_id, enrollment_id, old_value, new_value)
    values (new.teacher_id, new.id, new.activity_id, new.enrollment_id, null, new.value);
  elsif tg_op = 'UPDATE' and new.value is distinct from old.value then
    insert into grade_history (teacher_id, grade_id, activity_id, enrollment_id, old_value, new_value)
    values (new.teacher_id, new.id, new.activity_id, new.enrollment_id, old.value, new.value);
  elsif tg_op = 'DELETE' then
    insert into grade_history (teacher_id, grade_id, activity_id, enrollment_id, old_value, new_value)
    values (old.teacher_id, old.id, old.activity_id, old.enrollment_id, old.value, null);
    return old;
  end if;
  return new;
end $$;
drop trigger if exists grades_history_trg on grades;
create trigger grades_history_trg after insert or update or delete on grades
  for each row execute function grades_history_log();

-- ==========================================================================
-- Asistencia por materia y fecha
-- ==========================================================================
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  course_subject_id uuid not null references course_subjects (id) on delete cascade,
  enrollment_id uuid not null references enrollments (id) on delete cascade,
  attendance_date date not null,
  status text not null check (status in ('presente', 'tarde', 'excusa', 'falta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_subject_id, enrollment_id, attendance_date)
);
create index if not exists attendance_enrollment_idx on attendance (enrollment_id);

create or replace function attendance_check() returns trigger
language plpgsql as $$
declare s_course uuid; e_course uuid; s_teacher uuid;
begin
  select course_id, teacher_id into s_course, s_teacher from course_subjects where id = new.course_subject_id;
  select course_id into e_course from enrollments where id = new.enrollment_id;
  if s_course is distinct from e_course or s_teacher is distinct from new.teacher_id then
    raise exception 'El estudiante no pertenece al curso de esta materia.';
  end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists attendance_check_trg on attendance;
create trigger attendance_check_trg before insert or update on attendance
  for each row execute function attendance_check();

-- ==========================================================================
-- Observador / diario de campo por estudiante
-- ==========================================================================
create table if not exists observations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  kind text not null default 'convivencia'
    check (kind in ('convivencia', 'academico', 'compromiso', 'seguimiento', 'otro')),
  note text not null,
  commitment text,
  follow_up_on date,
  resolved boolean not null default false,
  observed_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists observations_student_idx on observations (student_id, observed_on desc);

-- updated_at y RLS
do $$
declare t text;
begin
  foreach t in array array['activities','grades','attendance','observations'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select using (teacher_id = auth.uid() or is_super_admin())', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_write on %I for all using (teacher_id = auth.uid() and plan_is_active()) with check (teacher_id = auth.uid() and plan_is_active())', t, t);
  end loop;
end $$;

alter table grade_history enable row level security;
drop policy if exists grade_history_select on grade_history;
create policy grade_history_select on grade_history for select
  using (teacher_id = auth.uid() or is_super_admin());

-- Los periodos y años: el docente puede editar pesos y cerrar/reabrir (ya cubierto
-- por la política periods_write de 002).
