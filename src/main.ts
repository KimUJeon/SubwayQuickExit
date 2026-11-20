import { findSubwayRoute, getAllGraphStationNames, type NavRoute } from './data/subwayGraph'
import { initHudController, type HudController } from './hud/hudController'
import {
  requestCurrentLocationStation,
  startAutoGpsWatch,
  stopAutoGpsWatch,
} from './services/gpsTracker'
import {
  findNearestSupportedStation,
  searchPlaceCandidates,
  type PlaceCandidate,
} from './services/kakaoLocal'
import {
  createDemoArrivals,
  fetchRealtimeArrivals,
  type ArrivalResult,
} from './services/subwayApi'
import {
  loadApiSettings,
  loadAutoGpsEnabled,
  loadCustomSavedRoutes,
  loadLastRoute,
  saveApiSettings,
  saveAutoGpsEnabled,
  saveCustomSavedRoutes,
  saveLastRoute,
} from './storage/appStorage'
import { cleanGraphStationName, formatStationDisplay } from './utils/stationName.ts'

const SUPPORTED_STATION_SET = new Set(getAllGraphStationNames())
import {
  mountUi,
  renderArrivals,
  renderRouteState,
  setApiSettings,
  setAutoGpsUi,
  setSearchFeedback,
  setStatus,
  showMapCandidates,
  showStationPinOnMap,
  type SavedRoute,
  type UiCallbacks,
} from './ui'

const POLL_INTERVAL_MS = 20_000
const DEFAULT_PROXY_URL =
  import.meta.env.VITE_PROXY_URL || 'https://subway-quick-exit-proxy.prerain.workers.dev'

let customSavedRoutes = loadCustomSavedRoutes()
let savedRoutes: SavedRoute[] = [...customSavedRoutes]

const lastRoute = loadLastRoute()
let fromStation = lastRoute.from
let toStation = lastRoute.to
let exitIdx = lastRoute.exitIdx
let activeSavedId: string | null = lastRoute.savedId

let currentRoute: NavRoute | null = findSubwayRoute(fromStation, toStation, exitIdx)
let stepIdx = 0

let { proxyUrl, kakaoApiKey, seoulApiKey, demoMode } = loadApiSettings(DEFAULT_PROXY_URL)
let latestArrival: ArrivalResult = {
  ok: false,
  arrivals: [],
  message: !currentRoute
    ? '대기 중'
    : seoulApiKey || proxyUrl || demoMode
      ? '조회 중…'
      : 'API 키 미설정',
  fetchedAt: '--:--',
}
let arrivalSeq = 0
let arrivalDebounceTimer: number | null = null
let hudController: HudController | null = null

function persistCurrentRoute() {
  saveLastRoute({ from: fromStation, to: toStation, exitIdx, savedId: activeSavedId })
}

function setRoute(from: string, to: string, nextExitIdx: number, savedId: string | null) {
  fromStation = from
  toStation = to
  exitIdx = nextExitIdx
  activeSavedId = savedId
  currentRoute = findSubwayRoute(fromStation, toStation, exitIdx)
  stepIdx = 0
  if (!currentRoute) {
    arrivalSeq++
    if (arrivalDebounceTimer !== null) {
      window.clearTimeout(arrivalDebounceTimer)
      arrivalDebounceTimer = null
    }
    latestArrival = {
      ok: false,
      arrivals: [],
      message: '대기 중',
      fetchedAt: '--:--',
    }
  }
  persistCurrentRoute()
  syncAll(Boolean(currentRoute))
}

async function refreshArrivals() {
  const seq = ++arrivalSeq
  const cur = currentRoute?.steps[stepIdx]
  if (!cur) {
    latestArrival = {
      ok: false,
      arrivals: [],
      message: '대기 중',
      fetchedAt: '--:--',
    }
    renderArrivals(latestArrival)
    hudController?.scheduleRender()
    return
  }

  if (demoMode) {
    latestArrival = createDemoArrivals(cur.stationName, cur.direction)
    renderArrivals(latestArrival)
    hudController?.scheduleRender()
    return
  }

  if (!seoulApiKey && !proxyUrl) {
    latestArrival = {
      ok: false,
      arrivals: [],
      message: 'API 키 미설정',
      fetchedAt: '--:--',
    }
    renderArrivals(latestArrival)
    hudController?.scheduleRender()
    return
  }

  const res = await fetchRealtimeArrivals(
    seoulApiKey,
    cur.stationName,
    cur.line,
    cur.direction,
    proxyUrl,
  )
  if (seq !== arrivalSeq) return
  latestArrival = res
  renderArrivals(latestArrival)
  hudController?.scheduleRender()
}

