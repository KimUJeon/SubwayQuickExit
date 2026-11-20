import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanGraphStationName,
  normalizeKakaoStationName,
  toSeoulApiStationName,
} from '../src/utils/stationName.ts'
import { findSubwayRoute, getStationExits } from '../src/data/subwayGraph.ts'
import { fetchRealtimeArrivals } from '../src/services/subwayApi.ts'

test('stationName normalization', () => {
  assert.equal(cleanGraphStationName('강남역'), '강남')
  assert.equal(cleanGraphStationName('서울역'), '서울역')
  assert.equal(toSeoulApiStationName('서울역'), '서울')
  assert.equal(toSeoulApiStationName('강남역'), '강남')

  const supported = new Set(['강남', '서울역', '총신대입구(이수)'])
  assert.equal(normalizeKakaoStationName('강남역 2호선', supported), '강남')
  assert.equal(normalizeKakaoStationName('이수역 4호선', supported), '총신대입구(이수)')
  assert.equal(normalizeKakaoStationName('총신대입구역(이수) 4호선', supported), '총신대입구(이수)')
  assert.equal(normalizeKakaoStationName('서울역 1호선', supported), '서울역')
})

test('findSubwayRoute handles same-line, circular 2호선, 1호선 and 8호선 transfers', () => {
  assert.equal(findSubwayRoute('강남', '강남'), null)

  const direct = findSubwayRoute('사당', '강남')
  assert.ok(direct)
  assert.equal(direct.transferCount, 0)
  assert.equal(direct.totalStops, 4)

  const line8 = findSubwayRoute('강남', '송파')
  assert.ok(line8)
  assert.equal(line8.transferCount, 1)
  assert.ok(line8.legsSummary.includes('2호선'))
  assert.ok(line8.legsSummary.includes('8호선'))

  const transferStep = line8.steps.find(s => s.kind === 'transfer')
  assert.ok(transferStep)
  assert.equal(transferStep.stationName, '잠실')
  assert.equal(transferStep.line, '8호선')
  assert.ok(transferStep.direction.includes('석촌'))

  const line1 = findSubwayRoute('서울역', '노량진')
  assert.ok(line1)
  assert.equal(line1.transferCount, 0)
  assert.ok(line1.legsSummary.includes('1호선'))

  assert.equal(getStationExits('없는역')[0].label, '중앙 출구/개찰구')
})

test('fetchRealtimeArrivals does not fall back to wrong line or direction when 0 matches', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        realtimeArrivalList: [
          {
            subwayId: '1002',
            updnLine: '외선',
            trainLineNm: '성수행 - 교대방면',
            arvlMsg2: '3분 후',
            arvlMsg3: '역삼',
            barvlDt: '180',
            btrainSttus: '일반',
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch

  try {
    const res = await fetchRealtimeArrivals('test-key', '강남', '2호선', '내선 (교대→역삼)')
    assert.equal(res.ok, true)
    assert.equal(res.arrivals.length, 0)
    assert.equal(res.message, '운행 정보 없음')
  } finally {
    globalThis.fetch = originalFetch
  }
})