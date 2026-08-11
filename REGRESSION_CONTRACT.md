# DM Foot Care Regression Contract

Before changing production behavior, evaluate the full dependency chain rather than the local symptom.

## Invariants
- Visible username is a product identifier. Never assume it equals the internal Supabase Auth email.
- Original examination images remain in Google Drive only.
- Supabase stores clinical/data records and private thumbnails, not original examination images.
- AI-sized images are transient analysis inputs.
- A persistence/finalization failure is not a thumbnail failure; retain a retryable examination state.
- The optimized lifecycle may finalize `awaiting_review -> confirmed` because thumbnails are produced before human review.
- Patient and Admin historical image viewing use thumbnails first; original Drive images are fetched only on explicit full-image open.
- A successful HTTP response is not sufficient for multi-system writes; verify the required storage/database post-condition before reporting success.
- Thumbnail persistence must be linked to an existing examination image row; both early-thumbnail and normal ordering remain safe.
- Mobile layouts must tolerate long Thai text, browser text scaling and intrinsic-width content without widening the app shell.
- A Git commit is not released until the Production deployment SHA matches it and health/runtime checks pass.

## Mandatory impact check
1. Identity/Auth: username, Auth user id/email, role, account status, session restore and legacy accounts.
2. State machine: current state, allowed next state, retry state, idempotency and failure classification.
3. Storage: destination for original, thumbnail, metadata and temporary image data.
4. API: caller count, authentication, duplicate work, retries and partial success.
5. UI: phone, Safari, zoom/text scaling, long Thai strings, loading/empty/error states and touch targets.
6. Data compatibility: existing production rows, old examinations and accounts created under earlier versions.
7. Release: CI verify, migration/source parity, Production SHA, health, runtime errors and rollback point.