function scheduleRefreshArrivals(delayMs = 250) {
  if (arrivalDebounceTimer !== null) {
    window.clearTimeout(arrivalDebounceTimer)
  }
  arrivalDebounceTimer = window.setTimeout(() => {
    arrivalDebounceTimer = null
    void refreshArrivals()
  }, delayMs)
}

function renderCompanion() {
  renderRouteState(
    fromStation,
    toStation,
    exitIdx,
    currentRoute,
    stepIdx,
    savedRoutes,
    activeSavedId,
  )
  renderArrivals(latestArrival)
}

function syncAll(shouldFetchArrivals: boolean) {
  renderCompanion()
  hudController?.scheduleRender()
  if (shouldFetchArrivals) {
    scheduleRefreshArrivals()
  }
}

function stepBy(delta: 1 | -1) {
  if (!currentRoute || currentRoute.steps.length === 0) return
  const len = currentRoute.steps.length
  stepIdx = (stepIdx + delta + len) % len
  syncAll(true)
}

function enableAutoGpsWatch() {
  startAutoGpsWatch({
    getConfig: () => ({ proxyUrl, restApiKey: kakaoApiKey }),
    onStationNearby: (stationName, distanceMeters) => {
      if (!currentRoute) return
      const matchedIdx = currentRoute.steps.findIndex(
        (s, idx) => idx > stepIdx && s.stationName === stationName,
      )
      if (matchedIdx !== -1) {
        stepIdx = matchedIdx
        setSearchFeedback('ok', `GPS 자동진행: ${stationName}역 진입 (약 ${distanceMeters}m)`)
        syncAll(true)
      }
    },
    onFeedback: setSearchFeedback,
    onAutoDisabled: () => {
      setAutoGpsUi(false)
    },
  })
}

