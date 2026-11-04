# HTTP API — Source-Based Route Inventory

Vercel `vercel.json` routes `/api/*` through `api/router.mjs` to the backend handlers. The list below summarizes paths; handlers and tests are the normative source for exact payload schemas, authentication and verbs. This is **not** a full OpenAPI specification.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Configuration-presence health check |
| `/api/v1/auth/register` | Patient account registration |
| `/api/v1/auth/username/sign-in` | Username sign-in |
| `/api/v1/auth/session` | Session refresh/read |
| `/api/v1/auth/sign-out` | Sign out |
| `/api/v1/examinations`, `/api/v1/examinations/drafts` | Patient examinations and drafts |
| `/api/v1/examinations/{id}/images` | Examination image collection |
| `/api/v1/examinations/{id}/images/{position}` | Photo upload / per-position actions |
| `/api/v1/examinations/{id}/analysis-runs` | AI runs |
| `/api/v1/examinations/{id}/confirmed-findings` | Human-confirmed findings |
| `/api/v1/examinations/{id}/finalize` | Finalization |
| `/api/v1/examinations/{id}/status`, `/thumbnails`, `/thumbnail-references` | Status and thumbnail operations |
| `/api/v1/analysis`, `/api/v1/audit-events` | Analysis and audit |
| `/api/v1/knowledge`, `/api/v1/knowledge-saved`, `/api/v1/care-videos` | Patient education |
| `/api/v1/notifications` | Notifications |
| `/api/v1/original-images`, `/api/v1/original-images/folders` | Private original-photo archive |
| `/api/v1/admin/bootstrap`, `/dashboard`, `/users`, `/user`, `/user-examinations` | Staff setup and administration |
| `/api/v1/admin/diseases`, `/knowledge`, `/care-videos` | Staff content/disease management |
| `/api/v1/admin/examination-image`, `/examination-thumbnails`, `/examination-review` | Staff review and image retrieval |

Backend code lives under `backend/api/v1/`; consult the dispatcher in `api/[...route].mjs` for precise supported routes and methods. Patient and doctor permissions must be verified against Supabase policies and backend guards.

Acceptance tests: (1) unauthenticated actions denied; (2) Patient A cannot access Patient B records; (3) staff role restrictions; (4) four-photo upload + retry; (5) AI errors do not create false-confirmed findings; (6) private original photos and thumbnails remain non-public.
