-- Add optional clinical context used by DMFC registration and profile views.
-- Existing users remain valid because every new column is nullable.

alter table public.profiles
  add column if not exists sex text,
  add column if not exists diabetes_years smallint,
  add column if not exists latest_hba1c numeric(4,1);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_sex_check') then
    alter table public.profiles add constraint profiles_sex_check
      check (sex is null or sex = any (array['male'::text, 'female'::text, 'other'::text, 'prefer_not_to_say'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_diabetes_years_check') then
    alter table public.profiles add constraint profiles_diabetes_years_check
      check (diabetes_years is null or (diabetes_years >= 0 and diabetes_years <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_latest_hba1c_check') then
    alter table public.profiles add constraint profiles_latest_hba1c_check
      check (latest_hba1c is null or (latest_hba1c > 0 and latest_hba1c <= 30));
  end if;
end
$$;
