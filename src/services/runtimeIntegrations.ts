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
 * Browser runtime always targets a real backend. An explicit API URL wins;
 * otherwise use the app's own /api boundary. There is no silent demo fallback
 * in a browser deployment.
 */
export function createRuntimeIntegrationState(environment: RuntimeEnvironment, options: RuntimeIntegrationOptions = {}): RuntimeIntegrationState {
  let accessToken: string | null = null
  const getAccessToken = () => accessToken
  const setAccessToken = (token: string | null) => { accessToken = token }
  const configuredBaseUrl = environment.VITE_DMFC_API_BASE_URL?.trim()
  const sameOriginBaseUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/` : ''
  const baseUrl = configuredBaseUrl || sameOriginBaseUrl

  if (!baseUrl) return { integrations: null, getAccessToken, setAccessToken }

  return {
    integrations: createHttpIntegrations({ baseUrl, getAccessToken, onAccessToken: setAccessToken, ...options }),
    getAccessToken,
    setAccessToken,
  }
}
