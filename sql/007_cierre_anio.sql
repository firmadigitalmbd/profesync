-- ProfeSync — fase 4: cierre de año y promoción.
-- Ejecutar después de 001-006. Idempotente.

-- Regla con la que se cerró el año: pierde con N o más materias perdidas.
alter table academic_years add column if not exists fail_subjects_limit int;

-- Un año cerrado queda congelado también para la asistencia.
create or replace function attendance_check() returns trigger
language plpgsql as $$
declare s_course uuid; e_course uuid; s_teacher uuid; y_status text;
begin
  select course_id, teacher_id into s_course, s_teacher from course_subjects where id = new.course_subject_id;
  select course_id into e_course from enrollments where id = new.enrollment_id;
  if s_course is distinct from e_course or s_teacher is distinct from new.teacher_id then
    raise exception 'El estudiante no pertenece al curso de esta materia.';
  end if;
  select y.status into y_status
    from courses c join academic_years y on y.id = c.academic_year_id where c.id = s_course;
  if y_status = 'cerrado' then
    raise exception 'El año lectivo está cerrado: no se puede cambiar la asistencia.';
  end if;
  new.updated_at = now();
  return new;
end $$;

-- Cierra el año de forma atómica (todo o nada):
--  * marca cada matrícula como aprobó/perdió,
--  * matricula en el año siguiente a quien tenga curso destino,
--  * cierra los periodos y el año.
-- p_decisions: [{ "enrollment_id": uuid, "result": "aprobo"|"perdio", "destination_course_id": uuid|null }]
-- Se ejecuta con los permisos del docente (RLS aplica).
create or replace function close_academic_year(p_year uuid, p_limit int, p_decisions jsonb)
returns void
language plpgsql as $$
declare
  y academic_years%rowtype;
  d jsonb;
  e enrollments%rowtype;
  dest courses%rowtype;
begin
  select * into y from academic_years where id = p_year;
  if not found then raise exception 'Año lectivo no encontrado.'; end if;
  if y.teacher_id <> auth.uid() then raise exception 'No autorizado.'; end if;
  if y.status = 'cerrado' then raise exception 'Este año ya está cerrado.'; end if;
  if p_limit is null or p_limit < 1 then raise exception 'La regla de materias perdidas no es válida.'; end if;

  for d in select * from jsonb_array_elements(coalesce(p_decisions, '[]'::jsonb)) loop
    select * into e from enrollments
      where id = (d ->> 'enrollment_id')::uuid and academic_year_id = p_year and status = 'activa';
    if not found then raise exception 'Hay una matrícula que ya no está activa en este año. Recarga la página.'; end if;
    if (d ->> 'result') not in ('aprobo', 'perdio') then raise exception 'Resultado inválido.'; end if;

    update enrollments set status = d ->> 'result' where id = e.id;

    if nullif(d ->> 'destination_course_id', '') is not null then
      select * into dest from courses
        where id = (d ->> 'destination_course_id')::uuid and deleted_at is null;
      if not found or dest.teacher_id <> y.teacher_id then raise exception 'Curso destino inválido.'; end if;
      if dest.academic_year_id = p_year then raise exception 'El curso destino debe ser de otro año lectivo.'; end if;
      insert into enrollments (teacher_id, student_id, course_id, academic_year_id)
        values (e.teacher_id, e.student_id, dest.id, dest.academic_year_id);
    end if;
  end loop;

  if exists (select 1 from enrollments where academic_year_id = p_year and status = 'activa') then
    raise exception 'Faltan estudiantes por decidir: todos deben quedar con resultado.';
  end if;

  update periods set status = 'cerrado' where academic_year_id = p_year and status <> 'cerrado';
  update academic_years
    set status = 'cerrado', closed_at = now(), fail_subjects_limit = p_limit
    where id = p_year;
end $$;
