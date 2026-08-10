-- Keep the person name separately from the login username and create PIN hashes
-- only inside Postgres. These functions are callable solely by the server key.

alter table public.profiles
  add column if not exists display_name text;

update public.profiles
set display_name = username
where display_name is null or btrim(display_name) = '';

alter table public.profiles
  alter column display_name set not null;

create or replace function public.hash_dmfc_pin(p_pin text)
returns text
language sql
strict
set search_path = pg_catalog
as $$
  select extensions.crypt(p_pin, extensions.gen_salt('bf', 12));
$$;

revoke all on function public.hash_dmfc_pin(text) from public, anon, authenticated;
grant execute on function public.hash_dmfc_pin(text) to service_role;

notify pgrst, 'reload schema';
