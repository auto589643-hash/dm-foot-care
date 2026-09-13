/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_DMFC_API_BASE_URL?: string
  readonly VITE_DMFC_ALLOW_CROSS_ORIGIN_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
