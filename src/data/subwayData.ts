export interface QuickExitTarget {
  label: string
  car: number
  door: number
  note: string
}

export interface SubwayStation {
  id: string
  line: string
  direction: string
  name: string
  totalCars: number
  targets: QuickExitTarget[]
}

export const DEFAULT_STATIONS: SubwayStation[] = [
  {
    id: '2-inner-gangnam',
    line: '2호선',
    direction: '내선 (교대→역삼)',
    name: '강남역',
    totalCars: 10,
    targets: [
      { label: '신분당선 환승', car: 4, door: 2, note: '중앙 에스컬레이터 · 도보 약 2분' },
      { label: '11·12번 출구', car: 5, door: 1, note: '테헤란로 · 강남역 CGV 방면' },
      { label: '1·2번 출구', car: 1, door: 3, note: '역삼 방면 · 삼성서초사옥' },
      { label: '9·10번 출구', car: 9, door: 4, note: '서초대로 · 교대 방면' },
    ],
  },
  {
    id: '2-inner-sadang',
    line: '2호선',
    direction: '내선 (낙성대→방배)',
    name: '사당역',
    totalCars: 10,
    targets: [
      { label: '4호선 환승', car: 5, door: 3, note: '4호선 당고개·오이도 방면 계단 바로 연결' },
      { label: '4·5번 출구', car: 2, door: 1, note: '관악 방면 · 남현동' },
      { label: '10·11번 출구', car: 9, door: 2, note: '이수·방배 방면' },
    ],
  },
  {
    id: '2-inner-jamsil',
    line: '2호선',
    direction: '내선 (잠실새내→잠실나루)',
    name: '잠실역',
    totalCars: 10,
    targets: [
      { label: '8호선 환승', car: 8, door: 4, note: '롯데월드몰 지하 연결통로 인접' },
      { label: '1·2번 출구', car: 2, door: 2, note: '롯데월드타워 · 송파구청 방면' },
      { label: '3·4번 출구', car: 5, door: 1, note: '롯데월드 어드벤처 방면' },
    ],
  },
  {
    id: '2-inner-hongdae',
    line: '2호선',
    direction: '내선 (합정→신촌)',
    name: '홍대입구역',
    totalCars: 10,
    targets: [
      { label: '공항철도·경의중앙선 환승', car: 2, door: 3, note: '환승통로 무빙워크 방면' },
      { label: '9번 출구', car: 8, door: 1, note: '홍대 걷고싶은거리 · 메인 상권' },
      { label: '1·2번 출구', car: 4, door: 2, note: '서교동 · 동교동 삼거리' },
    ],
  },
  {
    id: '2-inner-seongsu',
    line: '2호선',
    direction: '내선 (뚝섬→건대입구)',
    name: '성수역',
    totalCars: 10,
    targets: [
      { label: '신설동 지선 환승', car: 5, door: 2, note: '맞은편 승강장 또는 계단 환승' },
      { label: '3번 출구', car: 3, door: 4, note: '연무장길 · 성수 카페거리' },
      { label: '1·2번 출구', car: 8, door: 1, note: '뚝섬 방면 · 성수동1가' },
    ],
  },
  {
    id: '3-south-express',
    line: '3호선',
    direction: '하행 (신사→교대)',
    name: '고속터미널역',
    totalCars: 10,
    targets: [
      { label: '9호선 환승', car: 2, door: 1, note: '9호선 급행 승강장 최단 경로' },
      { label: '7호선 환승', car: 8, door: 3, note: '7호선 부평구청·장암 방면' },
      { label: '8-1·8-2번 출구', car: 4, door: 2, note: '신세계백화점 · 파미에스테이션' },
    ],
  },
  {
    id: '9-east-yeouido',
    line: '9호선',
    direction: '급행 (당산→노량진)',
    name: '여의도역',
    totalCars: 6,
    targets: [
      { label: '5호선 환승', car: 3, door: 2, note: '5호선 방화·하남 방면 에스컬레이터' },
      { label: '3·4번 출구', car: 5, door: 1, note: 'IFC몰 · 더현대 서울 연결통로' },
      { label: '1·2번 출구', car: 1, door: 4, note: '여의도공원 방면' },
    ],
  },
]

export interface RouteStep {
  stationId: string
  targetIdx: number
}

export interface RoutePreset {
  id: string
  name: string
  steps: RouteStep[]
  isCustom?: boolean
}

export const DEFAULT_PRESETS: RoutePreset[] = [
  {
    id: 'preset-commute-in',
    name: '출근길 예시',
    steps: [
      { stationId: '2-inner-sadang', targetIdx: 0 },
      { stationId: '2-inner-gangnam', targetIdx: 1 },
    ],
  },
  {
    id: 'preset-commute-out',
    name: '퇴근길 예시',
    steps: [
      { stationId: '9-east-yeouido', targetIdx: 0 },
      { stationId: '3-south-express', targetIdx: 0 },
      { stationId: '2-inner-sadang', targetIdx: 1 },
    ],
  },
]

export function renderTrainDiagram(totalCars: number, targetCar: number): string {
  const cars: string[] = []
  for (let i = 1; i <= totalCars; i++) {
    cars.push(i === targetCar ? `[■${i}]` : `[${i}]`)
  }
  return cars.join('')
}
