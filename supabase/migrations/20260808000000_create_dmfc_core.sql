-- DM Foot Care core schema
-- Apply this migration only after reviewing it in the target Supabase project.
-- The app deliberately keeps original images in private Google Drive; Supabase stores thumbnails only.

create extension if not exists pgcrypto;

create schema if not exists private;

create type public.app_role as enum ('patient', 'doctor', 'admin');
create type public.account_status as enum ('active', 'inactive');
create type public.examination_status as enum ('draft', 'uploading', 'analyzing', 'awaiting_review', 'thumbnailing', 'confirmed', 'analysis_failed', 'thumbnail_failed');
create type public.image_position as enum ('left_dorsal', 'left_sole', 'right_dorsal', 'right_sole');
create type public.analysis_status as enum ('queued', 'running', 'validated', 'failed');
create type public.knowledge_status as enum ('draft', 'published', 'archived');

create sequence public.examination_code_seq as bigint start with 1;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username = upper(username) and length(username) between 3 and 32),
  date_of_birth date not null,
  occupation text not null default '',
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'patient',
  created_at timestamptz not null default now()
);

create table public.diseases (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^D[0-9]{3,}$'),
  name text not null,
  category text not null,
  description text not null default '',
  detection_criteria jsonb not null default '{}'::jsonb,
  care_instruction text not null default '',
  recommendation text not null default '',
  reference_image_path text,
  active boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, revision)
);

create table public.disease_severity_levels (
  id uuid primary key default gen_random_uuid(),
  disease_id uuid not null references public.diseases(id) on delete cascade,
  label text not null,
  rank smallint not null check (rank between 1 and 10),
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (disease_id, label),
  unique (disease_id, rank)
);

create table public.examinations (
  id uuid primary key default gen_random_uuid(),
  examination_code text not null unique default ('EX' || lpad(nextval('public.examination_code_seq')::text, 6, '0')),
  user_id uuid not null references auth.users(id) on delete restrict,
  status public.examination_status not null default 'draft',
  examined_at timestamptz,
  previous_examination_id uuid references public.examinations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('draft', 'uploading', 'analyzing', 'awaiting_review', 'thumbnailing', 'confirmed', 'analysis_failed', 'thumbnail_failed'))
);

create table public.examination_images (
  id uuid primary key default gen_random_uuid(),
  examination_id uuid not null references public.examinations(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  position public.image_position not null,
  drive_folder_id text not null,
  drive_file_id text not null,
  original_metadata jsonb not null default '{}'::jsonb,
  thumbnail_path text,
  thumbnail_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (examination_id, position),
  unique (drive_file_id)
);

create table public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  examination_id uuid not null references public.examinations(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 200),
  provider text not null,
  model text not null,
  disease_master_revision integer not null check (disease_master_revision > 0),
  status public.analysis_status not null default 'queued',
  raw_result jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (examination_id, idempotency_key)
);

create table public.ai_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_analysis_runs(id) on delete cascade,
  disease_id uuid not null references public.diseases(id) on delete restrict,
  disease_code_snapshot text not null,
  disease_name_snapshot text not null,
  detected boolean not null,
  suggested_severity_id uuid references public.disease_severity_levels(id) on delete restrict,
  suggested_severity_label_snapshot text,
  confidence numeric(5,4) check (confidence between 0 and 1),
  image_position public.image_position,
  created_at timestamptz not null default now(),
  unique (run_id, disease_id)
);

create table public.confirmed_findings (
  id uuid primary key default gen_random_uuid(),
  examination_id uuid not null references public.examinations(id) on delete cascade,
  disease_id uuid not null references public.diseases(id) on delete restrict,
  disease_code_snapshot text not null,
  disease_name_snapshot text not null,
  severity_id uuid references public.disease_severity_levels(id) on delete restrict,
  severity_label_snapshot text,
  ai_finding_id uuid references public.ai_findings(id) on delete set null,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  unique (examination_id, disease_id)
);

create table public.knowledge_articles (
  id uuid primary key default gen_random_uuid(),
  disease_id uuid references public.diseases(id) on delete set null,
  category text not null,
  severity_id uuid references public.disease_severity_levels(id) on delete set null,
  title text not null,
  summary text not null default '',
  body jsonb not null default '[]'::jsonb,
  image_path text,
  status public.knowledge_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check (event_type in (
    'login', 'logout', 'examination_created', 'image_uploaded',
    'ai_analysis_started', 'ai_analysis_completed', 'ai_result_recorded',
    'human_review_edited', 'final_result_submitted', 'disease_master_created',
    'disease_master_updated', 'user_created', 'user_updated'
  )),
  check (entity_type in ('session', 'examination', 'image', 'ai_analysis', 'finding', 'disease', 'user'))
);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Date validity is checked at write time rather than in a CHECK constraint;
-- CURRENT_DATE is intentionally dynamic and is not immutable.
create or replace function private.validate_profile_date_of_birth()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.date_of_birth > current_date then
    raise exception 'date_of_birth cannot be in the future' using errcode = '22007';
  end if;
  return new;
