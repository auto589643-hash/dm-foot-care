# DM Foot Care — Client Technical Handoff

**Edition:** 2026-11-04. **Source code base:** Git commit `81243f1df38c234e683d2133f0c7ca0be3510a23` (production-sourced).

## What this archive contains

Complete tracked frontend/backend source, SQL migrations, QA tests, project configuration, static assets, an example environment file, and these technical guides. GitHub's **Code → Download ZIP** excludes `.git` commit history.

## Read in this order

1. [Architecture and integrations](01_ARCHITECTURE.md)
2. [Environment configuration](02_ENVIRONMENT.md)
3. [API endpoints](03_API_ENDPOINTS.md)
4. [Deployment runbook](04_DEPLOYMENT_RUNBOOK.md)
5. [Acceptance and operational boundaries](05_RELEASE_ACCEPTANCE.md)

## Receiving organization responsibilities

- Create and own the Supabase, Google Cloud Drive/API, Gemini API, Vercel and domain accounts, or agree separately on transfer of existing resources.
- Provision credentials in the destination hosting secrets manager; never commit them.
- Apply verified database migrations in staging; configure private Storage and RLS.
- Validate patient/doctor roles, four-image upload, AI analysis, human review, error recovery and mobile devices with approved test data.
- Review clinical workflow suitability, patient-data handling, retention, third-party licenses and asset rights.

## Exclusions

No live API keys, refresh tokens, patient records, clinical photographs, Git history, personal developer environment or copyright-filing documents. Source delivery alone does not provision the receiving organization's cloud accounts or migrate production patient data.

Copyright and work ownership follow the commissioning parties' agreement; no new copyright grant or transfer is created by this technical README.
