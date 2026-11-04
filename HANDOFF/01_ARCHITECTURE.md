# Integration Architecture

## Application components

| Component | Location | Role |
| --- | --- | --- |
| Browser frontend | `src/`, `public/` | React/TypeScript mobile-first UI; capture four foot views, patient history and doctor workspace |
| API routing | `api/router.mjs`, `api/[...route].mjs` | Same-origin Vercel `/api/*` gateway |
| Backend handlers | `backend/api/v1/`, `backend/api/_lib/` | Auth, RBAC, records, images, AI, audit and staff operations |
| Database | `supabase/migrations/` | Supabase Auth, Postgres with RLS and private storage |
| Private original-image archive | `backend/api/_lib/drive.mjs` | Google Drive with OAuth or service account; original foot photographs |
| AI analysis | `backend/api/_lib/gemini.mjs` | Gemini request, controlled disease master, validated findings |

## Data boundary

Browser → same-origin `/api` → server-side Supabase and Google/Gemini credentials. The privileged Supabase key, Gemini key and Drive OAuth/service credentials belong on the **server only**; do not use `VITE_` prefixes for secrets. Browser requests carry a session token; server verifies identity and role. Google Drive private images and Supabase private thumbnails are not public assets.

Supabase private buckets: `dm-foot-thumbnails`, `dmfc-disease-reference`, and `dmfc-knowledge-media`. The deployed database must have correct migrations, policies and grants; do not assume a new project is preconfigured.

## Examination workflow

Patient signs in → captures four positions (left dorsal, left sole, right dorsal, right sole) → uploads/recovers originals → starts AI run → doctor reviews and confirms → finalized history and restricted thumbnails. Role isolation and recovery paths must be tested in the receiving environment.

## External dependencies

Supabase (Auth, Database, private Storage); Google Cloud/Drive API; Gemini API; Vercel hosting or equivalent Node serverless platform. Provider ownership, quota/billing, consent and data-processing agreements are established separately by the receiving organization.
