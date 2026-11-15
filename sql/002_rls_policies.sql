-- ProfeSync — seguridad por filas (RLS). Ejecutar después de 001.

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;

-- Plan vigente: activo y no vencido. Con el plan vencido el docente queda en
-- SOLO LECTURA (puede ver y exportar, no escribir).
create or replace function plan_is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and (role = 'super_admin'
           or (is_active and (plan_expires_at is null or plan_expires_at >= current_date)))
  );
$$;

-- El docente no puede cambiar sus propios límites/plan/rol: solo el super admin.
create or replace function protect_profile_columns() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_super_admin() or auth.uid() is null then return new; end if;
  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.plan_expires_at is distinct from old.plan_expires_at
     or new.max_institutions is distinct from old.max_institutions
     or new.max_courses is distinct from old.max_courses
     or new.max_students is distinct from old.max_students
     or new.ai_enabled is distinct from old.ai_enabled
     or new.ai_monthly_quota is distinct from old.ai_monthly_quota
     or new.username is distinct from old.username
     or new.auth_email is distinct from old.auth_email then
    raise exception 'No puedes modificar esos datos de tu cuenta.';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_trg on profiles;
create trigger profiles_protect_trg before update on profiles
  for each row execute function protect_profile_columns();

alter table profiles enable row level security;
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (id = auth.uid() or is_super_admin());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (id = auth.uid() or is_super_admin())
  with check (id = auth.uid() or is_super_admin());
drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles for all
  using (is_super_admin()) with check (is_super_admin());

alter table teacher_modules enable row level security;
drop policy if exists teacher_modules_select on teacher_modules;
create policy teacher_modules_select on teacher_modules for select
  using (teacher_id = auth.uid() or is_super_admin());
drop policy if exists teacher_modules_admin on teacher_modules;
create policy teacher_modules_admin on teacher_modules for all
  using (is_super_admin()) with check (is_super_admin());

-- Tablas del docente: lee lo suyo siempre (también vencido); escribe solo con plan vigente.
do $$
declare t text;
begin
  foreach t in array array['institutions','academic_years','periods','courses',
    'course_subjects','students','guardians','enrollments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('create policy %I_select on %I for select using (teacher_id = auth.uid() or is_super_admin())', t, t);
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format('create policy %I_write on %I for all using (teacher_id = auth.uid() and plan_is_active()) with check (teacher_id = auth.uid() and plan_is_active())', t, t);
  end loop;
end $$;
