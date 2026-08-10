import { createHttpIntegrations } from './httpAdapters.ts'

export interface RuntimeEnvironment {
  VITE_DMFC_API_BASE_URL?: string
}

export type RuntimeIntegrations = ReturnType<typeof createHttpIntegrations>

export interface RuntimeIntegrationState {
  integrations: RuntimeIntegrations | null
  getAccessToken: () => string | null
  setAccessToken: (token: string | null) => void
}

export interface RuntimeIntegrationOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * Use an explicitly configured API URL when available. Vercel preview
 * deployments otherwise use their own /api boundary so previews exercise the
 * backend from the same branch instead of silently falling back to demo mode.
 * Local development remains demo-only unless VITE_DMFC_API_BASE_URL is set.
 */
export function createRuntimeIntegrationState(environment: RuntimeEnvironment, options: RuntimeIntegrationOptions = {}): RuntimeIntegrationState {
  let accessToken: string | null = null
  const getAccessToken = () => accessToken
  const setAccessToken = (token: string | null) => { accessToken = token }
  const configuredBaseUrl = environment.VITE_DMFC_API_BASE_URL?.trim()
  const vercelPreviewBaseUrl = typeof window !== 'undefined' && /\.vercel\.app$/i.test(window.location.hostname)
    ? `${window.location.origin}/api/`
    : ''
  const baseUrl = configuredBaseUrl || vercelPreviewBaseUrl

  if (!baseUrl) return { integrations: null, getAccessToken, setAccessToken }

  return {
    integrations: createHttpIntegrations({ baseUrl, getAccessToken, onAccessToken: setAccessToken, ...options }),
    getAccessToken,
    setAccessToken,
  }
}
