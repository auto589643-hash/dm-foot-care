# DM Foot Care — Storage & Performance Invariants

This file records production architecture rules that must remain true when the application is optimized or extended.

## Storage destinations

| Data | Production destination | Rule |
|---|---|---|
| Original foot photos | Google Drive | Keep the original/high-quality image here only. Do not duplicate originals into Supabase Storage. |
| Web thumbnails | Private Supabase Storage | Small display copies only. Use signed URLs for authorized viewing. |
| Examination, findings, metadata, Drive IDs | Supabase PostgreSQL | Store structured application data and references, not original photo bytes. |
| AI analysis image | Temporary in-memory/request data | Resize for analysis when useful; do not persist another full image copy. |
| Unfinished photo draft on the user's device | IndexedDB | Local temporary Blob storage only. Clear after completion/new examination. |

## Performance rules

- Vercel Functions should remain in Tokyo (`hnd1`) near the Supabase Tokyo project.
- Preserve bcrypt/PIN verification cost; improve authentication by removing redundant network round trips, not by weakening hashing.
- Avoid N+1 database/API patterns. Batch AI and confirmed findings where possible.
- Upload each high-resolution original to Google Drive independently/parallel rather than bundling all four originals into one oversized serverless request.
- Persist the Google Drive image reference in the same backend upload operation; this does not change where the original is stored.
- Load patient history without thumbnail signing until the history UI needs images.
- Load only lightweight/featured knowledge for Home; fetch the full library when the Knowledge page is opened.
- Admin history should load the examination list first, thumbnails when the examination is opened, and the Google Drive original only when the user opens the large image viewer.
- Keep private images private. Do not make Google Drive or Supabase buckets public as a performance shortcut.
- Cache only short-lived authorization/role/signed-URL/Drive metadata values that can safely be refreshed; writes must invalidate or bypass stale application data.

## UX constraint

Optimization must not change the clinical/user-facing meaning of the application. Loading behavior may become lazy, batched, cached, or server-orchestrated, but the user-visible data source and storage policy above must remain unchanged.
