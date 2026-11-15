-- ProfeSync — esquema base (fase 1). Ejecutar en el editor SQL de Supabase,
-- en orden (001, 002, 003). Idempotente.
-- Todas las tablas llevan id uuid + created_at/updated_at (listas para offline).

create extension if not exists pgcrypto;

-- ==========================================================================
-- profiles: un perfil por usuario. Rol 'super_admin' (Nova Studio) o 'teacher'.
-- El login es por username; auth_email es el correo sintético interno.
-- Los límites y el vencimiento los fija el super admin (el cobro es externo).
-- ==========================================================================
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text not null,
  auth_email text not null unique,
  role text not null check (role in ('super_admin', 'teacher')),
  phone text,
  photo_url text,
  theme_color text,
  is_active boolean not null default true,
  plan_expires_at date,                       -- null = sin vencimiento
  max_institutions int not null default 1,
  max_courses int not null default 10,
  max_students int not null default 200,
  ai_enabled boolean not null default false,  -- reservado (IA futura)
  ai_monthly_quota int not null default 0,    -- reservado (IA futura)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Módulos activables por docente (WhatsApp, material, IA...). Escalable:
-- agregar una clave nueva no requiere cambios de esquema.
create table if not exists teacher_modules (
  teacher_id uuid not null references profiles (id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  primary key (teacher_id, module_key)
);

-- ==========================================================================
-- Estructura académica
-- ==========================================================================
create table if not exists institutions (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  name text not null,
  city text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists institutions_teacher_name_uq
  on institutions (teacher_id, lower(name)) where deleted_at is null;

create table if not exists academic_years (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  institution_id uuid not null references institutions (id) on delete cascade,
  year int not null check (year between 2000 and 2100),
  status text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  scale_min numeric(5,2) not null default 1.0,
  scale_max numeric(5,2) not null default 5.0,
  pass_grade numeric(5,2) not null default 3.0,
  -- Fórmula de la nota final: [{"period":1,"weight":25}, ...]
  final_formula jsonb not null default '[]'::jsonb,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, year)
);

create table if not exists periods (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  number int not null check (number between 1 and 6),
  name text not null,
  starts_on date,
  ends_on date,
  weight numeric(5,2) not null default 25 check (weight between 0 and 100),
  status text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, number)
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  grade text not null,              -- "6°", "Transición"...
  grade_order int not null default 0, -- para ordenar y promover al siguiente grado
  section text not null default 'A',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (academic_year_id, grade, section)
);

create table if not exists course_subjects (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  name text not null,
  weekly_hours int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, name)
);

-- ==========================================================================
-- Estudiantes (persona única del docente) y acudientes
-- ==========================================================================
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  document_number text,
  birth_date date,
  photo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists students_teacher_doc_uq
  on students (teacher_id, document_number)
  where document_number is not null and deleted_at is null;

create table if not exists guardians (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  full_name text not null,
  relationship text,
  whatsapp text,                    -- solo dígitos con indicativo, ej. 573001112233
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matrícula: estudiante ↔ curso ↔ año.
create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles (id) on delete cascade,
  student_id uuid not null references students (id) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  academic_year_id uuid not null references academic_years (id) on delete cascade,
  status text not null default 'activa'
    check (status in ('activa', 'aprobo', 'perdio', 'retirado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un estudiante, una sola matrícula por año (no dos cursos, no doble matrícula).
  unique (student_id, academic_year_id)
);
create index if not exists enrollments_course_idx on enrollments (course_id);

-- Coherencia: el curso debe pertenecer al año de la matrícula y al mismo docente.
create or replace function enrollments_check() returns trigger
language plpgsql as $$
declare c_year uuid; c_teacher uuid; s_teacher uuid; y_status text;
begin
  select academic_year_id, teacher_id into c_year, c_teacher from courses where id = new.course_id;
  select teacher_id into s_teacher from students where id = new.student_id;
  if c_year is distinct from new.academic_year_id then
    raise exception 'El curso no pertenece a ese año lectivo.';
  end if;
  if c_teacher is distinct from new.teacher_id or s_teacher is distinct from new.teacher_id then
    raise exception 'El estudiante y el curso deben ser del mismo docente.';
  end if;
  select status into y_status from academic_years where id = new.academic_year_id;
  if tg_op = 'INSERT' and y_status = 'cerrado' then
    raise exception 'El año lectivo está cerrado: no se pueden agregar matrículas.';
  end if;
  new.updated_at = now();
  return new;
end $$;
drop trigger if exists enrollments_check_trg on enrollments;
create trigger enrollments_check_trg before insert or update on enrollments
  for each row execute function enrollments_check();

-- ==========================================================================
-- Límites del plan (validados aquí, no solo en la interfaz)
-- ==========================================================================
create or replace function enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; n int;
begin
  select * into p from profiles where id = new.teacher_id;
  if p.role = 'super_admin' then return new; end if;
  if not p.is_active or (p.plan_expires_at is not null and p.plan_expires_at < current_date) then
    raise exception 'Tu plan no está activo. Contacta al proveedor del sistema.';
  end if;
  if tg_table_name = 'institutions' then
    select count(*) into n from institutions where teacher_id = new.teacher_id and deleted_at is null;
    if n >= p.max_institutions then
      raise exception 'Alcanzaste el máximo de instituciones de tu plan (%).', p.max_institutions;
    end if;
  elsif tg_table_name = 'courses' then
    select count(*) into n from courses where teacher_id = new.teacher_id and deleted_at is null;
    if n >= p.max_courses then
      raise exception 'Alcanzaste el máximo de cursos de tu plan (%).', p.max_courses;
    end if;
  elsif tg_table_name = 'students' then
    select count(*) into n from students where teacher_id = new.teacher_id and deleted_at is null;
    if n >= p.max_students then
      raise exception 'Alcanzaste el máximo de estudiantes de tu plan (%).', p.max_students;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists institutions_limit_trg on institutions;
create trigger institutions_limit_trg before insert on institutions
  for each row execute function enforce_plan_limits();
drop trigger if exists courses_limit_trg on courses;
create trigger courses_limit_trg before insert on courses
  for each row execute function enforce_plan_limits();
drop trigger if exists students_limit_trg on students;
create trigger students_limit_trg before insert on students
  for each row execute function enforce_plan_limits();

-- updated_at automático
create or replace function touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
do $$
declare t text;
begin
  foreach t in array array['profiles','institutions','academic_years','periods','courses',
    'course_subjects','students','guardians'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function touch_updated_at()', t, t);
  end loop;
end $$;
