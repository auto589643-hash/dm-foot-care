create table if not exists public.saved_knowledge_articles (
  user_id uuid not null references auth.users(id) on delete cascade,
  article_id uuid not null references public.knowledge_articles(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, article_id)
);

create index if not exists saved_knowledge_articles_user_saved_idx
  on public.saved_knowledge_articles (user_id, saved_at desc);

alter table public.saved_knowledge_articles enable row level security;

-- This application reads/writes bookmarks through the authenticated backend.
-- Keep the table unavailable to direct browser Data API access.
revoke all on table public.saved_knowledge_articles from anon, authenticated;
