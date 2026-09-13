-- DMFC v3.1 immutable staff result revisions and durable patient notifications.
-- Additive only: existing AI/raw tables and confirmed_findings remain intact.

create table if not exists public.result_revisions (
  id uuid primary key default gen_random_uuid(),
  examination_id uuid not null references public.examinations(id) on delete cascade,
  revision_no integer not null check (revision_no > 0),
  request_key text not null check (length(request_key) between 8 and 200),
  original_ai_run_id uuid references public.ai_analysis_runs(id) on delete restrict,
  original_ai_findings jsonb not null default '[]'::jsonb check (jsonb_typeof(original_ai_findings) = 'array'),
  reviewed_findings jsonb not null default '[]'::jsonb check (jsonb_typeof(reviewed_findings) = 'array'),
  change_set jsonb not null default '{}'::jsonb,
  review_note text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (examination_id, revision_no),
  unique (examination_id, request_key)
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('result_updated')),
  examination_id uuid not null references public.examinations(id) on delete cascade,
  result_revision_no integer not null check (result_revision_no > 0),
  title text not null,
  body text not null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, examination_id, result_revision_no, type)
);

create index if not exists result_revisions_exam_created_idx
  on public.result_revisions (examination_id, revision_no desc);
create index if not exists user_notifications_user_unread_idx
  on public.user_notifications (user_id, created_at, id)
  where acknowledged_at is null;
create index if not exists user_notifications_exam_revision_idx
  on public.user_notifications (examination_id, result_revision_no);

alter table public.result_revisions enable row level security;
alter table public.user_notifications enable row level security;

drop policy if exists "result_revisions_staff_select" on public.result_revisions;
create policy "result_revisions_staff_select" on public.result_revisions for select to authenticated
  using ((select private.is_staff((select auth.uid()))));

drop policy if exists "user_notifications_select_own" on public.user_notifications;
create policy "user_notifications_select_own" on public.user_notifications for select to authenticated
  using ((select auth.uid()) = user_id);

-- Direct browser writes stay disabled. Mutations go through authenticated backend routes.
revoke all on public.result_revisions, public.user_notifications from anon, authenticated;
grant select on public.result_revisions, public.user_notifications to authenticated;

create or replace function private.normalize_review_findings(p_findings jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
  v_result jsonb;
begin
  if p_findings is null or jsonb_typeof(p_findings) <> 'array' then
    raise exception 'reviewed findings must be an array' using errcode = '22023';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_findings);

  if exists (
    select 1
    from jsonb_to_recordset(p_findings) as item("diseaseId" text, severity text)
    where item."diseaseId" is null or btrim(item."diseaseId") = ''
      or item.severity is null or btrim(item.severity) = ''
  ) then
    raise exception 'each finding requires diseaseId and severity' using errcode = '22023';
  end if;

  if (
    select count(distinct item."diseaseId")
    from jsonb_to_recordset(p_findings) as item("diseaseId" text, severity text)
  ) <> v_count then
    raise exception 'duplicate disease finding' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'diseaseId', disease.code,
        'name', disease.name,
        'severity', item.severity
      )
      order by disease.code
    ),
    '[]'::jsonb
  )
  into v_result
  from jsonb_to_recordset(p_findings) as item("diseaseId" text, severity text)
  join public.diseases disease
    on disease.code = item."diseaseId" and disease.active = true
  join public.disease_severity_levels level
    on level.disease_id = disease.id and level.label = item.severity;

  if jsonb_array_length(v_result) <> v_count then
    raise exception 'finding or severity is not valid for active Disease Master' using errcode = '22023';
  end if;

  return v_result;
end;
$$;

revoke all on function private.normalize_review_findings(jsonb) from public, anon, authenticated;