end;
$$;

create or replace function private.validate_examination_status_transition()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if (old.status = 'draft' and new.status in ('uploading', 'analysis_failed'))
    or (old.status = 'uploading' and new.status in ('analyzing', 'analysis_failed'))
    or (old.status = 'analyzing' and new.status in ('awaiting_review', 'analysis_failed'))
    or (old.status = 'awaiting_review' and new.status in ('thumbnailing', 'analysis_failed'))
    or (old.status = 'thumbnailing' and new.status in ('confirmed', 'thumbnail_failed'))
    or (old.status = 'analysis_failed' and new.status = 'uploading')
    or (old.status = 'thumbnail_failed' and new.status = 'thumbnailing') then
    return new;
  end if;

  raise exception 'invalid examination status transition: % -> %', old.status, new.status using errcode = '22023';
end;
$$;

create trigger profiles_validate_date_of_birth before insert or update on public.profiles for each row execute function private.validate_profile_date_of_birth();
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function private.touch_updated_at();
create trigger diseases_touch_updated_at before update on public.diseases for each row execute function private.touch_updated_at();
create trigger examinations_touch_updated_at before update on public.examinations for each row execute function private.touch_updated_at();
create trigger examinations_validate_status before update on public.examinations for each row execute function private.validate_examination_status_transition();
create trigger knowledge_touch_updated_at before update on public.knowledge_articles for each row execute function private.touch_updated_at();

create or replace function private.is_staff(requested_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select requested_user = (select auth.uid())
    and exists (
    select 1 from public.user_roles
    where user_id = requested_user and role in ('doctor'::public.app_role, 'admin'::public.app_role)
  );
$$;

revoke all on function private.is_staff(uuid) from public;
grant execute on function private.is_staff(uuid) to authenticated;
revoke all on function private.touch_updated_at() from public;
revoke all on function private.validate_profile_date_of_birth() from public;
revoke all on function private.validate_examination_status_transition() from public;

create index examinations_user_id_examined_at_idx on public.examinations (user_id, examined_at desc);
create index examination_images_exam_id_idx on public.examination_images (examination_id);
create index ai_analysis_runs_exam_id_idx on public.ai_analysis_runs (examination_id, created_at desc);
create index ai_findings_disease_id_idx on public.ai_findings (disease_id);
create index confirmed_findings_exam_id_idx on public.confirmed_findings (examination_id);
create index knowledge_articles_status_idx on public.knowledge_articles (status, category);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);

-- Backend-only analytics surface for the AI accuracy dataset. The view keeps
-- patient-facing APIs away from raw comparison data while preserving both
-- sides of a human review (including false positives and false negatives).
create or replace view private.ai_accuracy_pairs
with (security_invoker = true)
as
with latest_validated_runs as (
  select distinct on (examination_id)
    id as run_id,
    examination_id,
    disease_master_revision
  from public.ai_analysis_runs
  where status = 'validated'
  order by examination_id, created_at desc
), ai_side as (
  select
    run.examination_id,
    run.run_id,
    run.disease_master_revision,
    finding.disease_id,
    finding.disease_code_snapshot,
    finding.disease_name_snapshot,
    finding.detected as ai_detected,
    finding.suggested_severity_label_snapshot as ai_severity,
    finding.confidence as ai_confidence,
    finding.image_position as ai_image_position
  from latest_validated_runs run
  join public.ai_findings finding on finding.run_id = run.run_id
), confirmed_side as (
  select
    finding.examination_id,
    finding.disease_id,
    finding.disease_code_snapshot,
    finding.disease_name_snapshot,
    true as confirmed_detected,
    finding.severity_label_snapshot as confirmed_severity,
    finding.confirmed_by,
    finding.confirmed_at
  from public.confirmed_findings finding
)
select
  examination.id as examination_id,
  examination.user_id,
  examination.examined_at,
  pair.examination_id as matched_examination_id,
  pair.disease_id,
  pair.disease_code_snapshot as disease_code,
  pair.disease_name_snapshot as disease_name,
  pair.run_id,
  pair.disease_master_revision,
  pair.ai_detected,
  pair.confirmed_detected,
  pair.ai_severity,
  pair.confirmed_severity,
  pair.ai_confidence,
  pair.ai_image_position,
  pair.confirmed_by,
  pair.confirmed_at,
  case
    when pair.ai_detected = true and pair.confirmed_detected is null then 'false_positive'
    when (pair.ai_detected = false or pair.ai_detected is null) and pair.confirmed_detected = true then 'false_negative'
    when pair.ai_detected = true and pair.confirmed_detected = true and pair.ai_severity is distinct from pair.confirmed_severity then 'severity_disagreement'
    when pair.ai_detected is not null and pair.confirmed_detected is not null then 'agreement'
    else 'missing_side'
  end as comparison_result
