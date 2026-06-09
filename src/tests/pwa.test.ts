import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Read repo files relative to this test (no reliance on process.cwd, which the app tsconfig's
// `types: ['vite/client']` does not surface). These assets live outside the module graph
// (public/) or are the HTML entry, so they are read as text rather than imported.
const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const manifestSource = read('../../public/manifest.webmanifest')
const swSource = read('../../public/sw.js')
const indexHtml = read('../../index.html')
const mainSource = read('../main.tsx')

describe('web manifest', () => {
  it('is valid JSON carrying the install-critical fields', () => {
    const m = JSON.parse(manifestSource) as Record<string, unknown>
    expect(m.name).toBe("Ted's Africa Brief")
    expect(m.start_url).toBe('/')
    expect(m.scope).toBe('/')
    expect(m.display).toBe('standalone')
    // theme/background match the app background so the splash and chrome are seamless.
    expect(m.theme_color).toBe('#EEF1F5')
    expect(m.background_color).toBe('#EEF1F5')
  })

  it('declares a 512px PNG, an SVG, and a maskable purpose for installability', () => {
    const m = JSON.parse(manifestSource) as {
      icons: { src: string; sizes: string; type: string; purpose?: string }[]
    }
    expect(Array.isArray(m.icons)).toBe(true)
    expect(m.icons.some((i) => i.sizes === '512x512' && i.type === 'image/png')).toBe(true)
    expect(m.icons.some((i) => i.type === 'image/svg+xml')).toBe(true)
    expect(m.icons.some((i) => (i.purpose ?? '').includes('maskable'))).toBe(true)
  })
})

describe('index.html PWA wiring', () => {
  it('links the manifest, a theme-color, and both icon kinds', () => {
    expect(indexHtml).toContain('rel="manifest"')
    expect(indexHtml).toContain('href="/manifest.webmanifest"')
    expect(indexHtml).toContain('name="theme-color"')
    expect(indexHtml).toContain('content="#EEF1F5"')
    expect(indexHtml).toContain('href="/icon.svg"')
    expect(indexHtml).toContain('rel="apple-touch-icon"')
    expect(indexHtml).toContain('href="/apple-touch-icon.png"')
  })
})

describe('service worker registration', () => {
  it('registers /sw.js from the entry, in production only', () => {
    expect(mainSource).toMatch(/navigator\.serviceWorker\.register\(['"]\/sw\.js['"]\)/)
    expect(mainSource).toContain('import.meta.env.PROD')
  })
})

// --- Service-worker behavioral harness -------------------------------------------------------
// The worker is a classic script served from public/, so it is evaluated here inside a minimal
// fake worker scope (a fetch-aware fake CacheStorage + an injected fetch) and driven through
// synthetic install/fetch events. Cache keys are normalized to absolute URLs like a real Cache,
// and match() returns a clone so a stored entry stays re-readable.

const ORIGIN = 'https://brief.test'

type RequestLike = { url: string; method: string; mode?: string }
type FetchInput = string | RequestLike
type FetchImpl = (input: FetchInput, init?: unknown) => Promise<Response>
type Listener = (event: {
  request?: RequestLike
  respondWith(r: Promise<Response>): void
  waitUntil(p: Promise<unknown>): void
}) => void

const urlOf = (input: FetchInput): string => (typeof input === 'string' ? input : input.url)
const cacheKey = (input: FetchInput): string => new URL(urlOf(input), ORIGIN).href

class FakeCache {
  readonly store = new Map<string, Response>()
  readonly fetchImpl: FetchImpl
  constructor(fetchImpl: FetchImpl) {
    this.fetchImpl = fetchImpl
  }
  async match(input: FetchInput): Promise<Response | undefined> {
    const hit = this.store.get(cacheKey(input))
    return hit ? hit.clone() : undefined
  }
  async put(input: FetchInput, res: Response): Promise<void> {
    this.store.set(cacheKey(input), res)
  }
  async addAll(urls: string[]): Promise<void> {
    // Mirror Cache.addAll: fetch each (resolved) URL and store the response, atomically failing
    // if any request is not ok.
    for (const u of urls) {
      const res = await this.fetchImpl(cacheKey(u))
      if (!res.ok) throw new TypeError(`addAll failed: ${u}`)
      this.store.set(cacheKey(u), res)
    }
  }
}

class FakeCaches {
  readonly named = new Map<string, FakeCache>()
  readonly fetchImpl: FetchImpl
  constructor(fetchImpl: FetchImpl) {
    this.fetchImpl = fetchImpl
  }
  async open(name: string): Promise<FakeCache> {
    const existing = this.named.get(name)
    if (existing) return existing
    const created = new FakeCache(this.fetchImpl)
    this.named.set(name, created)
    return created
  }
  async match(input: FetchInput): Promise<Response | undefined> {
    for (const cache of this.named.values()) {
      const hit = await cache.match(input)
      if (hit) return hit
    }
    return undefined
  }
  async keys(): Promise<string[]> {
    return [...this.named.keys()]
  }
  async delete(name: string): Promise<boolean> {
    return this.named.delete(name)
  }
}

interface SwScope {
  location: { origin: string }
  clients: { claim(): Promise<void> }
  skipWaiting(): Promise<void>
  addEventListener(type: string, listener: Listener): void
  handlers: Map<string, Listener>
}

function makeScope(): SwScope {
  const handlers = new Map<string, Listener>()
  return {
    location: { origin: ORIGIN },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (type, listener) => handlers.set(type, listener),
    handlers,
  }
}

function loadWorker(scope: SwScope, cacheStorage: FakeCaches, fetchImpl: FetchImpl): void {
  const factory = new Function('self', 'caches', 'fetch', 'URL', swSource)
  factory(scope, cacheStorage, fetchImpl, URL)
}

async function dispatchFetch(scope: SwScope, request: RequestLike): Promise<Response | undefined> {
  const handler = scope.handlers.get('fetch')
  if (!handler) throw new Error('no fetch handler registered')
  let captured: Promise<Response> | undefined
  handler({
    request,
    respondWith: (r) => {
      captured = r
    },
    waitUntil: () => {},
  })
  return captured
}

async function runLifecycle(scope: SwScope, type: 'install' | 'activate'): Promise<void> {
  const handler = scope.handlers.get(type)
  if (!handler) throw new Error(`no ${type} handler registered`)
  const tasks: Promise<unknown>[] = []
  handler({ respondWith: () => {}, waitUntil: (p) => tasks.push(p) })
  await Promise.all(tasks)
}

const online: FetchImpl = async (input) => new Response(`NETWORK:${urlOf(input)}`, { status: 200 })
const offline: FetchImpl = async () => {
  throw new Error('offline')
}

// A synthetic built document referencing a hashed Vite asset (as `vite build` emits), and a fetch
// that serves it for index.html and a tagged body for every other shell URL.
const BUILT_INDEX =
  '<!doctype html><html><head>' +
  '<link rel="manifest" href="/manifest.webmanifest" />' +
  '<script type="module" crossorigin src="/assets/index-test.js"></script>' +
  '</head><body></body></html>'

const builtFetch: FetchImpl = async (input) => {
  const url = urlOf(input)
  if (url.endsWith('/index.html')) return new Response(BUILT_INDEX, { status: 200 })
  return new Response(`ASSET:${url}`, { status: 200 })
}

describe('service worker: install precaches the built shell', () => {
  it('caches the hashed build asset that index.html references', async () => {
    const cacheStorage = new FakeCaches(builtFetch)
    const scope = makeScope()
    loadWorker(scope, cacheStorage, builtFetch)
    await runLifecycle(scope, 'install')

    const shell = await cacheStorage.open('tab-shell-v1-shell')
    // the discovered hashed bundle...
    expect(await shell.match(`${ORIGIN}/assets/index-test.js`)).toBeDefined()
    // ...alongside the entry document and the declared static PWA assets.
    expect(await shell.match(`${ORIGIN}/index.html`)).toBeDefined()
    expect(await shell.match(`${ORIGIN}/manifest.webmanifest`)).toBeDefined()
    expect(await shell.match(`${ORIGIN}/icon-192.png`)).toBeDefined()
  })

  it('serves a precached build asset from cache on an offline request after install', async () => {
    const cacheStorage = new FakeCaches(builtFetch)
    const installScope = makeScope()
    loadWorker(installScope, cacheStorage, builtFetch)
    await runLifecycle(installScope, 'install')

    // Now offline: a worker over the same caches with a failing network must still serve the
    // asset from the shell cache (cacheFirst), proving install precached it (not lazy caching).
    const offlineScope = makeScope()
    loadWorker(offlineScope, cacheStorage, offline)
    const res = await dispatchFetch(offlineScope, {
      url: `${ORIGIN}/assets/index-test.js`,
      method: 'GET',
    })
    expect(res).toBeDefined()
    expect(await res!.text()).toBe(`ASSET:${ORIGIN}/assets/index-test.js`)
  })
})

describe('service worker: the brief artifact is network-first', () => {
  it('serves the live artifact and refreshes the cache when online', async () => {
    const cacheStorage = new FakeCaches(online)
    const runtime = await cacheStorage.open('tab-shell-v1-runtime')
    await runtime.put(`${ORIGIN}/brief.json`, new Response('CACHED'))
    const scope = makeScope()
    loadWorker(scope, cacheStorage, online)

    const res = await dispatchFetch(scope, { url: `${ORIGIN}/brief.json`, method: 'GET' })
    expect(res).toBeDefined()
    expect(await res!.text()).toBe(`NETWORK:${ORIGIN}/brief.json`)
    const refreshed = await runtime.match(`${ORIGIN}/brief.json`)
    expect(await refreshed!.text()).toBe(`NETWORK:${ORIGIN}/brief.json`)
  })

  it('falls back to the cached artifact only when the network is down', async () => {
    const cacheStorage = new FakeCaches(offline)
    const runtime = await cacheStorage.open('tab-shell-v1-runtime')
    await runtime.put(`${ORIGIN}/brief.json`, new Response('CACHED'))
    const scope = makeScope()
    loadWorker(scope, cacheStorage, offline)

    const res = await dispatchFetch(scope, { url: `${ORIGIN}/brief.json`, method: 'GET' })
    expect(await res!.text()).toBe('CACHED')
  })

  it('fails closed (no synthetic success) when offline with no cached artifact', async () => {
    const cacheStorage = new FakeCaches(offline)
    const scope = makeScope()
    loadWorker(scope, cacheStorage, offline)

    await expect(
      dispatchFetch(scope, { url: `${ORIGIN}/brief.json`, method: 'GET' }),
    ).rejects.toThrow('offline')
  })
})

describe('service worker: shell, scope, and lifecycle', () => {
  it('serves the cached app shell for navigations when offline', async () => {
    const cacheStorage = new FakeCaches(offline)
    const shell = await cacheStorage.open('tab-shell-v1-shell')
    await shell.put('/index.html', new Response('<!doctype html>SHELL'))
    const scope = makeScope()
    loadWorker(scope, cacheStorage, offline)

    const res = await dispatchFetch(scope, {
      url: `${ORIGIN}/`,
      method: 'GET',
      mode: 'navigate',
    })
    expect(await res!.text()).toContain('SHELL')
  })

  it('does not intercept non-GET or cross-origin requests', async () => {
    const cacheStorage = new FakeCaches(online)
    const scope = makeScope()
    loadWorker(scope, cacheStorage, online)

    const post = await dispatchFetch(scope, { url: `${ORIGIN}/brief.json`, method: 'POST' })
    expect(post).toBeUndefined()
    const crossOrigin = await dispatchFetch(scope, {
      url: 'https://other.example/x.js',
      method: 'GET',
    })
    expect(crossOrigin).toBeUndefined()
  })

  it('purges caches from older versions on activate', async () => {
    const cacheStorage = new FakeCaches(online)
    await cacheStorage.open('tab-shell-v0-shell') // a previous version
    await cacheStorage.open('tab-shell-v1-shell')
    await cacheStorage.open('tab-shell-v1-runtime')
    const scope = makeScope()
    loadWorker(scope, cacheStorage, online)

    await runLifecycle(scope, 'activate')

    const remaining = await cacheStorage.keys()
    expect(remaining).not.toContain('tab-shell-v0-shell')
    expect(remaining).toContain('tab-shell-v1-shell')
    expect(remaining).toContain('tab-shell-v1-runtime')
  })
})
