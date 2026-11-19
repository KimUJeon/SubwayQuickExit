import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { renderTrainDiagram } from './data/subwayData'
import { findSubwayRoute, type NavRoute } from './data/subwayGraph'
import {
  findNearestSupportedStation,
  searchPlaceAndNearestStation,
} from './services/kakaoLocal'
import {
  createDemoArrivals,
  fetchRealtimeArrivals,
  type ArrivalResult,
} from './services/subwayApi'
import {
  mountUi,
  renderArrivals,
  renderRouteState,
  setApiSettings,
  setSearchFeedback,
  setStatus,
  type SavedRoute,
} from './ui'

const SAVED_ROUTES_KEY = 'subway_quick_exit_nav_routes'
const LAST_ROUTE_KEY = 'subway_quick_exit_last_route'
const PROXY_URL_KEY = 'subway_quick_exit_proxy_url'
const KAKAO_API_KEY = 'subway_quick_exit_kakao_api_key'
const SEOUL_API_KEY = 'subway_quick_exit_seoul_api_key'
const DEMO_MODE_KEY = 'subway_quick_exit_demo_mode'

const FOOTER_TEXT = '[탭] 다음정거장  [스크롤] 이전/다음역  [더블탭] 종료'
const POLL_INTERVAL_MS = 20_000

const DEFAULT_SAVED_ROUTES: SavedRoute[] = [
  { id: 'nav-commute-in', name: '출근: 사당→강남', from: '사당', to: '강남', exitIdx: 0 },
  { id: 'nav-commute-out', name: '퇴근: 여의도→사당', from: '여의도', to: '사당', exitIdx: 0 },
  { id: 'nav-pangyo', name: '판교: 홍대입구→판교', from: '홍대입구', to: '판교', exitIdx: 0 },
]

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

let customSavedRoutes = loadJson<SavedRoute[]>(SAVED_ROUTES_KEY, [])
if (!Array.isArray(customSavedRoutes)) customSavedRoutes = []
let savedRoutes: SavedRoute[] = [...customSavedRoutes, ...DEFAULT_SAVED_ROUTES]

const lastRoute = loadJson<{ from: string; to: string; exitIdx: number; savedId: string | null }>(
  LAST_ROUTE_KEY,
  { from: '사당', to: '강남', exitIdx: 0, savedId: 'nav-commute-in' },
)

let fromStation = lastRoute.from
let toStation = lastRoute.to
let exitIdx = lastRoute.exitIdx
let activeSavedId: string | null = lastRoute.savedId

let currentRoute: NavRoute | null = findSubwayRoute(fromStation, toStation, exitIdx)
let stepIdx = 0

const DEFAULT_PROXY_URL =
  import.meta.env.VITE_PROXY_URL || 'https://subway-quick-exit-proxy.prerain.workers.dev'

let proxyUrl = localStorage.getItem(PROXY_URL_KEY) || DEFAULT_PROXY_URL
let kakaoApiKey = localStorage.getItem(KAKAO_API_KEY) ?? ''
let seoulApiKey = localStorage.getItem(SEOUL_API_KEY) ?? ''
let demoMode = localStorage.getItem(DEMO_MODE_KEY) === 'true'
let latestArrival: ArrivalResult = {
  ok: false,
  arrivals: [],
  message: seoulApiKey || proxyUrl || demoMode ? '조회 중…' : 'API 키 미설정',
  fetchedAt: '--:--',
}
let arrivalSeq = 0

function persistLastRoute() {
  localStorage.setItem(
    LAST_ROUTE_KEY,
    JSON.stringify({ from: fromStation, to: toStation, exitIdx, savedId: activeSavedId }),
  )
}

function setRoute(from: string, to: string, nextExitIdx: number, savedId: string | null) {
  fromStation = from
  toStation = to
  exitIdx = nextExitIdx
  activeSavedId = savedId
  currentRoute = findSubwayRoute(fromStation, toStation, exitIdx)
  stepIdx = 0
  persistLastRoute()
  syncAll(true)
}

function formatTopBarText(): string {
  if (!currentRoute) {
    return `[경로 미선택] 출발역과 도착역을 선택해 주세요`
  }
  const cur = currentRoute.steps[stepIdx]
  if (!cur) return `${currentRoute.fromName} → ${currentRoute.toName}`
  const remainText =
    cur.kind === 'arrive'
      ? '목적지 도착!'
      : `잔여 ${cur.remainingToGoal}역 (약 ${Math.max(1, cur.remainingToGoal * 2)}분)`
  const firstArrival = latestArrival.arrivals[0]
  const liveTag = firstArrival ? ` | ${firstArrival.arvlMsg2}` : ''
  return `[${currentRoute.fromName}→${currentRoute.toName}] ${remainText}${liveTag}`
}

