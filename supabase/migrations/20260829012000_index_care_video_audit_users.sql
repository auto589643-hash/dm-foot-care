create index if not exists care_videos_created_by_idx
  on public.care_videos (created_by);

create index if not exists care_videos_updated_by_idx
  on public.care_videos (updated_by);
