import { createHttpIntegrations } from './httpAdapters.ts'

export interface RuntimeEnvironment {
  VITE_DMFC_API_BASE_URL?: string
  /**
   * Opt in only when the browser must call a separately hosted API. DMFC's
   * Vercel deployment includes its API under /api, so the default keeps the
   * browser on its current origin and avoids alias/CORS mismatches.
   */
  VITE_DMFC_ALLOW_CROSS_ORIGIN_API?: string
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
 * Browser runtime always targets a real backend. In a browser, prefer the
 * app's own /api boundary unless a separately hosted API was explicitly
 * enabled. This prevents a build-time Vercel alias from making a deployed
 * page call a different origin after its production alias changes.
 */
export function createRuntimeIntegrationState(environment: RuntimeEnvironment, options: RuntimeIntegrationOptions = {}): RuntimeIntegrationState {
  let accessToken: string | null = null
  const getAccessToken = () => accessToken
  const setAccessToken = (token: string | null) => { accessToken = token }
  const configuredBaseUrl = environment.VITE_DMFC_API_BASE_URL?.trim()
  const sameOriginBaseUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/` : ''
  const crossOriginApiEnabled = environment.VITE_DMFC_ALLOW_CROSS_ORIGIN_API === 'true'
  const baseUrl = sameOriginBaseUrl && !crossOriginApiEnabled ? sameOriginBaseUrl : configuredBaseUrl || sameOriginBaseUrl

  if (!baseUrl) return { integrations: null, getAccessToken, setAccessToken }

  return {
    integrations: createHttpIntegrations({ baseUrl, getAccessToken, onAccessToken: setAccessToken, ...options }),
    getAccessToken,
    setAccessToken,
  }
}
