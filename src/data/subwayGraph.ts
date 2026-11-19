export interface NavStep {
  index: number
  kind: 'board' | 'ride' | 'transfer' | 'arrive'
  line: string
  stationName: string
  direction: string
  remainingToGoal: number
  remainingToLegEnd: number
  actionTitle: string
  targetLabel: string
  car: number
  door: number
  note: string
  totalCars: number
}

export interface NavRoute {
  fromName: string
  toName: string
  totalStops: number
  transferCount: number
  estimatedMinutes: number
  legsSummary: string
  steps: NavStep[]
}

export interface ExitInfo {
  label: string
  car: number
  door: number
  note: string
}

const LINE_STATIONS: Record<string, string[]> = {
  '2호선': [
    '시청', '을지로입구', '을지로3가', '을지로4가', '동대문역사문화공원', '신당', '상왕십리', '왕십리',
    '한양대', '뚝섬', '성수', '건대입구', '구의', '강변', '잠실나루', '잠실', '잠실새내', '종합운동장',
    '삼성', '선릉', '역삼', '강남', '교대', '서초', '방배', '사당', '낙성대', '서울대입구', '봉천',
    '신림', '신대방', '구로디지털단지', '대림', '신도림', '문래', '영등포구청', '당산', '합정',
    '홍대입구', '신촌', '이대', '아현', '충정로',
  ],
  '3호선': [
    '구파발', '연신내', '불광', '녹번', '홍제', '무악재', '독립문', '경복궁', '안국', '종로3가',
    '을지로3가', '충무로', '동대입구', '약수', '금호', '옥수', '압구정', '신사', '잠원', '고속터미널',
    '교대', '남부터미널', '양재', '매봉', '도곡', '대치', '학여울', '대청', '일원', '수서',
  ],
  '4호선': [
    '노원', '창동', '쌍문', '수유', '미아', '미아사거리', '길음', '성신여대입구', '한성대입구', '혜화',
    '동대문', '동대문역사문화공원', '충무로', '명동', '회현', '서울역', '숙대입구', '삼각지', '신용산',
    '이촌', '동작', '총신대입구(이수)', '사당', '남태령', '선바위', '과천', '정부과천청사', '범계', '평촌', '금정',
  ],
  '5호선': [
    '방화', '김포공항', '송정', '마곡', '발산', '우장산', '화곡', '까치산', '신정', '목동', '오목교',
    '양평', '영등포구청', '영등포시장', '신길', '여의도', '여의나루', '마포', '공덕', '애오개', '충정로',
    '서대문', '광화문', '종로3가', '을지로4가', '동대문역사문화공원', '청구', '신금호', '행당', '왕십리',
    '마장', '답십리', '장한평', '군자', '아차산', '광나루', '천호', '강동',
  ],
  '7호선': [
    '노원', '중계', '하계', '공릉', '태릉입구', '먹골', '중화', '상봉', '면목', '사가정', '용마산',
    '중곡', '군자', '어린이대공원', '건대입구', '자양', '청담', '강남구청', '학동', '논현', '반포',
    '고속터미널', '내방', '총신대입구(이수)', '남성', '숭실대입구', '상도', '장승배기', '신대방삼거리',
    '보라매', '신풍', '대림', '남구로', '가산디지털단지', '철산', '광명사거리', '천왕', '온수',
  ],
  '9호선': [
    '김포공항', '공항시장', '신방화', '마곡나루', '양천향교', '가양', '증미', '등촌', '염창', '신목동',
    '선유도', '당산', '국회의사당', '여의도', '샛강', '노량진', '노들', '흑석', '동작', '구반포',
    '신반포', '고속터미널', '사평', '신논현', '언주', '선정릉', '삼성중앙', '봉은사', '종합운동장',
    '삼전', '석촌고분', '석촌', '송파나루', '한성백제', '올림픽공원', '둔촌오륜', '중앙보훈병원',
  ],
  '신분당선': [
    '신사', '논현', '신논현', '강남', '양재', '양재시민의숲', '청계산입구', '판교', '정자', '미금',
    '동천', '수지구청', '성복', '상현', '광교중앙', '광교',
  ],
}

