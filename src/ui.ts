import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  getStationExits,
  type NavRoute,
} from './data/subwayGraph'
import type { PlaceCandidate } from './services/kakaoLocal'
import type { ArrivalResult } from './services/subwayApi'
import { formatStationDisplay } from './utils/stationName.ts'

export interface SavedRoute {
  id: string
  name: string
  from: string
  to: string
  exitIdx: number
  isCustom?: boolean
}

export interface UiCallbacks {
  onChangeRoute: (from: string, to: string, exitIdx: number) => void
  onSearchPlace: (role: 'from' | 'to', query: string) => void
  onPickPlaceCandidate: (role: 'from' | 'to', place: PlaceCandidate) => void
  onUseCurrentLocation: () => void
  onSelectSavedRoute: (route: SavedRoute) => void
  onSaveCurrentRoute: (name: string) => void
  onDeleteSavedRoute: (id: string) => void
  onSelectStep: (stepIdx: number) => void
  onToggleAutoGps: (enabled: boolean) => void
  onSaveApiSettings: (settings: {
    proxyUrl: string
    kakaoApiKey: string
    seoulApiKey: string
    demoMode: boolean
  }) => void
  onRefreshArrivals: () => void
}

let statusEl: HTMLDivElement
let savedRouteListEl: HTMLDivElement
let routeEndpointEl: HTMLDivElement
let routeActionRowEl: HTMLDivElement
let exitSelectEl: HTMLSelectElement
let fromSearchInputEl: HTMLInputElement
let toSearchInputEl: HTMLInputElement
let searchFeedbackEl: HTMLDivElement
let mapPickerWrapEl: HTMLDivElement
let mapContainerEl: HTMLDivElement
let candidateListEl: HTMLDivElement
let routeSummaryEl: HTMLDivElement
let stepListEl: HTMLDivElement
let activeStepDetailEl: HTMLDivElement
let saveRouteBtnEl: HTMLButtonElement
let saveRouteFormEl: HTMLFormElement
let saveRouteInputEl: HTMLInputElement
let autoGpsCheckboxEl: HTMLInputElement
let arrivalStatusEl: HTMLSpanElement
let arrivalListEl: HTMLDivElement
let proxyUrlInputEl: HTMLInputElement
let kakaoApiKeyInputEl: HTMLInputElement
let apiKeyInputEl: HTMLInputElement
let demoModeCheckboxEl: HTMLInputElement

let currentFromStation = ''
let currentToStation = ''

