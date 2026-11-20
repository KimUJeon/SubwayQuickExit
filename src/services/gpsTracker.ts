import { findNearestSupportedStation, type KakaoConfig } from './kakaoLocal'

const AUTO_GPS_MIN_INTERVAL_MS = 15_000
const AUTO_GPS_RADIUS_M = 450
const AUTO_GPS_MAX_ACCURACY_M = 800

export interface GpsWatchCallbacks {
  getConfig: () => KakaoConfig
  onStationNearby: (stationName: string, distanceMeters: number) => void
  onFeedback: (kind: 'ok' | 'error' | 'info', text: string) => void
  onAutoDisabled: () => void
}

let autoGpsWatchId: number | null = null
let lastAutoGpsCheckMs = 0
let watchToken = 0

export function stopAutoGpsWatch(): void {
  watchToken++
  lastAutoGpsCheckMs = 0
  if (autoGpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(autoGpsWatchId)
    autoGpsWatchId = null
  }
}

export function startAutoGpsWatch(callbacks: GpsWatchCallbacks): void {
  if (!window.isSecureContext) {
    callbacks.onAutoDisabled()
    callbacks.onFeedback('error', 'GPS 자동진행은 HTTPS(배포/터널) 환경에서만 지원됩니다.')
    return
  }
  if (!navigator.geolocation) {
    callbacks.onAutoDisabled()
    callbacks.onFeedback('error', '이 기기에서 GPS를 지원하지 않습니다.')
    return
  }
  stopAutoGpsWatch()
  const myToken = watchToken
  callbacks.onFeedback('info', 'GPS 자동진행 활성화 (정차역 450m 이내 자동 전환)')
  autoGpsWatchId = navigator.geolocation.watchPosition(
    async pos => {
      if (myToken !== watchToken) return
      const now = Date.now()
      if (now - lastAutoGpsCheckMs < AUTO_GPS_MIN_INTERVAL_MS) return
      if (Number.isFinite(pos.coords.accuracy) && pos.coords.accuracy > AUTO_GPS_MAX_ACCURACY_M) {
        return
      }
      lastAutoGpsCheckMs = now

      try {
        const nearest = await findNearestSupportedStation(
          String(pos.coords.longitude),
          String(pos.coords.latitude),
          callbacks.getConfig(),
        )
        if (myToken !== watchToken) return
        if (
          !nearest.stationName ||
          nearest.distanceMeters === null ||
          nearest.distanceMeters > AUTO_GPS_RADIUS_M
        ) {
          return
        }
        callbacks.onStationNearby(nearest.stationName, nearest.distanceMeters)
      } catch {
        // Ignore transient GPS lookup errors during background watch
      }
    },
    err => {
      stopAutoGpsWatch()
      callbacks.onAutoDisabled()
      if (err.code === 1) {
        callbacks.onFeedback('error', '위치 권한이 거부되어 GPS 자동진행이 꺼졌습니다.')
      }
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
  )
}

export function requestCurrentLocationStation(
  getConfig: () => KakaoConfig,
  onSuccess: (stationName: string, distanceMeters: number | null) => void,
  onFeedback: (kind: 'ok' | 'error' | 'info', text: string) => void,
): void {
  if (!window.isSecureContext) {
    onFeedback(
      'error',
      'HTTP 접속에서는 GPS가 차단됩니다. HTTPS(배포/터널) 또는 출발지 검색을 이용해 주세요.',
    )
    return
  }
  if (!navigator.geolocation) {
    onFeedback('error', '이 기기에서 위치 정보를 지원하지 않습니다.')
    return
  }
  onFeedback('info', '현재 위치 확인 중…')
  navigator.geolocation.getCurrentPosition(
    async pos => {
      try {
        const nearest = await findNearestSupportedStation(
          String(pos.coords.longitude),
          String(pos.coords.latitude),
          getConfig(),
        )
        if (!nearest.stationName) {
          onFeedback('error', '주변 3km 내 지원 지하철역이 없습니다.')
          return
        }
        onSuccess(nearest.stationName, nearest.distanceMeters)
      } catch (err) {
        onFeedback(
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
      onFeedback('error', msg)
    },
    { enableHighAccuracy: true, timeout: 8000 },
  )
}