const CIRCULAR_LINES = new Set(['2호선'])

const LINE_CARS: Record<string, number> = {
  '2호선': 10,
  '3호선': 10,
  '4호선': 10,
  '5호선': 8,
  '7호선': 8,
  '9호선': 6,
  '신분당선': 6,
}

// 빠른환승 정보: "역명|탑승노선|환승노선" -> { car, door, note }
const TRANSFER_DOORS: Record<string, { car: number; door: number; note: string }> = {
  '사당|2호선|4호선': { car: 5, door: 3, note: '4호선 계단 바로 연결' },
  '사당|4호선|2호선': { car: 5, door: 2, note: '2호선 내선/외선 중앙 계단' },
  '강남|2호선|신분당선': { car: 4, door: 2, note: '중앙 에스컬레이터 · 도보 약 2분' },
  '강남|신분당선|2호선': { car: 3, door: 2, note: '2호선 연결 에스컬레이터' },
  '고속터미널|3호선|9호선': { car: 2, door: 1, note: '9호선 승강장 최단 환승통로' },
  '고속터미널|9호선|3호선': { car: 2, door: 2, note: '3호선 방면 에스컬레이터' },
  '고속터미널|3호선|7호선': { car: 8, door: 3, note: '7호선 부평구청·장암 방면' },
  '고속터미널|7호선|3호선': { car: 4, door: 2, note: '3호선 대치·대화 방면' },
  '고속터미널|7호선|9호선': { car: 6, door: 1, note: '9호선 환승통로 연결' },
  '고속터미널|9호선|7호선': { car: 5, door: 3, note: '7호선 환승통로 연결' },
  '여의도|9호선|5호선': { car: 3, door: 2, note: '5호선 방화·하남 방면 에스컬레이터' },
  '여의도|5호선|9호선': { car: 4, door: 3, note: '9호선 급행·일반 승강장 연결' },
  '잠실|2호선|8호선': { car: 8, door: 4, note: '8호선 연결통로 인접' },
  '교대|2호선|3호선': { car: 5, door: 1, note: '3호선 중앙 환승 계단' },
  '교대|3호선|2호선': { car: 6, door: 2, note: '2호선 내·외선 중앙 계단' },
  '신논현|9호선|신분당선': { car: 4, door: 2, note: '신분당선 직통 에스컬레이터' },
  '신논현|신분당선|9호선': { car: 3, door: 1, note: '9호선 환승 계단' },
  '양재|3호선|신분당선': { car: 9, door: 2, note: '신분당선 판교·광교 방면' },
  '양재|신분당선|3호선': { car: 4, door: 3, note: '3호선 환승통로' },
  '종로3가|3호선|5호선': { car: 9, door: 4, note: '5호선 긴 환승통로(무빙워크)' },
  '종로3가|5호선|3호선': { car: 1, door: 2, note: '3호선 방면 에스컬레이터' },
  '충무로|3호선|4호선': { car: 5, door: 2, note: '4호선 맞은편/계단 환승' },
  '충무로|4호선|3호선': { car: 5, door: 3, note: '3호선 중앙 계단 환승' },
  '동대문역사문화공원|2호선|4호선': { car: 6, door: 3, note: '4호선 환승 계단' },
  '동대문역사문화공원|2호선|5호선': { car: 3, door: 1, note: '5호선 환승통로' },
  '대림|2호선|7호선': { car: 2, door: 2, note: '7호선 에스컬레이터 연결' },
  '대림|7호선|2호선': { car: 7, door: 3, note: '2호선 지상 승강장 연결' },
  '당산|2호선|9호선': { car: 9, door: 1, note: '9호선 초고속 에스컬레이터' },
  '당산|9호선|2호선': { car: 5, door: 2, note: '2호선 고가 승강장 연결' },
  '건대입구|2호선|7호선': { car: 3, door: 2, note: '7호선 지하 환승통로' },
  '건대입구|7호선|2호선': { car: 5, door: 1, note: '2호선 지상 승강장 연결' },
}