export function mountUi(callbacks: UiCallbacks) {
  const app = document.querySelector<HTMLDivElement>('#app')!

  app.innerHTML = `
    <main class="panel">
      <header>
        <div>
          <h1>SubwayQuickExit</h1>
          <small class="subtitle">출발지 → 목적지 지하철 빠른하차 내비게이션</small>
        </div>
        <div id="status" class="status">Connecting…</div>
      </header>

      <section class="card">
        <div class="card-head">
          <div class="card-label">경로 설정 (장소 검색 · 지도 · 현위치)</div>
          <div class="card-actions">
            <button id="toggleMapBtn" class="btn-mini" type="button">🗺 지도</button>
            <button id="gpsBtn" class="btn-mini" type="button">📍 현위치</button>
            <button id="swapBtn" class="btn-mini" type="button">⇄ 왕복</button>
          </div>
        </div>
        <div class="row">
          <input id="fromSearchInput" placeholder="출발지 검색 (예: 홍대입구 CGV)" />
          <button id="fromSearchBtn" class="btn-mini" type="button">검색</button>
        </div>
        <div class="row">
          <input id="toSearchInput" placeholder="목적지 검색 (예: 판교 테크노밸리)" />
          <button id="toSearchBtn" class="btn-mini" type="button">검색</button>
        </div>
        <div id="searchFeedback" class="search-feedback"></div>
        <div id="mapPickerWrap" class="map-wrap hidden">
          <div id="mapContainer" class="map-box"></div>
          <div id="candidateList" class="candidate-list"></div>
        </div>
        <div id="routeEndpoint" class="route-endpoint hidden"></div>
        <div id="routeActionRow" class="row hidden">
          <select id="exitSelect" aria-label="도착 출구" class="hidden"></select>
          <button id="saveRouteBtn" class="btn" type="button">+ 즐겨찾기</button>
        </div>
        <form id="saveRouteForm" class="row hidden">
          <input id="saveRouteInput" placeholder="즐겨찾기 이름 입력" maxlength="30" />
          <button class="btn primary" type="submit">저장</button>
          <button id="cancelSaveRouteBtn" class="btn-mini" type="button">취소</button>
        </form>
        <div id="savedRouteList" class="chips"></div>
      </section>

      <section class="card">
        <div class="card-head">
          <div id="routeSummary" class="card-label">여정 안내</div>
          <label class="gps-auto-toggle">
            <input id="autoGpsCheckbox" type="checkbox" />
            <span>GPS 자동진행</span>
          </label>
        </div>
        <div id="stepList" class="chips"></div>
        <div id="activeStepDetail" class="detail-box"></div>
      </section>

      <section class="card">
        <div class="card-head">
          <div class="card-label">실시간 열차 도착 정보</div>
          <div class="card-actions">
            <span id="arrivalStatus" class="arrival-badge">대기 중</span>
            <button id="refreshArrivalBtn" class="btn-mini" type="button">새로고침</button>
          </div>
        </div>
        <div id="arrivalList" class="arrival-list">실시간 정보 대기 중…</div>
        <details class="sub-details">
          <summary class="summary-sub">API · 프록시 설정 (카카오 장소검색 / 서울 실시간)</summary>
          <form id="apiForm" class="form">
            <input id="proxyUrlInput" name="proxyUrl" placeholder="프록시 URL (로컬: /cf-proxy | 배포: https://...workers.dev)" />
            <input id="kakaoApiKeyInput" name="kakaoApiKey" type="password" placeholder="카카오 REST API 키 (장소 검색용)" />
            <input id="apiKeyInput" name="apiKey" type="password" placeholder="서울 열린데이터광장 인증키 (실시간 열차용)" />
            <label class="checkbox-row">
              <input id="demoModeCheckbox" name="demoMode" type="checkbox" />
              <span>API 키 없이 데모 실시간 모드 사용</span>
            </label>
            <button class="btn primary" type="submit">설정 저장 및 조회</button>
          </form>
        </details>
      </section>

      <footer>안경 탭: 다음 정거장 진행 · 스크롤: 이전/다음 역 · 더블탭: 종료</footer>
    </main>
  `

  statusEl = app.querySelector('#status')!
  savedRouteListEl = app.querySelector('#savedRouteList')!
  routeEndpointEl = app.querySelector('#routeEndpoint')!
  routeActionRowEl = app.querySelector('#routeActionRow')!
  exitSelectEl = app.querySelector('#exitSelect')!
  fromSearchInputEl = app.querySelector('#fromSearchInput')!
  toSearchInputEl = app.querySelector('#toSearchInput')!
  searchFeedbackEl = app.querySelector('#searchFeedback')!
  mapPickerWrapEl = app.querySelector('#mapPickerWrap')!
  mapContainerEl = app.querySelector('#mapContainer')!
  candidateListEl = app.querySelector('#candidateList')!
  routeSummaryEl = app.querySelector('#routeSummary')!
  saveRouteBtnEl = app.querySelector('#saveRouteBtn')!
  saveRouteFormEl = app.querySelector('#saveRouteForm')!
  saveRouteInputEl = app.querySelector('#saveRouteInput')!
  autoGpsCheckboxEl = app.querySelector('#autoGpsCheckbox')!
  autoGpsCheckboxEl.addEventListener('change', () => {
    callbacks.onToggleAutoGps(autoGpsCheckboxEl.checked)
  })

  app.querySelector('#toggleMapBtn')!.addEventListener('click', () => {
    const isHidden = mapPickerWrapEl.classList.toggle('hidden')
    if (!isHidden) {
      ensureMap(callbacks)
      window.setTimeout(() => leafletMap?.invalidateSize(), 60)
    }
  })

  candidateListEl.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-candidate-idx]')
    if (!btn) return
    const idx = Number(btn.dataset.candidateIdx)
    const place = currentCandidates[idx]
    if (!place) return
    callbacks.onPickPlaceCandidate(currentMapRole, place)
  })
  stepListEl = app.querySelector('#stepList')!
  activeStepDetailEl = app.querySelector('#activeStepDetail')!
  arrivalStatusEl = app.querySelector('#arrivalStatus')!
  arrivalListEl = app.querySelector('#arrivalList')!
  proxyUrlInputEl = app.querySelector('#proxyUrlInput')!
  kakaoApiKeyInputEl = app.querySelector('#kakaoApiKeyInput')!
  apiKeyInputEl = app.querySelector('#apiKeyInput')!
  demoModeCheckboxEl = app.querySelector('#demoModeCheckbox')!

  app.querySelector('#fromSearchBtn')!.addEventListener('click', () => {
    fromSearchInputEl.blur()
    callbacks.onSearchPlace('from', fromSearchInputEl.value)
  })
  app.querySelector('#toSearchBtn')!.addEventListener('click', () => {
    toSearchInputEl.blur()
    callbacks.onSearchPlace('to', toSearchInputEl.value)
  })
  fromSearchInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      fromSearchInputEl.blur()
      callbacks.onSearchPlace('from', fromSearchInputEl.value)
    }
  })
  toSearchInputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault()
      toSearchInputEl.blur()
      callbacks.onSearchPlace('to', toSearchInputEl.value)
    }
  })
  app.querySelector('#gpsBtn')!.addEventListener('click', () => {
    callbacks.onUseCurrentLocation()
  })

  const emitRouteChange = () => {
    callbacks.onChangeRoute(
      currentFromStation,
      currentToStation,
      Number(exitSelectEl.value) || 0,
    )
  }

  exitSelectEl.addEventListener('change', emitRouteChange)

  app.querySelector('#swapBtn')!.addEventListener('click', () => {
    if (!currentFromStation && !currentToStation) return
    const nextFrom = currentToStation
    const nextTo = currentFromStation
    syncExitOptions(nextTo, 0)
    callbacks.onChangeRoute(nextFrom, nextTo, 0)
  })

  saveRouteBtnEl.addEventListener('click', () => {
    if (saveRouteBtnEl.disabled) return
    saveRouteInputEl.value = `${currentFromStation}→${currentToStation}`
    saveRouteFormEl.classList.remove('hidden')
    saveRouteInputEl.focus()
    saveRouteInputEl.select()
  })

  app.querySelector('#cancelSaveRouteBtn')!.addEventListener('click', () => {
    saveRouteFormEl.classList.add('hidden')
  })

  saveRouteFormEl.addEventListener('submit', e => {
    e.preventDefault()
    const name = saveRouteInputEl.value.trim()
    if (!name) return
    saveRouteFormEl.classList.add('hidden')
    callbacks.onSaveCurrentRoute(name)
  })

  savedRouteListEl.addEventListener('click', e => {
    const delBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-delete-route]')
    if (delBtn) {
      e.stopPropagation()
      callbacks.onDeleteSavedRoute(delBtn.dataset.deleteRoute!)
      return
    }
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-route-id]')
    if (!btn) return
    const id = btn.dataset.routeId!
    const found = cachedSavedRoutes.find(r => r.id === id)
    if (found) callbacks.onSelectSavedRoute(found)
  })

  stepListEl.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-step-idx]')
    if (!btn) return
    callbacks.onSelectStep(Number(btn.dataset.stepIdx))
  })

  app.querySelector('#refreshArrivalBtn')!.addEventListener('click', () => {
    callbacks.onRefreshArrivals()
  })

  const apiForm = app.querySelector<HTMLFormElement>('#apiForm')!
  apiForm.addEventListener('submit', e => {
    e.preventDefault()
    callbacks.onSaveApiSettings({
      proxyUrl: proxyUrlInputEl.value.trim(),
      kakaoApiKey: kakaoApiKeyInputEl.value.trim(),
      seoulApiKey: apiKeyInputEl.value.trim(),
      demoMode: demoModeCheckboxEl.checked,
    })
  })

  injectStyles()
}

