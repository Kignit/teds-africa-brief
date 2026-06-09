// Offline app shell for Ted's Africa Brief. Hand-rolled (no Workbox / vite-plugin-pwa) so the
// caching contract stays small and auditable. The trust model is unchanged: this worker only
// stores and replays bytes, it never fabricates an artifact. Freshness is still enforced by the
// app's loadBrief 36h gate on every load, so a cached brief can never be presented as current
// once it is stale. The artifact is fetched network-first, so a fresh brief always wins online.

const VERSION = 'tab-shell-v1'
const SHELL_CACHE = `${VERSION}-shell`
const RUNTIME_CACHE = `${VERSION}-runtime`

// Stable, non-hashed shell URLs: the entry document plus the declared static PWA assets. The
// hashed build assets (Vite emits content-hashed /assets/*) are discovered from index.html at
// install time, since their names change on every build (see precacheBuiltAssets).
const STATIC_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

// The gate-passed artifact. Network-first; the cache is only an offline fallback, and the app
// re-validates generatedAt regardless of where the bytes came from.
const ARTIFACT_PATH = '/brief.json'

self.addEventListener('install', (event) => {
  event.waitUntil(precache())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanup())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  // Only same-origin GETs are cached; everything else (POST, cross-origin) is left untouched so
  // the worker never sits in front of, e.g., a future API call.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname === ARTIFACT_PATH) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigationFirst(request))
    return
  }
  event.respondWith(cacheFirst(request))
})

async function precache() {
  const cache = await caches.open(SHELL_CACHE)
  await cache.addAll(STATIC_SHELL_URLS)
  await precacheBuiltAssets(cache)
  await self.skipWaiting()
}

// Discover the hashed build assets the current index.html references and add them to the shell
// cache, so an offline boot has the JS/CSS it needs, not just the HTML. Best-effort: a fetch
// hiccup must not abort install (cacheFirst still fills any gaps on the first online use).
async function precacheBuiltAssets(cache) {
  let html
  try {
    const response = await fetch('/index.html', { cache: 'no-cache' })
    if (!response || !response.ok) return
    html = await response.text()
  } catch {
    return
  }
  const assetUrls = parseAssetUrls(html)
  if (assetUrls.length === 0) return
  try {
    await cache.addAll(assetUrls)
  } catch {
    // Leave any gap for cacheFirst to fill on demand rather than failing the whole install.
  }
}

// Extract same-origin /assets/... URLs from the src/href attributes of a document. Only
// root-absolute /assets/ paths are kept (the hashed bundles Vite emits); everything else (the
// static shell URLs, cross-origin URLs) is ignored.
function parseAssetUrls(html) {
  const urls = new Set()
  const attrPattern = /(?:src|href)\s*=\s*["']([^"']+)["']/g
  let match
  while ((match = attrPattern.exec(html)) !== null) {
    if (match[1].startsWith('/assets/')) urls.add(match[1])
  }
  return [...urls]
}

async function cleanup() {
  const keys = await caches.keys()
  const stale = keys.filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
  await Promise.all(stale.map((key) => caches.delete(key)))
  await self.clients.claim()
}

// Prefer a live response (refreshing the cache); fall back to the last cached copy only when the
// network is unavailable. Used for the artifact so a fresh brief always wins online, while an
// offline load still has the last-known bytes (which the app then re-gates against its 36h TTL).
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response && response.ok) await cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) return cached
    throw error
  }
}

// Navigations use the same network-first preference, but fall back to the cached app shell so the
// SPA can still boot offline (and then fetch and gate the artifact itself).
async function navigationFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response && response.ok) await cache.put(request, response.clone())
    return response
  } catch (error) {
    const cached = (await cache.match(request)) || (await cache.match('/index.html'))
    if (cached) return cached
    throw error
  }
}

// Hashed, immutable build assets (plus the icons): serve from cache when present, otherwise fetch
// and store. Hashed filenames change on every deploy, so a cached asset can never mask a new build.
async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const cache = await caches.open(RUNTIME_CACHE)
  const response = await fetch(request)
  if (response && response.ok) await cache.put(request, response.clone())
  return response
}
