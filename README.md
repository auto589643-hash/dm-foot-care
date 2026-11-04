# DM Foot Care — Source Handoff

DM Foot Care is a mobile-first foot-health monitoring application with a React/Vite frontend, Vercel API backend, Supabase database and private storage, Google Drive image archive and Gemini AI-assisted assessment.

## Source contents

- `src/`, `public/`: React/TypeScript frontend and assets
- `api/`, `backend/api/`: Vercel serverless endpoints, authorization and integrations
- `supabase/migrations/`, `supabase/verification/`: schema and RLS verification
- `tests/`, `scripts/`: tests and preflight checks
- `HANDOFF/`: architecture, API, configuration, deployment and release scope
- `.env.example`: placeholders only — no credentials

## Build and verification

Use a supported Node.js version (Node.js 22+ recommended, confirm Vite compatibility with your environment).

```sh
npm ci
npm run verify
```

Local browser UI: `npm run dev`. The Vercel backend requires a compatible API runtime and configuration; the Vite development server alone is not a full backend.

## Technical handoff

Start with [HANDOFF/README_HANDOFF.md](HANDOFF/README_HANDOFF.md). Follow the integration architecture, API inventory, environment setup, deployment runbook, and acceptance requirements therein.

**Security:** do not put live secrets, OAuth refresh tokens, patient images or production database exports in this repository. The receiver provisions and operates its own provider accounts.

**Clinical use:** AI outputs support review; they are not independently certified diagnoses. End-to-end clinical workflow and data protection acceptance remain operator responsibilities.

**Scope:** deliverable is source code plus integration/deployment technical reference. Copyright filing forms and transfer of existing cloud accounts or patient data are not part of this package.