let cachedSavedRoutes: SavedRoute[] = []

function syncExitOptions(toStation: string, selectedIdx: number) {
  if (!exitSelectEl) return
  if (!toStation) {
    exitSelectEl.innerHTML = ''
    exitSelectEl.classList.add('hidden')
    return
  }
  const exits = getStationExits(toStation)
  exitSelectEl.innerHTML = exits
    .map((ex, i) => `<option value="${i}">${escapeHtml(ex.label)} (${ex.car}-${ex.door}번 문)</option>`)
    .join('')
  exitSelectEl.value = String(Math.max(0, Math.min(exits.length - 1, selectedIdx)))
  exitSelectEl.classList.toggle('hidden', exits.length <= 1)
}

export function setStatus(kind: 'ok' | 'error', text: string) {
  if (!statusEl) return
  statusEl.className = `status status-${kind}`
  statusEl.textContent = text
}

export function setApiSettings(settings: {
  proxyUrl: string
  kakaoApiKey: string
  seoulApiKey: string
  demoMode: boolean
}) {
  if (proxyUrlInputEl) proxyUrlInputEl.value = settings.proxyUrl
  if (kakaoApiKeyInputEl) kakaoApiKeyInputEl.value = settings.kakaoApiKey
  if (apiKeyInputEl) apiKeyInputEl.value = settings.seoulApiKey
  if (demoModeCheckboxEl) demoModeCheckboxEl.checked = settings.demoMode
}

