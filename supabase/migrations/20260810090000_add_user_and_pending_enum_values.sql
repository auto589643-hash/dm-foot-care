-- PostgreSQL requires newly-added enum values to be committed before use.
alter type public.account_status add value if not exists 'pending' before 'active';
alter type public.app_role add value if not exists 'user';
