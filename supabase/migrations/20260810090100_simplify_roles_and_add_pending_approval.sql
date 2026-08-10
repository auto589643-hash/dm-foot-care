-- Public users self-register and remain blocked until an admin approves them.
-- Legacy enum labels stay available for rollback compatibility, but all rows
-- and application writes are normalized to the public `user` / `admin` model.

update public.user_roles set role = 'admin' where role = 'doctor';
update public.user_roles set role = 'user' where role = 'patient';

alter table public.user_roles alter column role set default 'user';
alter table public.profiles alter column account_status set default 'pending';

create index if not exists profiles_pending_approval_idx
  on public.profiles (created_at desc)
  where account_status = 'pending';

create or replace function private.is_staff(requested_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = requested_user
      and role = 'admin'::public.app_role
  );
$$;
