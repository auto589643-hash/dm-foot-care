# Deployment Runbook — Receiver-Owned Infrastructure

## 1. Prepare and verify source

Extract the source ZIP. Install an appropriate supported Node.js release (Node 22+; confirm actual project/runtime compatibility). Run:

```sh
npm ci
npm run verify
```

Do not replace the checked-in `package-lock.json` during validation. `npm run verify` covers lint, TypeScript/Vite build, unit/contract, security and preflight contract tests. It is **not** a real cloud integration or clinical certification.

## 2. Supabase

Create a customer-owned project. Inspect tracked SQL in `supabase/migrations/` in order; apply to a **staging** database using an approved migration process and verify against migration history before production. Set up private Storage buckets `dm-foot-thumbnails`, `dmfc-disease-reference`, `dmfc-knowledge-media`. Check `supabase/verification/rls_invariants.sql`, authenticated grants, separate patient/doctor roles and isolation. `supabase/seed.sql` is **development/example disease data** requiring clinical review; do not silently apply to a live clinical environment.

## 3. Google Drive

Enable Drive API in the receiving organization's Google Cloud project. Create a private root folder. Configure either server-side OAuth (client ID, client secret, refresh token) or service account JSON. Configure `GOOGLE_DRIVE_ROOT_FOLDER_ID`. Verify ownership/permissions, four original uploads, reads, access control and retries with permitted synthetic/consented test images.

## 4. Gemini

Obtain receiver-owned `GEMINI_API_KEY`; configure `GEMINI_MODEL` to a model **currently supported in the customer account and region**. Check quota, billing, regional handling and privacy requirements for patient images. Validate AI results and physician review with approved test data.

## 5. Vercel or compatible hosting

Create a project in the receiving organization's account. Set server-only secrets and public keys per `02_ENVIRONMENT.md`. Keep `/api/*` same-origin by default; for a separate API host enable explicit cross-origin configuration and review CORS, HTTPS and cookie settings. Build with `npm ci` and `npm run build`. Test `/api/health`, authenticated routes, account roles and full browser/mobile workflows.

## 6. Operational acceptance

Validate clinical content with the responsible clinician; confirm privacy notices, consent, backups, retention/deletion, access recovery, monitoring, incident response, third-party license/assets rights and release rollback. Existing production patient data and cloud accounts are **not** included and require a separate authorized migration agreement.

### Test commands

`npm run preflight:backend` checks HTTPS/CORS/shape with a configured target API. `npm run preflight:supabase` requires controlled staging Patient A/B/Doctor tokens to evaluate isolation. See `README.md` and `scripts/` for exact input configuration.