function formatMainHudText(): string {
  if (!currentRoute) {
    return '출발역과 도착역을 다르게 선택하면\n최적 경로와 빠른하차 문이 표시됩니다.'
  }
  const cur = currentRoute.steps[stepIdx]
  if (!cur) return '경로 정보 없음'

  const diagram = renderTrainDiagram(cur.totalCars, cur.car)
  const doorRole = cur.kind === 'board' || cur.kind === 'ride' ? '추천탑승' : '빠른하차'

  let liveLine = `실시간: ${latestArrival.message}`
  if (latestArrival.ok && latestArrival.arrivals.length > 0) {
    liveLine = latestArrival.arrivals
      .map(a => `> ${a.arvlMsg2} (${a.arvlMsg3 || a.updnLine})`)
      .join(' / ')
    liveLine = `실시간: ${liveLine}`
  }

  return [
    `현재: ${cur.actionTitle} (${stepIdx + 1}/${currentRoute.steps.length})`,
    `방향: ${cur.direction}`,
    `${doorRole}: [ ${cur.car} - ${cur.door} ] 번 문 -> ${cur.targetLabel}`,
    `열차: ${diagram}`,
    `안내: ${cur.note}`,
    liveLine,
  ].join('\n')
}

async function refreshArrivals() {
  const cur = currentRoute?.steps[stepIdx]
  if (!cur) return

  const seq = ++arrivalSeq
  if (demoMode) {
    latestArrival = createDemoArrivals(cur.stationName, cur.direction)
    renderArrivals(latestArrival)
    scheduleHudRender()
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
    scheduleHudRender()
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
  scheduleHudRender()
}

mountUi({
  onChangeRoute: (from, to, nextExitIdx) => {
    setRoute(from, to, nextExitIdx, null)
  },
  onSearchPlace: async (role, query) => {
    setSearchFeedback('info', `'${query}' 검색 중…`)
    const result = await searchPlaceAndNearestStation(query, {
      proxyUrl,
      restApiKey: kakaoApiKey,
    })
    if (!result.ok || !result.stationName) {
      setSearchFeedback('error', result.message)
      return
    }
    setSearchFeedback('ok', `${role === 'from' ? '출발' : '도착'}: ${result.message}`)
    if (role === 'from') {
      setRoute(result.stationName, toStation, exitIdx, null)
    } else {
      setRoute(fromStation, result.stationName, 0, null)
    }
  },
  onUseCurrentLocation: () => {
    if (!window.isSecureContext) {
      setSearchFeedback(
        'error',
        'HTTP 접속에서는 GPS가 차단됩니다. HTTPS(배포/터널) 또는 출발지 검색을 이용해 주세요.',
      )
      return
    }
    if (!navigator.geolocation) {
      setSearchFeedback('error', '이 기기에서 위치 정보를 지원하지 않습니다.')
      return
    }
    setSearchFeedback('info', '현재 위치 확인 중…')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const nearest = await findNearestSupportedStation(
            String(pos.coords.longitude),
            String(pos.coords.latitude),
            { proxyUrl, restApiKey: kakaoApiKey },
          )
          if (!nearest.stationName) {
            setSearchFeedback('error', '주변 3km 내 지원 지하철역(2·3·4·5·7·9·신분당선)이 없습니다.')
            return
          }
          const dist = nearest.distanceMeters ? ` (약 ${nearest.distanceMeters}m)` : ''
          setSearchFeedback('ok', `현위치 출발: ${nearest.stationName}역${dist}`)
          setRoute(nearest.stationName, toStation, exitIdx, null)
        } catch (err) {
          setSearchFeedback(
            'error',
            err instanceof Error ? err.message : '주변 지하철역 조회에 실패했습니다.',
          )
        }
      },
      err => {
        const msg =
          err.code === 1
            ? '위치 권한이 거부되었습니다. 휴대폰 설정 > Even 앱 위치 권한을 확인해 주세요.'
            : `위치를 가져올 수 없습니다. (${err.message || `code ${err.code}`})`
        setSearchFeedback('error', msg)
      },
      { enableHighAccuracy: true, timeout: 8000 },
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
    localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(customSavedRoutes))
    savedRoutes = [...customSavedRoutes, ...DEFAULT_SAVED_ROUTES]
    activeSavedId = newSaved.id
    persistLastRoute()
    renderCompanion()
  },
  onDeleteSavedRoute: id => {
    customSavedRoutes = customSavedRoutes.filter(r => r.id !== id)
    localStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(customSavedRoutes))
    savedRoutes = [...customSavedRoutes, ...DEFAULT_SAVED_ROUTES]
    if (activeSavedId === id) activeSavedId = null
    persistLastRoute()
    renderCompanion()
  },
  onSelectStep: idx => {
    if (!currentRoute) return
    stepIdx = Math.max(0, Math.min(currentRoute.steps.length - 1, idx))
    syncAll(true)
  },
  onSaveApiSettings: settings => {
    proxyUrl = settings.proxyUrl || DEFAULT_PROXY_URL
    kakaoApiKey = settings.kakaoApiKey
    seoulApiKey = settings.seoulApiKey
    demoMode = settings.demoMode
    localStorage.setItem(PROXY_URL_KEY, proxyUrl)
    localStorage.setItem(KAKAO_API_KEY, kakaoApiKey)
    localStorage.setItem(SEOUL_API_KEY, seoulApiKey)
    localStorage.setItem(DEMO_MODE_KEY, String(demoMode))
    setApiSettings({ proxyUrl, kakaoApiKey, seoulApiKey, demoMode })
    setSearchFeedback('ok', 'API / 프록시 설정이 저장되었습니다.')
    void refreshArrivals()
  },
  onRefreshArrivals: () => {
    void refreshArrivals()
  },
})

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