export function setSearchFeedback(kind: 'ok' | 'error' | 'info', text: string) {
  if (!searchFeedbackEl) return
  searchFeedbackEl.className = `search-feedback ${kind}`
  searchFeedbackEl.textContent = text
}

export function renderRouteState(
  from: string,
  to: string,
  exitIdx: number,
  route: NavRoute | null,
  activeStepIdx: number,
  savedRoutes: SavedRoute[],
  activeSavedId: string | null,
) {
  cachedSavedRoutes = savedRoutes
  currentFromStation = from
  currentToStation = to
  if (routeEndpointEl) {
    if (!from && !to) {
      routeEndpointEl.classList.add('hidden')
    } else {
      routeEndpointEl.classList.remove('hidden')
      const fromLabel = from ? formatStationDisplay(from) : '미선택'
      const toLabel = to ? formatStationDisplay(to) : '미선택'
      routeEndpointEl.innerHTML = `<span>출발: <strong>${escapeHtml(fromLabel)}</strong></span><span class="arrow">→</span><span>도착: <strong>${escapeHtml(toLabel)}</strong></span>`
    }
  }
  syncExitOptions(to, exitIdx)

  if (savedRouteListEl) {
    savedRouteListEl.classList.toggle('hidden', savedRoutes.length === 0)
    savedRouteListEl.innerHTML = savedRoutes
      .map(
        r => `
        <button type="button" class="chip ${r.id === activeSavedId ? 'active' : ''}" data-route-id="${escapeHtml(r.id)}">
          ${escapeHtml(r.name)}
          ${r.isCustom ? `<span class="chip-del" data-delete-route="${escapeHtml(r.id)}" title="삭제">×</span>` : ''}
        </button>
      `,
      )
      .join('')
  }

  if (!routeSummaryEl || !stepListEl || !activeStepDetailEl) return

  if (routeActionRowEl) {
    routeActionRowEl.classList.toggle('hidden', !route)
  }
  if (saveRouteBtnEl) {
    saveRouteBtnEl.disabled = !route
    if (!route && saveRouteFormEl) {
      saveRouteFormEl.classList.add('hidden')
    }
  }

  if (!route) {
    if (!from && !to) {
      routeSummaryEl.textContent = '대기 중 · 출발역과 도착역을 선택하거나 검색해 주세요.'
    } else if (!from) {
      routeSummaryEl.textContent = `도착: ${formatStationDisplay(to)} · 출발역을 선택해 주세요.`
    } else if (!to) {
      routeSummaryEl.textContent = `출발: ${formatStationDisplay(from)} · 도착역을 선택해 주세요.`
    } else {
      routeSummaryEl.textContent = '출발역과 도착역을 다르게 선택해 주세요.'
    }
    stepListEl.innerHTML = ''
    activeStepDetailEl.innerHTML = ''
    return
  }

  routeSummaryEl.textContent = `${route.fromName} → ${route.toName} · ${route.totalStops}정거장 · 환승 ${route.transferCount}회 · 약 ${route.estimatedMinutes}분`

  stepListEl.innerHTML = route.steps
    .map((s, idx) => {
      const badge = s.kind === 'board' ? '승차' : s.kind === 'transfer' ? '환승' : s.kind === 'arrive' ? '도착' : ''
      const label = badge ? `${s.stationName}(${badge})` : s.stationName
      return `
        <button type="button" class="chip ${idx === activeStepIdx ? 'active' : ''}" data-step-idx="${idx}">
          ${idx + 1}. ${escapeHtml(label)}
        </button>
      `
    })
    .join('')

  const cur = route.steps[activeStepIdx]
  if (!cur) return

  const doorTag = cur.kind === 'board' || cur.kind === 'ride' ? '추천 탑승 문' : '빠른하차 문'
  activeStepDetailEl.innerHTML = `
    <div class="detail-top">
      <span class="detail-action">${escapeHtml(cur.actionTitle)}</span>
      <span class="target-door">${doorTag}: ${cur.car}-${cur.door}</span>
    </div>
    <div class="detail-sub">${escapeHtml(cur.direction)} · 목표: ${escapeHtml(cur.targetLabel)}</div>
    <div class="detail-note">${escapeHtml(cur.note)}</div>
  `
}

