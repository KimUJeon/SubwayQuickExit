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

function getCorsHeaders(request, env) {
  const allowedRaw = (env?.ALLOWED_ORIGINS || '').trim()
  if (!allowedRaw) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  }
  const allowed = new Set(allowedRaw.split(',').map(s => s.trim()).filter(Boolean))
  const origin = request.headers.get('Origin') || ''
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
  if (allowed.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

function isOriginAllowed(request, env) {
  const allowedRaw = (env?.ALLOWED_ORIGINS || '').trim()
  if (!allowedRaw) return true
  const origin = request.headers.get('Origin')
  if (!origin) return true
  const allowed = new Set(allowedRaw.split(',').map(s => s.trim()).filter(Boolean))
  return allowed.has(origin)
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env)
    if (!isOriginAllowed(request, env)) {
      return jsonError('Origin not allowed', 403, corsHeaders)
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (request.method !== 'GET') {
      return jsonError('Method not allowed', 405, corsHeaders)
    }

    const url = new URL(request.url)

    // 1. Kakao Local API proxy: /kakao/v2/local/search/...
    if (url.pathname.startsWith('/kakao/')) {
      const kakaoPath = url.pathname.slice('/kakao'.length)
      if (!ALLOWED_KAKAO_PATHS.has(kakaoPath)) {
        return jsonError('Disallowed Kakao endpoint', 403, corsHeaders)
      }
      if (!env.KAKAO_REST_API_KEY) {
        return jsonError('KAKAO_REST_API_KEY not configured', 500, corsHeaders)
      }

      const target = `https://dapi.kakao.com${kakaoPath}${url.search}`
      const res = await fetch(target, {
        headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
        cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 300, '400-599': 0 } },
      })
      const body = await res.text()
      return new Response(body, {
        status: res.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': res.ok ? 'public, max-age=300' : 'no-store',
        },
      })
    }

    // 2. Seoul Open Data realtime arrival proxy: /seoul/realtimeStationArrival?station=...
    if (url.pathname === '/seoul/realtimeStationArrival') {
      const station = (url.searchParams.get('station') || '').trim()
      if (!station) {
        return jsonError('Missing station query parameter', 400, corsHeaders)
      }
      if (!env.SEOUL_API_KEY) {
        return jsonError('SEOUL_API_KEY not configured', 500, corsHeaders)
      }

      const target = `http://swopenapi.seoul.go.kr/api/subway/${encodeURIComponent(env.SEOUL_API_KEY)}/json/realtimeStationArrival/0/12/${encodeURIComponent(station)}`
      const res = await fetch(target, {
        cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': 15, '400-599': 0 } },
      })
      const body = await res.text()
      return new Response(body, {
        status: res.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': res.ok ? 'public, max-age=15' : 'no-store',
        },
      })
    }

    return jsonError('Not found', 404, corsHeaders)
  },
}

function jsonError(message, status, corsHeaders = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}