setApiSettings({ proxyUrl, kakaoApiKey, seoulApiKey, demoMode })
renderCompanion()

const bridge = await waitForEvenAppBridge()

const topContainer = new TextContainerProperty({
  xPosition: 0,
  yPosition: 0,
  width: 576,
  height: 36,
  borderWidth: 1,
  borderColor: 5,
  paddingLength: 4,
  containerID: 1,
  containerName: 'hud_top',
  content: formatTopBarText(),
  isEventCapture: 0,
})

const mainContainer = new TextContainerProperty({
  xPosition: 0,
  yPosition: 36,
  width: 576,
  height: 208,
  borderWidth: 0,
  borderColor: 5,
  paddingLength: 6,
  containerID: 2,
  containerName: 'hud_main',
  content: formatMainHudText(),
  isEventCapture: 1,
})

const botContainer = new TextContainerProperty({
  xPosition: 0,
  yPosition: 244,
  width: 576,
  height: 44,
  borderWidth: 1,
  borderColor: 5,
  paddingLength: 4,
  containerID: 3,
  containerName: 'hud_bot',
  content: FOOTER_TEXT,
  isEventCapture: 0,
})

const pagePayload = {
  containerTotalNum: 3,
  textObject: [topContainer, mainContainer, botContainer],
}

const created = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(pagePayload))
let hudOk = created === 0
if (!hudOk) {
  hudOk = await bridge.rebuildPageContainer(new RebuildPageContainer(pagePayload)).catch(() => false)
}

if (hudOk) {
  setStatus('ok', '안경 연결됨')
} else {
  setStatus('error', `HUD 초기화 실패(${created})`)
}

let renderTimer: number | null = null
let lastTopText = formatTopBarText()
let lastMainText = formatMainHudText()

function scheduleHudRender() {
  if (renderTimer !== null) {
    window.clearTimeout(renderTimer)
  }
  renderTimer = window.setTimeout(async () => {
    renderTimer = null
    const nextTop = formatTopBarText()
    const nextMain = formatMainHudText()

    if (nextTop !== lastTopText) {
      lastTopText = nextTop
      await bridge
        .textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: 1,
            containerName: 'hud_top',
            contentOffset: 0,
            content: nextTop,
          }),
        )
        .catch(() => false)
    }

    if (nextMain !== lastMainText) {
      lastMainText = nextMain
      await bridge
        .textContainerUpgrade(
          new TextContainerUpgrade({
            containerID: 2,
            containerName: 'hud_main',
            contentOffset: 0,
            content: nextMain,
          }),
        )
        .catch(() => false)
    }
  }, 80)
}

function syncAll(shouldFetchArrivals: boolean) {
  renderCompanion()
  scheduleHudRender()
  if (shouldFetchArrivals) {
    void refreshArrivals()
  }
}

function stepBy(delta: 1 | -1) {
  if (!currentRoute || currentRoute.steps.length === 0) return
  const len = currentRoute.steps.length
  stepIdx = (stepIdx + delta + len) % len
  syncAll(true)
}

function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

const pollTimer = window.setInterval(() => {
  if (seoulApiKey || proxyUrl || demoMode) {
    void refreshArrivals()
  }
}, POLL_INTERVAL_MS)

const unsubscribe = bridge.onEvenHubEvent(event => {
  const sysType = eventTypeOf(event.sysEvent)
  const textType = eventTypeOf(event.textEvent)
  const ev = sysType ?? textType
  if (ev === null) return

  if (ev === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    window.clearInterval(pollTimer)
    bridge.shutDownPageContainer(1)
    return
  }

  if (ev === OsEventTypeList.CLICK_EVENT || ev === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
    stepBy(1)
    return
  }

  if (ev === OsEventTypeList.SCROLL_TOP_EVENT) {
    stepBy(-1)
    return
  }

  if (ev === OsEventTypeList.SYSTEM_EXIT_EVENT || ev === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
    window.clearInterval(pollTimer)
    unsubscribe()
  }
})

if (seoulApiKey || proxyUrl || demoMode) {
  void refreshArrivals()
}
