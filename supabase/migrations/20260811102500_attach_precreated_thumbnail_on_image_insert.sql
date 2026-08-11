create or replace function private.attach_precreated_thumbnail_reference()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_user_id uuid;
  v_path text;
begin
  if new.thumbnail_path is not null then
    return new;
  end if;

  select e.user_id into v_user_id
  from public.examinations e
  where e.id = new.examination_id;

  if v_user_id is null then
    return new;
  end if;

  v_path := v_user_id::text || '/' || new.examination_id::text || '/' || replace(new.position::text, '_', '-') || '.webp';

  if exists (
    select 1 from storage.objects o
    where o.bucket_id = 'dm-foot-thumbnails' and o.name = v_path
  ) then
    new.thumbnail_path := v_path;
    new.thumbnail_metadata := coalesce(new.thumbnail_metadata, '{}'::jsonb)
      || jsonb_build_object('linkedAt', now(), 'source', 'precreated-private-thumbnail');
  end if;

  return new;
end;
$$;

drop trigger if exists examination_images_attach_precreated_thumbnail on public.examination_images;
create trigger examination_images_attach_precreated_thumbnail
before insert on public.examination_images
for each row
execute function private.attach_precreated_thumbnail_reference();