from (
  select
    coalesce(ai.examination_id, confirmed.examination_id) as examination_id,
    ai.run_id,
    ai.disease_master_revision,
    coalesce(ai.disease_id, confirmed.disease_id) as disease_id,
    coalesce(ai.disease_code_snapshot, confirmed.disease_code_snapshot) as disease_code_snapshot,
    coalesce(ai.disease_name_snapshot, confirmed.disease_name_snapshot) as disease_name_snapshot,
    ai.ai_detected,
    confirmed.confirmed_detected,
    ai.ai_severity,
    confirmed.confirmed_severity,
    ai.ai_confidence,
    ai.ai_image_position,
    confirmed.confirmed_by,
    confirmed.confirmed_at
  from ai_side ai
  full outer join confirmed_side confirmed
    on confirmed.examination_id = ai.examination_id
    and confirmed.disease_id = ai.disease_id
) pair
join public.examinations examination on examination.id = pair.examination_id;

comment on view private.ai_accuracy_pairs is 'Backend-only AI vs human-confirmed comparison surface; do not grant SELECT to anon/authenticated.';

create or replace view private.ai_accuracy_summary
with (security_invoker = true)
as
select
  disease_code,
  disease_name,
  confirmed_severity as severity,
  count(*) as comparison_count,
  count(*) filter (where comparison_result = 'agreement') as agreement_count,
  count(*) filter (where comparison_result = 'false_positive') as false_positive_count,
  count(*) filter (where comparison_result = 'false_negative') as false_negative_count,
  count(*) filter (where comparison_result = 'severity_disagreement') as severity_disagreement_count,
  round((count(*) filter (where comparison_result = 'agreement'))::numeric / nullif(count(*), 0), 4) as agreement_rate
from private.ai_accuracy_pairs
group by disease_code, disease_name, confirmed_severity;

comment on view private.ai_accuracy_summary is 'Backend-only aggregate AI accuracy metrics by Disease and confirmed severity.';

-- Keep these analytics surfaces backend/service-role only even if a future
-- migration or default privilege change would otherwise expose them.
revoke all on table private.ai_accuracy_pairs, private.ai_accuracy_summary from public, anon, authenticated;

-- Every table in the exposed public schema is protected by RLS.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.diseases enable row level security;
alter table public.disease_severity_levels enable row level security;
alter table public.examinations enable row level security;
alter table public.examination_images enable row level security;
alter table public.ai_analysis_runs enable row level security;
alter table public.ai_findings enable row level security;
alter table public.confirmed_findings enable row level security;
alter table public.knowledge_articles enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_own_or_staff" on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff((select auth.uid()))));

create policy "roles_select_own_or_staff" on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff((select auth.uid()))));

create policy "diseases_select_active_or_staff" on public.diseases for select to authenticated
  using (active or (select private.is_staff((select auth.uid()))));
create policy "diseases_staff_insert" on public.diseases for insert to authenticated
  with check ((select private.is_staff((select auth.uid()))));
create policy "diseases_staff_update" on public.diseases for update to authenticated
  using ((select private.is_staff((select auth.uid()))))
  with check ((select private.is_staff((select auth.uid()))));

create policy "severity_select_active_or_staff" on public.disease_severity_levels for select to authenticated
  using (exists (select 1 from public.diseases d where d.id = disease_id and (d.active or (select private.is_staff((select auth.uid()))))));
create policy "severity_staff_insert" on public.disease_severity_levels for insert to authenticated
  with check ((select private.is_staff((select auth.uid()))));
create policy "severity_staff_update" on public.disease_severity_levels for update to authenticated
  using ((select private.is_staff((select auth.uid()))))
  with check ((select private.is_staff((select auth.uid()))));

create policy "examinations_select_own_or_staff" on public.examinations for select to authenticated
  using ((select auth.uid()) = user_id or (select private.is_staff((select auth.uid()))));

