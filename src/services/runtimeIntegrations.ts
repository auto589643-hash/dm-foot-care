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
 * Select the production HTTP boundary only when an API base URL is configured.
 * The access token stays in memory; deployments may additionally use an HttpOnly
 * session cookie for restoreSession(). With no URL, the app remains demo-only.
 */
export function createRuntimeIntegrationState(environment: RuntimeEnvironment, options: RuntimeIntegrationOptions = {}): RuntimeIntegrationState {
  let accessToken: string | null = null
  const getAccessToken = () => accessToken
  const setAccessToken = (token: string | null) => { accessToken = token }
  const baseUrl = environment.VITE_DMFC_API_BASE_URL?.trim()
  if (!baseUrl) return { integrations: null, getAccessToken, setAccessToken }

  return {
    integrations: createHttpIntegrations({ baseUrl, getAccessToken, onAccessToken: setAccessToken, ...options }),
    getAccessToken,
    setAccessToken,
  }
}