export function renderArrivals(result: ArrivalResult) {
  if (!arrivalStatusEl || !arrivalListEl) return
  arrivalStatusEl.textContent = `${result.message} (${result.fetchedAt})`
  arrivalStatusEl.className = `arrival-badge ${result.ok ? 'ok' : ''}`

  if (!result.ok || result.arrivals.length === 0) {
    arrivalListEl.innerHTML = `<div class="arrival-empty">${escapeHtml(result.message)}</div>`
    return
  }

  arrivalListEl.innerHTML = result.arrivals
    .map(
      a => `
      <div class="arrival-row">
        <span class="arrival-line">${escapeHtml(a.trainLineNm || a.updnLine)}</span>
        <span class="arrival-eta">${escapeHtml(a.arvlMsg2)}</span>
      </div>
    `,
    )
    .join('')
}

let leafletMap: L.Map | null = null
let mapLayerGroup: L.LayerGroup | null = null
let currentCandidates: PlaceCandidate[] = []
let currentMapRole: 'from' | 'to' = 'to'

function ensureMap(callbacks: UiCallbacks) {
  if (leafletMap || !mapContainerEl) return
  leafletMap = L.map(mapContainerEl, {
    center: [37.5172, 127.0473], // Seoul Gangnam center
    zoom: 13,
    zoomControl: false,
  })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(leafletMap)
  mapLayerGroup = L.layerGroup().addTo(leafletMap)

  leafletMap.on('click', (e: L.LeafletMouseEvent) => {
    callbacks.onPickPlaceCandidate(currentMapRole, {
      placeName: '지도 선택 위치',
      address: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`,
      category: '',
      lat: e.latlng.lat,
      lng: e.latlng.lng,
    })
  })
}

export function showMapCandidates(
  role: 'from' | 'to',
  candidates: PlaceCandidate[],
  callbacks: UiCallbacks,
) {
  currentMapRole = role
  currentCandidates = candidates
  if (!mapPickerWrapEl || !candidateListEl) return

  mapPickerWrapEl.classList.remove('hidden')
  ensureMap(callbacks)
  leafletMap?.invalidateSize()

  if (mapLayerGroup) {
    mapLayerGroup.clearLayers()
  }

  const bounds: L.LatLngExpression[] = []
  candidates.forEach((c, idx) => {
    const pos: L.LatLngExpression = [c.lat, c.lng]
    bounds.push(pos)
    if (mapLayerGroup) {
      const icon = L.divIcon({
        className: 'map-pin-wrap',
        html: `<div class="map-pin">${idx + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })
      const marker = L.marker(pos, { icon }).addTo(mapLayerGroup)
      marker.on('click', () => {
        callbacks.onPickPlaceCandidate(role, c)
      })
    }
  })

  if (leafletMap && bounds.length > 0) {
    if (bounds.length === 1) {
      leafletMap.setView(bounds[0], 15)
    } else {
      leafletMap.fitBounds(L.latLngBounds(bounds), { padding: [26, 26], maxZoom: 15 })
    }
  }

  candidateListEl.innerHTML = candidates
    .map(
      (c, idx) => `
      <button type="button" class="candidate-item" data-candidate-idx="${idx}">
        <span class="candidate-num">${idx + 1}</span>
        <span class="candidate-info">
          <strong>${escapeHtml(c.placeName)}</strong>
          <small>${escapeHtml(c.address)}</small>
        </span>
      </button>
    `,
    )
    .join('')
}

