-- Run with a privileged database connection after applying the migration.
-- These checks verify the security shape; signed-in cross-user tests still need pgTAP or API integration tests.

do $$
declare
  expected text[] := array[
    'profiles','user_roles','diseases','disease_severity_levels','examinations',
    'examination_images','ai_analysis_runs','ai_findings','confirmed_findings',
    'knowledge_articles','audit_logs'
  ];
  table_name text;
begin
  foreach table_name in array expected loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'examinations' and policyname = 'examinations_select_own_or_staff') then
    raise exception 'Missing patient examination SELECT policy';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'confirmed_findings' and policyname = 'confirmed_insert_exam_owner_or_staff') then
    raise exception 'Confirmed findings INSERT must remain backend/service-role only';
  end if;
  if not exists (select 1 from storage.buckets where id = 'dm-foot-thumbnails' and public = false) then
    raise exception 'Thumbnail bucket must remain private';
  end if;
  if exists (select 1 from storage.buckets where id in ('dm-foot-thumbnails', 'dmfc-disease-reference', 'dmfc-knowledge-media') and public = true)
    or (select count(*) from storage.buckets where id in ('dm-foot-thumbnails', 'dmfc-disease-reference', 'dmfc-knowledge-media')) <> 3 then
    raise exception 'All DMFC media buckets must exist and remain private';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ai_analysis_runs'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%(examination_id, idempotency_key)%'
  ) then
    raise exception 'AI analysis runs must be idempotent per examination key';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.audit_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%event_type in%'
  ) then
    raise exception 'Audit event type allow-list is missing';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_authenticated_insert'
  ) or has_table_privilege('authenticated', 'public.audit_logs', 'INSERT') then
    raise exception 'Audit log INSERT must remain backend/service-role only';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    or has_table_privilege('authenticated', 'public.examinations', 'INSERT')
    or has_table_privilege('authenticated', 'public.examination_images', 'INSERT')
    or has_table_privilege('authenticated', 'public.confirmed_findings', 'INSERT') then
    raise exception 'Profile, examination, image-reference and confirmed-result writes must remain backend/service-role only';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('thumbnail_insert_owner_or_staff', 'thumbnail_update_owner_or_staff')
  ) then
    raise exception 'Thumbnail INSERT/UPDATE must remain worker/service-role only';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'disease_reference_staff_select')
    or not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'disease_reference_staff_insert')
    or not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'knowledge_media_published_or_staff_select')
    or not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'knowledge_media_staff_insert') then
    raise exception 'Reference/Knowledge media storage policies are incomplete';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'examinations_validate_status') then
    raise exception 'Examination status transition trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'profiles_validate_date_of_birth') then
    raise exception 'Date-of-birth validation trigger is missing';
  end if;
  if not exists (select 1 from pg_views where schemaname = 'private' and viewname = 'ai_accuracy_pairs') then
    raise exception 'Backend-only AI accuracy view is missing';
  end if;
  if has_table_privilege('anon', 'private.ai_accuracy_pairs', 'SELECT')
    or has_table_privilege('authenticated', 'private.ai_accuracy_pairs', 'SELECT') then
    raise exception 'AI accuracy comparison view must remain backend-only';
  end if;
  if not exists (select 1 from pg_views where schemaname = 'private' and viewname = 'ai_accuracy_summary') then
    raise exception 'Backend-only AI accuracy summary view is missing';
  end if;
  if has_table_privilege('anon', 'private.ai_accuracy_summary', 'SELECT')
    or has_table_privilege('authenticated', 'private.ai_accuracy_summary', 'SELECT') then
    raise exception 'AI accuracy summary view must remain backend-only';
  end if;
end;
$$;

do $$
begin
  -- Supabase Data API exposure is separate from RLS. Keep the intended
  -- authenticated grants explicit so a new-project default cannot silently
  -- make a required table unreachable.
  if not has_schema_privilege('authenticated', 'public', 'USAGE')
    or not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    or not has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
    or not has_table_privilege('authenticated', 'public.diseases', 'SELECT,INSERT,UPDATE')
    or not has_table_privilege('authenticated', 'public.disease_severity_levels', 'SELECT,INSERT,UPDATE')
    or not has_table_privilege('authenticated', 'public.examinations', 'SELECT')
    or not has_table_privilege('authenticated', 'public.examination_images', 'SELECT')
    or not has_table_privilege('authenticated', 'public.ai_analysis_runs', 'SELECT')
    or not has_table_privilege('authenticated', 'public.ai_findings', 'SELECT')
    or not has_table_privilege('authenticated', 'public.confirmed_findings', 'SELECT')
    or not has_table_privilege('authenticated', 'public.knowledge_articles', 'SELECT,INSERT,UPDATE')
    or not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT') then
    raise exception 'Expected authenticated Data API grants are missing';
  end if;
end;
$$;

-- Manual API test matrix (run with two authenticated users):
-- 1. Patient A SELECT examinations for Patient B => 0 rows.
-- 2. Patient A INSERT/UPDATE an examination or confirmed finding directly => denied; use backend endpoint.
-- 3. Patient A SELECT private thumbnail path under Patient B UUID => denied.
-- 4. Doctor SELECT all examinations and CRUD active Disease/Knowledge records => allowed by staff RLS.
-- 5. Backend transitions examination status only through the allowed state machine.
