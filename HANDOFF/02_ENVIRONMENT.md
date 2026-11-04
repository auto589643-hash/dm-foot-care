# DMFC — Environment and API Connections

Create receiver-owned accounts for Supabase, Google Cloud/Drive and Gemini, plus a Vercel project.

## Variables for the server runtime

SUPABASE_URL: Supabase project base URL
SUPABASE_SECRET_KEY: privileged backend key; only server-side
SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY): public project key
GEMINI_API_KEY: backend model API key
GEMINI_MODEL: explicit provider-supported model name
GOOGLE_DRIVE_ROOT_FOLDER_ID (fallback GOOGLE_DRIVE_FOLDER_ID): private original-image archive folder
FRONTEND_ORIGIN: deployed frontend origin for cookie/CORS policy
DMFC_SESSION_MAX_AGE_SECONDS: optional session lifetime

## Google Drive authentication (select one method)

OAuth: GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET and GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN.
Service account alternative: GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON.
Use organization-controlled accounts, private folders, and appropriately scoped permissions. Confirm read/write access before operating.

## Browser configuration

Default browser API URL is same-origin /api. Cross-origin hosting requires VITE_DMFC_API_BASE_URL together with VITE_DMFC_ALLOW_CROSS_ORIGIN_API=true and approved CORS. Never expose backend credentials through VITE_ prefixed fields.

## Optional test configuration

DMFC_API_BASE_URL, DMFC_PREFLIGHT_ORIGIN, DMFC_PREFLIGHT_ACCESS_TOKEN, DMFC_PATIENT_A_TOKEN, DMFC_PATIENT_B_TOKEN and DMFC_DOCTOR_TOKEN are used by preflight/test scripts; use short-lived non-production tokens.

### Credential handling

Never include credential *values* in GitHub, downloadable source archives or client email. Add values only in receiver-owned platform environment settings. Gemini model availability, account quotas, patient image privacy and Google Drive ownership must be validated by the receiver.

### Health endpoint limitation

GET /api/health verifies basic configuration presence, not connectivity or a complete integration check. The Drive status currently checks the service-account variable and does not fully reflect OAuth-only configuration.
