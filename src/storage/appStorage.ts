import { getAllGraphStationNames } from '../data/subwayGraph.ts'
import type { SavedRoute } from '../ui'

const SUPPORTED_STATIONS = new Set(getAllGraphStationNames())

const SAVED_ROUTES_KEY = 'subway_quick_exit_nav_routes'
const LAST_ROUTE_KEY = 'subway_quick_exit_last_route'
const PROXY_URL_KEY = 'subway_quick_exit_proxy_url'
const KAKAO_API_KEY = 'subway_quick_exit_kakao_api_key'
const SEOUL_API_KEY = 'subway_quick_exit_seoul_api_key'
const DEMO_MODE_KEY = 'subway_quick_exit_demo_mode'
const AUTO_GPS_ENABLED_KEY = 'subway_quick_exit_auto_gps'

export interface LastRouteState {
  from: string
  to: string
  exitIdx: number
  savedId: string | null
}

export interface ApiSettingsState {
  proxyUrl: string
  kakaoApiKey: string
  seoulApiKey: string
  demoMode: boolean
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function loadCustomSavedRoutes(): SavedRoute[] {
  const loaded = loadJson<SavedRoute[]>(SAVED_ROUTES_KEY, [])
  return Array.isArray(loaded) ? loaded : []
}

export function saveCustomSavedRoutes(routes: SavedRoute[]): void {
  localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes))
}

export function loadLastRoute(): LastRouteState {
  const fallback: LastRouteState = {
    from: '',
    to: '',
    exitIdx: 0,
    savedId: null,
  }
  const raw = loadJson<unknown>(LAST_ROUTE_KEY, null)
  if (!raw || typeof raw !== 'object') return fallback
  const obj = raw as Record<string, unknown>
  const from =
    typeof obj.from === 'string' && SUPPORTED_STATIONS.has(obj.from) ? obj.from : ''
  const to =
    typeof obj.to === 'string' && SUPPORTED_STATIONS.has(obj.to) ? obj.to : ''
  const exitIdx =
    typeof obj.exitIdx === 'number' && Number.isFinite(obj.exitIdx) && obj.exitIdx >= 0
      ? Math.floor(obj.exitIdx)
      : 0
  const savedId = typeof obj.savedId === 'string' ? obj.savedId : null
  return { from, to, exitIdx, savedId }
}

export function saveLastRoute(state: LastRouteState): void {
  localStorage.setItem(LAST_ROUTE_KEY, JSON.stringify(state))
}

export function loadApiSettings(defaultProxyUrl: string): ApiSettingsState {
  const savedProxy = localStorage.getItem(PROXY_URL_KEY)
  return {
    proxyUrl: savedProxy !== null ? savedProxy : defaultProxyUrl,
    kakaoApiKey: localStorage.getItem(KAKAO_API_KEY) ?? '',
    seoulApiKey: localStorage.getItem(SEOUL_API_KEY) ?? '',
    demoMode: localStorage.getItem(DEMO_MODE_KEY) === 'true',
  }
}

export function saveApiSettings(settings: ApiSettingsState): void {
  localStorage.setItem(PROXY_URL_KEY, settings.proxyUrl)
  localStorage.setItem(KAKAO_API_KEY, settings.kakaoApiKey)
  localStorage.setItem(SEOUL_API_KEY, settings.seoulApiKey)
  localStorage.setItem(DEMO_MODE_KEY, String(settings.demoMode))
}

export function loadAutoGpsEnabled(defaultValue: boolean): boolean {
  const saved = localStorage.getItem(AUTO_GPS_ENABLED_KEY)
  return saved === null ? defaultValue : saved === 'true'
}

export function saveAutoGpsEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_GPS_ENABLED_KEY, String(enabled))
}