// 주요 역 출구 빠른하차 정보
export const STATION_EXITS: Record<string, ExitInfo[]> = {
  '강남': [
    { label: '11·12번 출구', car: 5, door: 1, note: '테헤란로 · 강남역 CGV 방면' },
    { label: '1·2번 출구', car: 1, door: 3, note: '역삼 방면 · 삼성서초사옥' },
    { label: '9·10번 출구', car: 9, door: 4, note: '서초대로 · 교대 방면' },
  ],
  '사당': [
    { label: '4·5번 출구', car: 2, door: 1, note: '관악 방면 · 남현동' },
    { label: '10·11번 출구', car: 9, door: 2, note: '이수·방배 방면' },
  ],
  '여의도': [
    { label: '3·4번 출구', car: 5, door: 1, note: 'IFC몰 · 더현대 서울 연결통로' },
    { label: '1·2번 출구', car: 1, door: 4, note: '여의도공원 방면' },
  ],
  '잠실': [
    { label: '1·2번 출구', car: 2, door: 2, note: '롯데월드타워 · 송파구청 방면' },
    { label: '3·4번 출구', car: 5, door: 1, note: '롯데월드 어드벤처 방면' },
  ],
  '홍대입구': [
    { label: '9번 출구', car: 8, door: 1, note: '홍대 걷고싶은거리 · 메인 상권' },
    { label: '1·2번 출구', car: 4, door: 2, note: '서교동 · 동교동 삼거리' },
  ],
  '성수': [
    { label: '3번 출구', car: 3, door: 4, note: '연무장길 · 성수 카페거리' },
    { label: '1·2번 출구', car: 8, door: 1, note: '뚝섬 방면 · 성수동1가' },
  ],
  '고속터미널': [
    { label: '8-1·8-2번 출구', car: 4, door: 2, note: '신세계백화점 · 파미에스테이션' },
    { label: '1·2번 출구', car: 7, door: 3, note: '경부선·호남선 터미널 방면' },
  ],
  '판교': [
    { label: '1·4번 출구', car: 3, door: 2, note: '판교테크노밸리 · 알파돔시티' },
  ],
  '선릉': [
    { label: '1·10번 출구', car: 5, door: 2, note: '테헤란로 · 포스코사거리 방면' },
  ],
  '삼성': [
    { label: '5·6번 출구', car: 5, door: 1, note: '코엑스몰 · 스타필드 직결' },
  ],
  '서울역': [
    { label: '1·2번 출구', car: 4, door: 2, note: 'KTX 대합실 · 공항철도 방면' },
  ],
}