const uiCallbacks: UiCallbacks = {
  onChangeRoute: (from, to, nextExitIdx) => {
    setRoute(from, to, nextExitIdx, null)
  },
  onSearchPlace: async (role, query) => {
    const clean = query.trim()
    const directStation = cleanGraphStationName(clean)
    if (SUPPORTED_STATION_SET.has(directStation)) {
      setSearchFeedback(
        'ok',
        `${role === 'from' ? '출발' : '도착'}: ${formatStationDisplay(directStation)} 선택됨`,
      )
      if (role === 'from') {
        setRoute(directStation, toStation, exitIdx, null)
      } else {
        setRoute(fromStation, directStation, 0, null)
      }
      return
    }
    setSearchFeedback('info', `'${query}' 검색 중…`)
    const result = await searchPlaceCandidates(query, {
      proxyUrl,
      restApiKey: kakaoApiKey,
    })
    if (!result.ok || result.candidates.length === 0) {
      setSearchFeedback('error', result.message)
      return
    }
    setSearchFeedback('ok', result.message)
    showMapCandidates(role, result.candidates, uiCallbacks)
  },
  onPickPlaceCandidate: async (role: 'from' | 'to', place: PlaceCandidate) => {
    setSearchFeedback('info', `'${place.placeName}' 주변 지하철역 확인 중…`)
    try {
      const nearest = await findNearestSupportedStation(
        String(place.lng),
        String(place.lat),
        { proxyUrl, restApiKey: kakaoApiKey },
      )
      if (!nearest.stationName) {
        setSearchFeedback(
          'error',
          `'${place.placeName}' 반경 3km 내 지원 지하철역이 없습니다.`,
        )
        return
      }
      showStationPinOnMap(
        place,
        nearest.stationName,
        nearest.stationLat,
        nearest.stationLng,
        uiCallbacks,
      )
      const dist = nearest.distanceMeters !== null ? ` (도보 약 ${nearest.distanceMeters}m)` : ''
      setSearchFeedback(
        'ok',
        `${role === 'from' ? '출발' : '도착'}: ${place.placeName} → ${formatStationDisplay(nearest.stationName)}${dist}`,
      )
      if (role === 'from') {
        setRoute(nearest.stationName, toStation, exitIdx, null)
      } else {
        setRoute(fromStation, nearest.stationName, 0, null)
      }
    } catch (err) {
      setSearchFeedback(
        'error',
        err instanceof Error ? err.message : '주변 지하철역 조회 실패',
      )
    }
  },
  onUseCurrentLocation: () => {
    requestCurrentLocationStation(
      () => ({ proxyUrl, restApiKey: kakaoApiKey }),
      (stationName, distanceMeters) => {
        const dist = distanceMeters ? ` (약 ${distanceMeters}m)` : ''
        setSearchFeedback('ok', `현위치 출발: ${formatStationDisplay(stationName)}${dist}`)
        setRoute(stationName, toStation, exitIdx, null)
      },
      setSearchFeedback,
    )
  },
  onSelectSavedRoute: route => {
    setRoute(route.from, route.to, route.exitIdx, route.id)
  },
  onSaveCurrentRoute: name => {
    const newSaved: SavedRoute = {
      id: `nav-${Date.now()}`,
      name,
      from: fromStation,
      to: toStation,
      exitIdx,
      isCustom: true,
    }
    customSavedRoutes = [newSaved, ...customSavedRoutes]
    saveCustomSavedRoutes(customSavedRoutes)
    savedRoutes = [...customSavedRoutes]
    activeSavedId = newSaved.id
    persistCurrentRoute()
    renderCompanion()
  },
  onDeleteSavedRoute: id => {
    customSavedRoutes = customSavedRoutes.filter(r => r.id !== id)
    saveCustomSavedRoutes(customSavedRoutes)
    savedRoutes = [...customSavedRoutes]
    if (activeSavedId === id) activeSavedId = null
    persistCurrentRoute()
    renderCompanion()
  },
  onSelectStep: idx => {
    if (!currentRoute) return
    stepIdx = Math.max(0, Math.min(currentRoute.steps.length - 1, idx))
    syncAll(true)
  },
  onToggleAutoGps: enabled => {
    saveAutoGpsEnabled(enabled)
    if (enabled) {
      enableAutoGpsWatch()
    } else {
      stopAutoGpsWatch()
      setSearchFeedback('info', 'GPS 자동진행을 껐습니다.')
    }
  },
  onSaveApiSettings: settings => {
    proxyUrl = settings.proxyUrl
    kakaoApiKey = settings.kakaoApiKey
    seoulApiKey = settings.seoulApiKey
    demoMode = settings.demoMode
    saveApiSettings({ proxyUrl, kakaoApiKey, seoulApiKey, demoMode })
    setApiSettings({ proxyUrl, kakaoApiKey, seoulApiKey, demoMode })
    setSearchFeedback('ok', 'API / 프록시 설정이 저장되었습니다.')
    void refreshArrivals()
  },
  onRefreshArrivals: () => {
    void refreshArrivals()
  },
}

mountUi(uiCallbacks)
setApiSettings({ proxyUrl, kakaoApiKey, seoulApiKey, demoMode })

if (loadAutoGpsEnabled(window.isSecureContext) && window.isSecureContext) {
  setAutoGpsUi(true)
  enableAutoGpsWatch()
} else {
  setAutoGpsUi(false)
}
renderCompanion()

const pollTimer = window.setInterval(() => {
  if (seoulApiKey || proxyUrl || demoMode) {
    void refreshArrivals()
  }
}, POLL_INTERVAL_MS)

if (seoulApiKey || proxyUrl || demoMode) {
  void refreshArrivals()
}

hudController = await initHudController({
  getSnapshot: () => ({ fromStation, toStation, route: currentRoute, stepIdx, latestArrival }),
  onStepBy: stepBy,
  onShutdown: () => {
    window.clearInterval(pollTimer)
    if (arrivalDebounceTimer !== null) window.clearTimeout(arrivalDebounceTimer)
    stopAutoGpsWatch()
  },
  onStatus: setStatus,
})