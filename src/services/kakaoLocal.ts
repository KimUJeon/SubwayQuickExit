import { getAllGraphStationNames } from '../data/subwayGraph'

export interface KakaoConfig {
  proxyUrl?: string
  restApiKey?: string
}

export interface PlaceCandidate {
  placeName: string
  address: string
  category: string
  lat: number
  lng: number
}

export interface PlaceSearchResult {
  ok: boolean
  candidates: PlaceCandidate[]
  message: string
}

export interface NearestStationResult {
  stationName: string | null
  distanceMeters: number | null
  stationLat: number | null
  stationLng: number | null
}

const SUPPORTED_STATIONS = new Set(getAllGraphStationNames())

function normalizeKakaoStationName(raw: string): string {
  // e.g. "강남역 2호선" or "총신대입구역(이수)" -> match graph station name
  const firstToken = raw.trim().split(/\s+/)[0] ?? ''
  if (firstToken === '서울역') return '서울역'
  const stripped = firstToken.endsWith('역') && firstToken.length > 1 ? firstToken.slice(0, -1) : firstToken
  if (SUPPORTED_STATIONS.has(stripped)) return stripped
  if (SUPPORTED_STATIONS.has(firstToken)) return firstToken
  // Handle "이수" <-> "총신대입구(이수)"
  if (stripped === '이수' || stripped === '총신대입구') return '총신대입구(이수)'
  return stripped
}

async function kakaoFetch<T>(pathAndQuery: string, config: KakaoConfig): Promise<T> {
  const proxy = config.proxyUrl?.trim().replace(/\/+$/, '')
  const key = config.restApiKey?.trim()
  if (!proxy && !key) {
    throw new Error('카카오 API 키 또는 프록시 URL을 설정해 주세요.')
  }
  const res = await fetch(
    proxy ? `${proxy}/kakao${pathAndQuery}` : `https://dapi.kakao.com${pathAndQuery}`,
    proxy ? undefined : { headers: { Authorization: `KakaoAK ${key}` } },
  )
  if (!res.ok) {
    let detail = ''
    try {
      const errJson = (await res.json()) as { message?: string; error?: string }
      detail = errJson.message || errJson.error || ''
    } catch {
      detail = ''
    }
    throw new Error(
      detail ? `API 오류 (${res.status}): ${detail}` : `API 오류 (${res.status})`,
    )
  }
  return (await res.json()) as T
}

interface KakaoKeywordDoc {
  place_name: string
  category_group_name?: string
  road_address_name?: string
  address_name?: string
  x: string // longitude
  y: string // latitude
}

interface KakaoCategoryDoc {
  place_name: string
  distance: string
  x: string
  y: string
}

export async function findNearestSupportedStation(
  lng: string,
  lat: string,
  config: KakaoConfig,
): Promise<NearestStationResult> {
  const data = await kakaoFetch<{ documents?: KakaoCategoryDoc[] }>(
    `/v2/local/search/category.json?category_group_code=SW8&x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}&radius=3000&sort=distance&size=10`,
    config,
  )

  const docs = data.documents ?? []
  for (const doc of docs) {
    const normalized = normalizeKakaoStationName(doc.place_name)
    if (SUPPORTED_STATIONS.has(normalized)) {
      return {
        stationName: normalized,
        distanceMeters: Number(doc.distance) || null,
        stationLat: Number(doc.y) || null,
        stationLng: Number(doc.x) || null,
      }
    }
  }
  return { stationName: null, distanceMeters: null, stationLat: null, stationLng: null }
}

export async function searchPlaceCandidates(
  query: string,
  config: KakaoConfig,
): Promise<PlaceSearchResult> {
  const clean = query.trim()
  if (!clean) {
    return { ok: false, candidates: [], message: '검색어를 입력해 주세요.' }
  }

  try {
    const data = await kakaoFetch<{ documents?: KakaoKeywordDoc[] }>(
      `/v2/local/search/keyword.json?query=${encodeURIComponent(clean)}&size=8`,
      config,
    )
    const docs = data.documents ?? []
    if (docs.length === 0) {
      return { ok: false, candidates: [], message: `'${clean}' 검색 결과가 없습니다.` }
    }

    const candidates: PlaceCandidate[] = docs.map(doc => ({
      placeName: doc.place_name,
      address: doc.road_address_name || doc.address_name || '',
      category: doc.category_group_name || '',
      lat: Number(doc.y),
      lng: Number(doc.x),
    }))

    return {
      ok: true,
      candidates,
      message: `'${clean}' 검색 결과 ${candidates.length}건 — 지도나 목록에서 선택하세요.`,
    }
  } catch (err) {
    return {
      ok: false,
      candidates: [],
      message: err instanceof Error ? err.message : '장소 검색 실패',
    }
  }
}