export function getAllGraphStationNames(): string[] {
  const set = new Set<string>()
  for (const list of Object.values(LINE_STATIONS)) {
    for (const s of list) set.add(s)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
}

export function getStationLines(stationName: string): string[] {
  const clean = cleanName(stationName)
  const lines: string[] = []
  for (const [line, list] of Object.entries(LINE_STATIONS)) {
    if (list.includes(clean)) lines.push(line)
  }
  return lines
}

function cleanName(name: string): string {
  const t = name.trim()
  if (t === '서울역') return '서울역'
  return t.endsWith('역') && t.length > 1 ? t.slice(0, -1) : t
}

interface GraphNode {
  key: string // `${line}::${station}`
  line: string
  station: string
}

interface Edge {
  to: string
  cost: number
  isTransfer: boolean
}

function buildGraph(): { nodes: Map<string, GraphNode>; adj: Map<string, Edge[]> } {
  const nodes = new Map<string, GraphNode>()
  const adj = new Map<string, Edge[]>()
  const byStation = new Map<string, string[]>()

  const ensureNode = (line: string, station: string) => {
    const key = `${line}::${station}`
    if (!nodes.has(key)) {
      nodes.set(key, { key, line, station })
      adj.set(key, [])
      const list = byStation.get(station) ?? []
      list.push(key)
      byStation.set(station, list)
    }
    return key
  }

  for (const [line, list] of Object.entries(LINE_STATIONS)) {
    for (let i = 0; i < list.length; i++) {
      const a = ensureNode(line, list[i])
      if (i + 1 < list.length) {
        const b = ensureNode(line, list[i + 1])
        adj.get(a)!.push({ to: b, cost: 1, isTransfer: false })
        adj.get(b)!.push({ to: a, cost: 1, isTransfer: false })
      }
    }
    if (CIRCULAR_LINES.has(line) && list.length > 2) {
      const first = ensureNode(line, list[0])
      const last = ensureNode(line, list[list.length - 1])
      adj.get(first)!.push({ to: last, cost: 1, isTransfer: false })
      adj.get(last)!.push({ to: first, cost: 1, isTransfer: false })
    }
  }

  // Transfer edges between same station on different lines (cost 3 to avoid unnecessary transfers)
  for (const keys of byStation.values()) {
    if (keys.length < 2) continue
    for (let i = 0; i < keys.length; i++) {
      for (let j = 0; j < keys.length; j++) {
        if (i !== j) {
          adj.get(keys[i])!.push({ to: keys[j], cost: 3, isTransfer: true })
        }
      }
    }
  }

  return { nodes, adj }
}

const GRAPH = buildGraph()

function getDirectionLabel(line: string, fromStation: string, nextStation?: string): string {
  if (!nextStation) return `${line}`
  const list = LINE_STATIONS[line]
  if (!list) return `${nextStation} 방면`
  const i1 = list.indexOf(fromStation)
  const i2 = list.indexOf(nextStation)
  if (i1 === -1 || i2 === -1) return `${nextStation} 방면`

  if (CIRCULAR_LINES.has(line)) {
    const isInner = (i1 + 1) % list.length === i2
    return isInner ? `내선 (${nextStation} 방면)` : `외선 (${nextStation} 방면)`
  }
  return i2 > i1 ? `하행 (${nextStation} 방면)` : `상행 (${nextStation} 방면)`
}

export function findSubwayRoute(
  rawFrom: string,
  rawTo: string,
  preferredExitIdx = 0,
): NavRoute | null {
  const from = cleanName(rawFrom)
  const to = cleanName(rawTo)
  if (!from || !to || from === to) return null

  const startKeys = Array.from(GRAPH.nodes.values())
    .filter(n => n.station === from)
    .map(n => n.key)
  const goalSet = new Set(
    Array.from(GRAPH.nodes.values())
      .filter(n => n.station === to)
      .map(n => n.key),
  )

  if (startKeys.length === 0 || goalSet.size === 0) return null

  // Dijkstra
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  const queue: Array<{ key: string; cost: number }> = []

  for (const sk of startKeys) {
    dist.set(sk, 0)
    prev.set(sk, null)
    queue.push({ key: sk, cost: 0 })
  }

  let foundGoal: string | null = null
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost)
    const cur = queue.shift()!
    if (cur.cost > (dist.get(cur.key) ?? Infinity)) continue
    if (goalSet.has(cur.key)) {
      foundGoal = cur.key
      break
    }
    for (const edge of GRAPH.adj.get(cur.key) ?? []) {
      const nextCost = cur.cost + edge.cost
      if (nextCost < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nextCost)
        prev.set(edge.to, cur.key)
        queue.push({ key: edge.to, cost: nextCost })
      }
    }
  }

  if (!foundGoal) return null

  const rawPath: GraphNode[] = []
  let curr: string | null = foundGoal
  while (curr) {
    rawPath.unshift(GRAPH.nodes.get(curr)!)
    curr = prev.get(curr) ?? null
  }

  // Split path into legs by line
  interface Leg {
    line: string
    nodes: GraphNode[]
    endTransferToLine: string | null
  }
  const legs: Leg[] = []
  for (const node of rawPath) {
    const lastLeg = legs[legs.length - 1]
    if (!lastLeg || lastLeg.line !== node.line) {
      if (lastLeg) {
        lastLeg.endTransferToLine = node.line
      }
      legs.push({ line: node.line, nodes: [node], endTransferToLine: null })
    } else {
      lastLeg.nodes.push(node)
    }
  }

  const exitChoices = STATION_EXITS[to] ?? [
    { label: '중앙 출구/개찰구', car: 5, door: 2, note: '역 중앙 에스컬레이터 방면' },
  ]
  const chosenExit = exitChoices[Math.max(0, Math.min(exitChoices.length - 1, preferredExitIdx))]

  const totalStops = rawPath.filter((_, idx) => idx > 0 && rawPath[idx].line === rawPath[idx - 1].line).length
  const transferCount = Math.max(0, legs.length - 1)
  const estimatedMinutes = Math.max(2, totalStops * 2 + transferCount * 3)

  const steps: NavStep[] = []
  let stopsPassed = 0

  for (let li = 0; li < legs.length; li++) {
    const leg = legs[li]
    const totalCars = LINE_CARS[leg.line] ?? 10
    const legEndStation = leg.nodes[leg.nodes.length - 1].station
    const transferKey = leg.endTransferToLine
      ? `${legEndStation}|${leg.line}|${leg.endTransferToLine}`
      : null
    const transferDoor = transferKey ? TRANSFER_DOORS[transferKey] : null

    const legTarget = leg.endTransferToLine
      ? {
          label: `${legEndStation}역 ${leg.endTransferToLine} 환승`,
          car: transferDoor?.car ?? Math.ceil(totalCars / 2),
          door: transferDoor?.door ?? 2,
          note: transferDoor?.note ?? `${leg.endTransferToLine} 환승통로 방면`,
        }
      : {
          label: `${to}역 ${chosenExit.label}`,
          car: Math.min(totalCars, chosenExit.car),
          door: chosenExit.door,
          note: chosenExit.note,
        }

    for (let ni = 0; ni < leg.nodes.length; ni++) {
      const node = leg.nodes[ni]
      const nextNode = leg.nodes[ni + 1]
      const isFirstOfLeg = ni === 0
      const isLastOfLeg = ni === leg.nodes.length - 1
      const isFinalGoal = li === legs.length - 1 && isLastOfLeg

      // Skip duplicate station node on transfer leg start (already represented by transfer at end of prev leg)
      if (li > 0 && isFirstOfLeg) {
        continue
      }

      if (!isFirstOfLeg) stopsPassed++
      const remainingToLegEnd = leg.nodes.length - 1 - ni
      const remainingToGoal = Math.max(0, totalStops - stopsPassed)

      let kind: NavStep['kind'] = 'ride'
      let actionTitle = `${leg.line} 이동 중 (${remainingToLegEnd}정거장 후 ${leg.endTransferToLine ? '환승' : '하차'})`

      if (li === 0 && isFirstOfLeg) {
        kind = 'board'
        actionTitle = `${node.station}역 승차 (${leg.line})`
      } else if (isFinalGoal) {
        kind = 'arrive'
        actionTitle = `${node.station}역 도착 · 하차!`
      } else if (isLastOfLeg && leg.endTransferToLine) {
        kind = 'transfer'
        actionTitle = `${node.station}역 하차 → ${leg.endTransferToLine} 환승`
      }

      const direction = nextNode
        ? getDirectionLabel(leg.line, node.station, nextNode.station)
        : leg.nodes.length >= 2
          ? getDirectionLabel(leg.line, leg.nodes[leg.nodes.length - 2].station, node.station)
          : leg.line

      steps.push({
        index: steps.length,
        kind,
        line: leg.line,
        stationName: node.station,
        direction,
        remainingToGoal,
        remainingToLegEnd,
        actionTitle,
        targetLabel: legTarget.label,
        car: legTarget.car,
        door: legTarget.door,
        note: legTarget.note,
        totalCars,
      })
    }
  }

  const legsSummary = legs
    .map(l => `${l.line}(${l.nodes[0].station}→${l.nodes[l.nodes.length - 1].station})`)
    .join(' → ')

  return {
    fromName: from,
    toName: to,
    totalStops,
    transferCount,
    estimatedMinutes,
    legsSummary,
    steps,
  }
}