export function showStationPinOnMap(
  place: PlaceCandidate,
  stationName: string,
  stationLat: number | null,
  stationLng: number | null,
  callbacks: UiCallbacks,
) {
  if (!mapPickerWrapEl) return
  ensureMap(callbacks)
  if (!mapLayerGroup || !leafletMap) return
  mapLayerGroup.clearLayers()

  const placePos: L.LatLngExpression = [place.lat, place.lng]
  L.marker(placePos, {
    icon: L.divIcon({
      className: 'map-pin-wrap',
      html: `<div class="map-pin active">★</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    }),
  }).addTo(mapLayerGroup)

  const pts: L.LatLngExpression[] = [placePos]
  if (stationLat && stationLng) {
    const stPos: L.LatLngExpression = [stationLat, stationLng]
    pts.push(stPos)
    L.marker(stPos, {
      icon: L.divIcon({
        className: 'map-pin-wrap',
        html: `<div class="map-pin station">${escapeHtml(stationName)}</div>`,
        iconSize: [64, 22],
        iconAnchor: [32, 11],
      }),
    }).addTo(mapLayerGroup)
    L.polyline([placePos, stPos], { color: '#3cfa44', dashArray: '4 4', weight: 2 }).addTo(
      mapLayerGroup,
    )
  }

  if (pts.length === 1) {
    leafletMap.setView(pts[0], 15)
  } else {
    leafletMap.fitBounds(L.latLngBounds(pts), { padding: [32, 32], maxZoom: 16 })
  }
}

export function setAutoGpsUi(enabled: boolean) {
  if (autoGpsCheckboxEl) autoGpsCheckboxEl.checked = enabled
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function injectStyles() {
  const css = `
    :root { color-scheme: dark; }
    html, body { margin: 0; height: 100%; overflow: hidden;
      background: #1e1e1e; color: #e5e5e5;
      font: 15px/1.45 -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', system-ui, sans-serif;
      touch-action: manipulation; -webkit-text-size-adjust: 100%; }
    #app { display: block; height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: contain; padding: 0; text-align: left; }
    .panel { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 680px;
      margin: 0 auto; padding: 18px 18px 48px; box-sizing: border-box; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h1 { font-size: 18px; font-weight: 700; margin: 0; }
    .subtitle { color: #9a9a9a; font-size: 12px; }
    .status { font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid #3e3e3e; }
    .status-ok { color: #3cfa44; border-color: #3cfa44; background: rgba(60,250,68,0.08); }
    .status-error { color: #ff453a; border-color: #ff453a; background: rgba(255,69,58,0.08); }
    .card { background: #282828; border: 1px solid #383838; border-radius: 12px; padding: 14px;
      display: flex; flex-direction: column; gap: 10px; }
    .card-label { font-size: 12px; font-weight: 600; color: #9a9a9a; }
    .card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .card-actions { display: flex; align-items: center; gap: 6px; }
    .row { display: flex; align-items: center; gap: 8px; }
    .arrow { color: #3cfa44; font-weight: 700; }
    .route-endpoint { display: flex; align-items: center; justify-content: space-between; gap: 8px;
      background: #202020; border: 1px solid #353535; border-radius: 8px; padding: 8px 11px;
      font-size: 13px; color: #cfcfcf; }
    .route-endpoint strong { color: #f5f5f5; }
    select, input { flex: 1; background: #1c1c1c; color: #f0f0f0; border: 1px solid #444;
      border-radius: 8px; padding: 8px 10px; font-size: 13px; min-width: 0; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; background: #1e1e1e; color: #dcdcdc;
      border: 1px solid #444; border-radius: 999px; padding: 5px 11px; font-size: 12px; cursor: pointer; }
    .chip.active { border-color: #3cfa44; color: #3cfa44; background: rgba(60,250,68,0.1); font-weight: 600; }
    .chip-del { color: #9a9a9a; font-weight: 700; padding: 0 2px; }
    .detail-box { background: #202020; border: 1px solid #343434; border-radius: 8px; padding: 10px 12px;
      display: flex; flex-direction: column; gap: 4px; }
    .detail-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .detail-action { font-weight: 700; font-size: 14px; color: #f5f5f5; }
    .target-door { font-weight: 700; color: #3cfa44; font-size: 13px; white-space: nowrap; }
    .detail-sub { font-size: 12px; color: #cfcfcf; }
    .detail-note { font-size: 12px; color: #9a9a9a; }
    .arrival-badge { font-size: 11px; color: #9a9a9a; border: 1px solid #444; border-radius: 999px; padding: 2px 8px; }
    .arrival-badge.ok { color: #3cfa44; border-color: #3cfa44; }
    .btn-mini { background: #303030; color: #dcdcdc; border: 1px solid #4a4a4a; border-radius: 6px;
      padding: 4px 9px; font-size: 11px; cursor: pointer; white-space: nowrap; }
    .arrival-list { display: flex; flex-direction: column; gap: 6px; }
    .arrival-row { display: flex; justify-content: space-between; align-items: center; gap: 8px;
      background: #202020; border: 1px solid #333; border-radius: 6px; padding: 7px 10px; font-size: 13px; }
    .arrival-line { color: #dcdcdc; }
    .arrival-eta { color: #3cfa44; font-weight: 700; }
    .arrival-empty { font-size: 12px; color: #8c8c8c; }
    .sub-details { margin-top: 4px; border-top: 1px solid #353535; padding-top: 8px; }
    .summary-sub { cursor: pointer; font-size: 12px; color: #b5b5b5; }
    .form { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
    .checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #cccccc; cursor: pointer; }
    .checkbox-row input { flex: 0 0 auto; width: auto; }
    .search-feedback { font-size: 12px; color: #9a9a9a; min-height: 16px; }
    .search-feedback.ok { color: #3cfa44; }
    .search-feedback.error { color: #ff6b63; }
    .hidden { display: none !important; }
    .map-wrap { display: flex; flex-direction: column; gap: 8px; }
    .map-box { width: 100%; height: 220px; border-radius: 10px; border: 1px solid #3c3c3c; overflow: hidden; background: #141414; }
    .candidate-list { display: flex; flex-direction: column; gap: 6px; max-height: 170px; overflow-y: auto; }
    .candidate-item { display: flex; align-items: center; gap: 8px; text-align: left;
      background: #202020; border: 1px solid #363636; border-radius: 8px; padding: 7px 10px; color: #e5e5e5; cursor: pointer; }
    .candidate-num { width: 20px; height: 20px; border-radius: 50%; background: #235d28; color: #3cfa44;
      font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .candidate-info { display: flex; flex-direction: column; min-width: 0; }
    .candidate-info strong { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .candidate-info small { font-size: 11px; color: #9a9a9a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .map-pin-wrap { background: transparent; border: none; }
    .map-pin { width: 24px; height: 24px; border-radius: 50%; background: #1e1e1e; border: 2px solid #3cfa44;
      color: #3cfa44; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
    .map-pin.active { background: #3cfa44; color: #111; }
    .map-pin.station { width: auto; padding: 2px 8px; border-radius: 999px; background: #183a1b; color: #3cfa44; white-space: nowrap; }
    .gps-auto-toggle { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #cfcfcf; cursor: pointer; white-space: nowrap; }
    .gps-auto-toggle input { flex: 0 0 auto; width: auto; margin: 0; }
    .btn { background: #363636; color: #f0f0f0; border: 1px solid #4d4d4d; border-radius: 8px;
      padding: 8px 12px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn.primary { background: #235d28; border-color: #3cfa44; color: #3cfa44; }
    footer { font-size: 12px; color: #7b7b7b; text-align: center; }
  `
  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)
}