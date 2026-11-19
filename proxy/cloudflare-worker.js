/**
 * SubwayQuickExit API Proxy (Cloudflare Workers)
 * - Keeps KAKAO_REST_API_KEY and SEOUL_API_KEY hidden on the server
 * - Adds CORS headers and short edge caching to save API quota
 *
 * Deploy:
 *   1. npx wrangler secret put KAKAO_REST_API_KEY
 *   2. npx wrangler secret put SEOUL_API_KEY
 *   3. npx wrangler deploy proxy/cloudflare-worker.js --name subway-quick-exit-proxy
 */

const ALLOWED_KAKAO_PATHS = new Set([
  '/v2/local/search/keyword.json',
  '/v2/local/search/category.json',
])

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    if (request.method !== 'GET') {
      return jsonError('Method not allowed', 405)
    }

    const url = new URL(request.url)

    // 1. Kakao Local API proxy: /kakao/v2/local/search/...
    if (url.pathname.startsWith('/kakao/')) {
      const kakaoPath = url.pathname.slice('/kakao'.length)
      if (!ALLOWED_KAKAO_PATHS.has(kakaoPath)) {
        return jsonError('Disallowed Kakao endpoint', 403)
      }
      if (!env.KAKAO_REST_API_KEY) {
        return jsonError('KAKAO_REST_API_KEY not configured', 500)
      }

      const target = `https://dapi.kakao.com${kakaoPath}${url.search}`
      const res = await fetch(target, {
        headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
        cf: { cacheEverything: true, cacheTtl: 300 },
      })
      const body = await res.text()
      return new Response(body, {
        status: res.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
        },
      })
    }

    // 2. Seoul Open Data realtime arrival proxy: /seoul/realtimeStationArrival?station=...
    if (url.pathname === '/seoul/realtimeStationArrival') {
      const station = (url.searchParams.get('station') || '').trim()
      if (!station) {
        return jsonError('Missing station query parameter', 400)
      }
      if (!env.SEOUL_API_KEY) {
        return jsonError('SEOUL_API_KEY not configured', 500)
      }

      const target = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(env.SEOUL_API_KEY)}/json/realtimeStationArrival/0/12/${encodeURIComponent(station)}`
      const res = await fetch(target, {
        cf: { cacheEverything: true, cacheTtl: 15 },
      })
      const body = await res.text()
      return new Response(body, {
        status: res.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=15',
        },
      })
    }

    return jsonError('Not found', 404)
  },
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  })
}
