-- Optimized pipeline creates thumbnails before human review.
-- Finalization may therefore move awaiting_review directly to confirmed.
create or replace function private.validate_examination_status_transition()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if (old.status = 'draft' and new.status in ('uploading', 'analysis_failed'))
    or (old.status = 'uploading' and new.status in ('analyzing', 'analysis_failed'))
    or (old.status = 'analyzing' and new.status in ('awaiting_review', 'analysis_failed'))
    or (old.status = 'awaiting_review' and new.status in ('thumbnailing', 'confirmed', 'thumbnail_failed', 'analysis_failed'))
    or (old.status = 'thumbnailing' and new.status in ('confirmed', 'thumbnail_failed'))
    or (old.status = 'analysis_failed' and new.status = 'uploading')
    or (old.status = 'thumbnail_failed' and new.status = 'thumbnailing') then
    return new;
  end if;

  raise exception 'invalid examination status transition: % -> %', old.status, new.status using errcode = '22023';
end;
$$;
