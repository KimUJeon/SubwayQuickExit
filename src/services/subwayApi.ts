import { toSeoulApiStationName } from '../utils/stationName.ts'

export interface TrainArrival {
  trainLineNm: string // e.g. "성수행 - 방배방면"
  arvlMsg2: string // e.g. "2분 30초 후", "전역 도착", "강남 진입"
  arvlMsg3: string // current station e.g. "교대"
  updnLine: string // "내선", "외선", "상행", "하행"
  barvlDt: number // seconds until arrival
  btrainSttus: string // "일반", "급행", "ITX"
}

export interface ArrivalResult {
  ok: boolean
  arrivals: TrainArrival[]
  message: string
  fetchedAt: string
}

const LINE_ID_MAP: Record<string, string> = {
  '1호선': '1001',
  '2호선': '1002',
  '3호선': '1003',
  '4호선': '1004',
  '5호선': '1005',
  '6호선': '1006',
  '7호선': '1007',
  '8호선': '1008',
  '9호선': '1009',
  '중앙선': '1061',
  '경의중앙선': '1063',
  '공항철도': '1065',
  '경춘선': '1067',
  '수인분당선': '1075',
  '신분당선': '1077',
  '우이신설선': '1092',
  'GTX-A': '1032',
}

export function normalizeStationName(name: string): string {
  return toSeoulApiStationName(name)
}

function detectDirectionKeyword(direction: string): string | null {
  if (direction.includes('내선')) return '내선'
  if (direction.includes('외선')) return '외선'
  if (direction.includes('상행')) return '상행'
  if (direction.includes('하행')) return '하행'
  return null
}

function formatNowTime(): string {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export async function fetchRealtimeArrivals(
  apiKey: string,
  stationName: string,
  line: string,
  direction: string,
  proxyUrl?: string,
): Promise<ArrivalResult> {
  const cleanKey = apiKey.trim()
  const cleanProxy = proxyUrl?.trim().replace(/\/+$/, '')
  if (!cleanKey && !cleanProxy) {
    return {
      ok: false,
      arrivals: [],
      message: 'API 키 미설정',
      fetchedAt: formatNowTime(),
    }
  }

  const queryName = encodeURIComponent(normalizeStationName(stationName))
  const url = cleanProxy
    ? `${cleanProxy}/seoul/realtimeStationArrival?station=${queryName}`
    : `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(cleanKey)}/json/realtimeStationArrival/0/12/${queryName}`

  try {
    const res = await fetch(url)
    if (!res.ok) {
      return {
        ok: false,
        arrivals: [],
        message: `HTTP ${res.status}`,
        fetchedAt: formatNowTime(),
      }
    }
    const data = (await res.json()) as {
      errorMessage?: { code?: string; message?: string; status?: number }
      realtimeArrivalList?: Array<{
        subwayId?: string
        updnLine?: string
        trainLineNm?: string
        arvlMsg2?: string
        arvlMsg3?: string
        barvlDt?: string
        btrainSttus?: string
      }>
    }

    if (data.errorMessage?.status && data.errorMessage.status !== 200) {
      return {
        ok: false,
        arrivals: [],
        message: data.errorMessage.message || `오류(${data.errorMessage.code ?? data.errorMessage.status})`,
        fetchedAt: formatNowTime(),
      }
    }

    const rawList = data.realtimeArrivalList ?? []
    const targetSubwayId = LINE_ID_MAP[line.trim()]
    const dirKeyword = detectDirectionKeyword(direction)

    let filtered = rawList
    if (targetSubwayId) {
      filtered = filtered.filter(item => item.subwayId === targetSubwayId)
    }
    if (dirKeyword) {
      const byDir = filtered.filter(item => item.updnLine === dirKeyword)
      if (byDir.length > 0 || filtered.some(item => Boolean(item.updnLine))) {
        filtered = byDir
      }
    }

    const arrivals: TrainArrival[] = filtered.slice(0, 2).map(item => ({
      trainLineNm: item.trainLineNm ?? '',
      arvlMsg2: item.arvlMsg2 ?? '정보 없음',
      arvlMsg3: item.arvlMsg3 ?? '',
      updnLine: item.updnLine ?? '',
      barvlDt: Number(item.barvlDt ?? 0),
      btrainSttus: item.btrainSttus ?? '일반',
    }))

    return {
      ok: true,
      arrivals,
      message: arrivals.length > 0 ? '실시간 연결됨' : '운행 정보 없음',
      fetchedAt: formatNowTime(),
    }
  } catch (err) {
    return {
      ok: false,
      arrivals: [],
      message: err instanceof Error ? `네트워크 오류` : '조회 실패',
      fetchedAt: formatNowTime(),
    }
  }
}

export function createDemoArrivals(stationName: string, direction: string): ArrivalResult {
  const dir = detectDirectionKeyword(direction) ?? '방면'
  const sec1 = 90 + (new Date().getSeconds() % 60)
  const min1 = Math.floor(sec1 / 60)
  const rem1 = sec1 % 60
  return {
    ok: true,
    arrivals: [
      {
        trainLineNm: `${normalizeStationName(stationName)} (${dir})`,
        arvlMsg2: `${min1}분 ${rem1}초 후`,
        arvlMsg3: '전역 출발',
        updnLine: dir,
        barvlDt: sec1,
        btrainSttus: '일반',
      },
      {
        trainLineNm: `${normalizeStationName(stationName)} (${dir})`,
        arvlMsg2: `${min1 + 5}분 후`,
        arvlMsg3: '2전역',
        updnLine: dir,
        barvlDt: sec1 + 300,
        btrainSttus: '일반',
      },
    ],
    message: '데모 실시간',
    fetchedAt: formatNowTime(),
  }
}