create policy "images_select_exam_owner_or_staff" on public.examination_images for select to authenticated
  using (exists (select 1 from public.examinations e where e.id = examination_id and (e.user_id = (select auth.uid()) or (select private.is_staff((select auth.uid()))))));

create policy "ai_runs_select_exam_owner_or_staff" on public.ai_analysis_runs for select to authenticated
  using (exists (select 1 from public.examinations e where e.id = examination_id and (e.user_id = (select auth.uid()) or (select private.is_staff((select auth.uid()))))));
create policy "ai_findings_select_exam_owner_or_staff" on public.ai_findings for select to authenticated
  using (exists (select 1 from public.ai_analysis_runs r join public.examinations e on e.id = r.examination_id where r.id = run_id and (e.user_id = (select auth.uid()) or (select private.is_staff((select auth.uid()))))));

create policy "confirmed_select_exam_owner_or_staff" on public.confirmed_findings for select to authenticated
  using (exists (select 1 from public.examinations e where e.id = examination_id and (e.user_id = (select auth.uid()) or (select private.is_staff((select auth.uid()))))));

create policy "knowledge_select_published_or_staff" on public.knowledge_articles for select to authenticated
  using (status = 'published'::public.knowledge_status or (select private.is_staff((select auth.uid()))));
create policy "knowledge_staff_insert" on public.knowledge_articles for insert to authenticated
  with check ((select private.is_staff((select auth.uid()))));
create policy "knowledge_staff_update" on public.knowledge_articles for update to authenticated
  using ((select private.is_staff((select auth.uid()))))
  with check ((select private.is_staff((select auth.uid()))));

create policy "audit_staff_select" on public.audit_logs for select to authenticated
  using ((select private.is_staff((select auth.uid()))));

grant usage on schema public to authenticated;
grant usage on schema private to authenticated;
grant usage, select on sequence public.examination_code_seq to authenticated;
grant select on public.profiles to authenticated;
grant select on public.user_roles, public.diseases, public.disease_severity_levels to authenticated;
grant select, insert, update on public.diseases, public.disease_severity_levels to authenticated;
grant select on public.examinations, public.examination_images, public.confirmed_findings to authenticated;
grant select on public.ai_analysis_runs, public.ai_findings to authenticated;
grant select, insert, update on public.knowledge_articles to authenticated;
-- Audit rows are written by the backend/service role only; clients may read staff-visible events.
grant select on public.audit_logs to authenticated;

-- Private thumbnail bucket. Originals remain outside Supabase Storage.
insert into storage.buckets (id, name, public)
values ('dm-foot-thumbnails', 'dm-foot-thumbnails', false)
on conflict (id) do update set public = false;

-- Reference and Knowledge media are private too. The backend can issue signed
-- URLs after checking the related Disease/Knowledge row and user role.
insert into storage.buckets (id, name, public)
values
  ('dmfc-disease-reference', 'dmfc-disease-reference', false),
  ('dmfc-knowledge-media', 'dmfc-knowledge-media', false)
on conflict (id) do update set public = false;

create policy "thumbnail_select_owner_or_staff" on storage.objects for select to authenticated
  using (bucket_id = 'dm-foot-thumbnails' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff((select auth.uid())))));
-- INSERT/UPDATE are intentionally service-only: the thumbnail worker reads private
-- Drive originals and writes the private bucket using a backend secret key.

create policy "disease_reference_staff_select" on storage.objects for select to authenticated
  using (bucket_id = 'dmfc-disease-reference' and (select private.is_staff((select auth.uid()))));
create policy "disease_reference_staff_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'dmfc-disease-reference' and (select private.is_staff((select auth.uid()))));
create policy "disease_reference_staff_update" on storage.objects for update to authenticated
  using (bucket_id = 'dmfc-disease-reference' and (select private.is_staff((select auth.uid()))))
  with check (bucket_id = 'dmfc-disease-reference' and (select private.is_staff((select auth.uid()))));

create policy "knowledge_media_published_or_staff_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'dmfc-knowledge-media'
    and (
      (select private.is_staff((select auth.uid())))
      or exists (
        select 1 from public.knowledge_articles article
        where article.id::text = (storage.foldername(name))[1]
          and article.status = 'published'::public.knowledge_status
      )
    )
  );
create policy "knowledge_media_staff_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'dmfc-knowledge-media' and (select private.is_staff((select auth.uid()))));
create policy "knowledge_media_staff_update" on storage.objects for update to authenticated
  using (bucket_id = 'dmfc-knowledge-media' and (select private.is_staff((select auth.uid()))))
  with check (bucket_id = 'dmfc-knowledge-media' and (select private.is_staff((select auth.uid()))));
