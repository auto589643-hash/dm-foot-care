# Release Scope, Verification, and Acceptance

## Source provenance

- Base application source: Git commit `81243f1df38c234e683d2133f0c7ca0be3510a23`.
- Handoff branch adds documentation and removes three tracked compiled Python cache `.pyc` files. No application runtime/business-rule changes are intended.
- Download using GitHub **Code → Download ZIP** on this specific handoff branch (not `main`). This excludes `.git` history.

## Included

Frontend source, backend API, database migrations, tests, static assets, project configuration, a placeholder-only environment example, and technical reference documents.

## Excluded

Private credentials or patient records/images, real environment files, temporary compiled Python cache, local dependencies/build artifacts, developer machine state, copyright-registration paperwork, and transfer of third-party cloud accounts or production datasets.

## Receiver's acceptance checklist

- [ ] Verify archive source revision and required folders.
- [ ] Run clean `npm ci`, `npm run verify` and record logs.
- [ ] Provision receiver-owned Supabase, Drive, Gemini, hosting and domain.
- [ ] Validate migration/RLS, private storage, patient isolation and staff permissions.
- [ ] Validate camera capture, upload retry, AI workflow and doctor review on supported devices.
- [ ] Review third-party dependencies/licenses, logo/asset rights, clinical appropriateness and privacy controls.
- [ ] Document operational ownership, backup, retention and incident processes.

**Interpretation:** these checks concern *deployment/operation by the receiving party*. Delivery of source and technical documentation does not establish successful deployment on a new tenant or clinical certification. Copyright ownership is governed by the commissioning agreement; no separate copyright-filing service is included.
