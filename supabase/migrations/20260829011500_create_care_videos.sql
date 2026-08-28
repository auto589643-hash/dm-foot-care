create table if not exists public.care_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null default '',
  youtube_url text not null,
  image_path text,
  status public.knowledge_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_videos_title_check check (char_length(btrim(title)) between 1 and 160),
  constraint care_videos_youtube_url_check check (youtube_url ~ '^https://')
);

alter table public.care_videos enable row level security;
revoke all on table public.care_videos from anon, authenticated;
grant select, insert, update, delete on table public.care_videos to service_role;

drop policy if exists "service role manages care videos" on public.care_videos;
create policy "service role manages care videos"
on public.care_videos
for all
to service_role
using (true)
with check (true);

create index if not exists care_videos_status_updated_idx
  on public.care_videos (status, updated_at desc);

-- Preserve the two kinds of content separately. Existing article/video hybrids
-- become ordinary care articles plus dedicated video records, without deleting
-- any article text or stored image.
insert into public.care_videos (
  title, summary, youtube_url, image_path, status,
  created_by, updated_by, created_at, updated_at
)
select
  article.title,
  article.summary,
  article.body->>'youtubeUrl',
  article.image_path,
  article.status,
  article.created_by,
  article.updated_by,
  article.created_at,
  article.updated_at
from public.knowledge_articles article
where coalesce(article.body->>'youtubeUrl', '') <> ''
  and not exists (
    select 1
    from public.care_videos video
    where video.title = article.title
      and video.youtube_url = article.body->>'youtubeUrl'
  );

update public.knowledge_articles
set body = body - 'youtubeUrl',
    updated_at = now()
where body ? 'youtubeUrl';