create or replace function public.create_reviewed_result_revision(
  p_examination_id uuid,
  p_expected_current_revision integer,
  p_reviewed_findings jsonb,
  p_review_note text,
  p_reviewed_by uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_exam public.examinations%rowtype;
  v_existing public.result_revisions%rowtype;
  v_current_revision integer;
  v_current_findings jsonb;
  v_reviewed_findings jsonb;
  v_ai_run_id uuid;
  v_original_ai jsonb;
  v_change_set jsonb;
  v_revision_id uuid;
  v_revision_no integer;
  v_notification_id uuid;
begin
  if p_request_key is null or length(p_request_key) < 8 or length(p_request_key) > 200 then
    raise exception 'invalid request key' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.user_roles
    where user_id = p_reviewed_by and role in ('doctor'::public.app_role, 'admin'::public.app_role)
  ) then
    raise exception 'reviewer is not staff' using errcode = '42501';
  end if;

  select * into v_exam
  from public.examinations
  where id = p_examination_id
  for update;

  if not found then
    raise exception 'examination not found' using errcode = 'P0002';
  end if;
  if v_exam.status <> 'confirmed'::public.examination_status then
    raise exception 'only confirmed examinations can be reviewed' using errcode = '22023';
  end if;

  select * into v_existing
  from public.result_revisions
  where examination_id = p_examination_id and request_key = p_request_key;

  if found then
    select id into v_notification_id
    from public.user_notifications
    where user_id = v_exam.user_id
      and examination_id = p_examination_id
      and result_revision_no = v_existing.revision_no
      and type = 'result_updated'
    limit 1;
    return jsonb_build_object(
      'revisionId', v_existing.id,
      'revisionNo', v_existing.revision_no,
      'noOp', false,
      'idempotent', true,
      'notificationId', v_notification_id
    );
  end if;

  select coalesce(max(revision_no), 0) into v_current_revision
  from public.result_revisions
  where examination_id = p_examination_id;

  if coalesce(p_expected_current_revision, 0) <> v_current_revision then
    raise exception 'STALE_REVISION:%', v_current_revision using errcode = '40001';
  end if;

  v_reviewed_findings := private.normalize_review_findings(p_reviewed_findings);

  if v_current_revision > 0 then
    select reviewed_findings into v_current_findings
    from public.result_revisions
    where examination_id = p_examination_id and revision_no = v_current_revision;
  else
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'diseaseId', disease_code_snapshot,
          'name', disease_name_snapshot,
          'severity', coalesce(severity_label_snapshot, 'เล็กน้อย')
        )
        order by disease_code_snapshot
      ),
      '[]'::jsonb
    )
    into v_current_findings
    from public.confirmed_findings
    where examination_id = p_examination_id;
  end if;

  if v_reviewed_findings = coalesce(v_current_findings, '[]'::jsonb) then
    return jsonb_build_object(
      'revisionNo', v_current_revision,
      'noOp', true,
      'idempotent', false,
      'notificationId', null
    );
  end if;

  select id into v_ai_run_id
  from public.ai_analysis_runs
  where examination_id = p_examination_id and status = 'validated'::public.analysis_status
  order by completed_at desc nulls last, created_at desc
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'diseaseId', disease_code_snapshot,
        'name', disease_name_snapshot,
        'detected', detected,
        'severity', suggested_severity_label_snapshot,
        'imagePosition', image_position
      )
      order by disease_code_snapshot
    ),
    '[]'::jsonb
  )
  into v_original_ai
  from public.ai_findings
  where run_id = v_ai_run_id;

  select jsonb_build_object(
    'added', coalesce((
      select jsonb_agg(item order by item->>'diseaseId')
      from jsonb_array_elements(v_reviewed_findings) item
      where not exists (
        select 1 from jsonb_array_elements(coalesce(v_current_findings, '[]'::jsonb)) old_item
        where old_item->>'diseaseId' = item->>'diseaseId'
      )
    ), '[]'::jsonb),
    'removed', coalesce((
      select jsonb_agg(item order by item->>'diseaseId')
      from jsonb_array_elements(coalesce(v_current_findings, '[]'::jsonb)) item
      where not exists (
        select 1 from jsonb_array_elements(v_reviewed_findings) new_item
        where new_item->>'diseaseId' = item->>'diseaseId'
      )
    ), '[]'::jsonb),
    'changed', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'diseaseId', new_item->>'diseaseId',
          'fromSeverity', old_item->>'severity',
          'toSeverity', new_item->>'severity'
        )
        order by new_item->>'diseaseId'
      )
      from jsonb_array_elements(v_reviewed_findings) new_item
      join jsonb_array_elements(coalesce(v_current_findings, '[]'::jsonb)) old_item
        on old_item->>'diseaseId' = new_item->>'diseaseId'
      where old_item->>'severity' is distinct from new_item->>'severity'
    ), '[]'::jsonb)
  ) into v_change_set;

  v_revision_no := v_current_revision + 1;

  insert into public.result_revisions (
    examination_id, revision_no, request_key,
    original_ai_run_id, original_ai_findings,
    reviewed_findings, change_set, review_note, reviewed_by
  ) values (
    p_examination_id, v_revision_no, p_request_key,
    v_ai_run_id, coalesce(v_original_ai, '[]'::jsonb),
    v_reviewed_findings, v_change_set, nullif(btrim(p_review_note), ''), p_reviewed_by
  )
  returning id into v_revision_id;

  delete from public.confirmed_findings where examination_id = p_examination_id;

  insert into public.confirmed_findings (
    examination_id, disease_id, disease_code_snapshot, disease_name_snapshot,
    severity_id, severity_label_snapshot, ai_finding_id, confirmed_by, confirmed_at
  )
  select
    p_examination_id,
    disease.id,
    disease.code,
    disease.name,
    level.id,
    item.severity,
    ai_finding.id,
    p_reviewed_by,
    now()
  from jsonb_to_recordset(v_reviewed_findings) as item("diseaseId" text, name text, severity text)
  join public.diseases disease on disease.code = item."diseaseId"
  join public.disease_severity_levels level
    on level.disease_id = disease.id and level.label = item.severity
  left join public.ai_findings ai_finding
    on ai_finding.run_id = v_ai_run_id
   and ai_finding.disease_id = disease.id
   and ai_finding.detected = true;

  insert into public.user_notifications (
    user_id, type, examination_id, result_revision_no, title, body
  ) values (
    v_exam.user_id,
    'result_updated',
    p_examination_id,
    v_revision_no,
    'ผลตรวจเท้าของคุณมีการอัปเดต',
    'เจ้าหน้าที่ได้ตรวจทานผลล่าสุดแล้ว แตะเพื่อดูรายละเอียด'
  )
  on conflict (user_id, examination_id, result_revision_no, type) do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    select id into v_notification_id
    from public.user_notifications
    where user_id = v_exam.user_id
      and examination_id = p_examination_id
      and result_revision_no = v_revision_no
      and type = 'result_updated';
  end if;

  insert into public.audit_logs (
    actor_id, event_type, entity_type, entity_id, payload, occurred_at
  ) values (
    p_reviewed_by,
    'human_review_edited',
    'examination',
    p_examination_id::text,
    jsonb_build_object(
      'revisionNo', v_revision_no,
      'addedCount', jsonb_array_length(v_change_set->'added'),
      'removedCount', jsonb_array_length(v_change_set->'removed'),
      'severityChangedCount', jsonb_array_length(v_change_set->'changed'),
      'reviewNotePresent', nullif(btrim(p_review_note), '') is not null
    ),
    now()
  );

  return jsonb_build_object(
    'revisionId', v_revision_id,
    'revisionNo', v_revision_no,
    'noOp', false,
    'idempotent', false,
    'notificationId', v_notification_id
  );
end;
$$;

revoke all on function public.create_reviewed_result_revision(uuid, integer, jsonb, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_reviewed_result_revision(uuid, integer, jsonb, text, uuid, text) to service_role;
