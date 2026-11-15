-- ProfeSync — Storage. Bucket privado "media": fotos de docentes y estudiantes.
-- Ruta: "<teacher_id>/<archivo>". Cada docente solo accede a su carpeta.
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

drop policy if exists media_select on storage.objects;
create policy media_select on storage.objects for select
  using (bucket_id = 'media'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_super_admin()));

drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
