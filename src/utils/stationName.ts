/**
 * Station name normalization utilities shared across graph lookup,
 * Kakao Local search, and Seoul Open Data realtime arrival APIs.
 */

export function cleanGraphStationName(raw: string): string {
  const t = raw.trim()
  if (t === '서울역') return '서울역'
  return t.endsWith('역') && t.length > 1 ? t.slice(0, -1) : t
}

export function normalizeKakaoStationName(
  raw: string,
  supportedStations: Set<string>,
): string {
  // e.g. "강남역 2호선" or "총신대입구역(이수)" -> match graph station name
  const firstToken = raw.trim().split(/\s+/)[0] ?? ''
  if (firstToken === '서울역') return '서울역'
  if (supportedStations.has(firstToken)) return firstToken
  const stripped = firstToken.replace(/역(\([^)]+\))?$/, '$1')
  if (supportedStations.has(stripped)) return stripped
  if (stripped === '이수' || stripped === '총신대입구') return '총신대입구(이수)'
  return stripped
}

export function toSeoulApiStationName(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '서울역') return '서울'
  return trimmed.endsWith('역') && trimmed.length > 1 ? trimmed.slice(0, -1) : trimmed
}

export function formatStationDisplay(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.endsWith('역') ? trimmed : `${trimmed}역`
}