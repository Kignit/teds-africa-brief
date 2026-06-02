import { describe, it, expect } from 'vitest'

// Durable client-boundary guard. Walks the import graph from the client entry
// (src/main.tsx) and every src/app file — reading sources via Vite's raw glob, so the
// test stays in the browser/Vite world (no node builtins) — and fails if any reachable
// runtime module lives under the server's network/key surface. This is what keeps
// connectors, the ingestion pipeline, the brief producer, and key config out of the
// client bundle, enforced under `npm run test` (not a manual grep). The pure publish
// gate (src/server/publishing) is intentionally allowed: the client re-runs it for
// defense-in-depth.

const SOURCES = import.meta.glob(['/src/**/*.{ts,tsx}', '/scripts/**/*.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Matches `from '<spec>'`, `import '<spec>'`, and `import('<spec>')`.
const SPEC_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
function specifiers(source: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = SPEC_RE.exec(source)) !== null) out.push(m[1])
  return out
}

function normalize(path: string): string {
  const out: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}

// Resolve a relative specifier to a key in SOURCES (ignores npm/externals).
function resolveSpec(fromKey: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const dir = fromKey.slice(0, fromKey.lastIndexOf('/'))
  const base = normalize(`${dir}/${spec}`)
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]
  return candidates.find((c) => c in SOURCES) ?? null
}

function isForbidden(key: string): boolean {
  return (
    key.startsWith('/src/server/connectors/') ||
    key.startsWith('/src/server/ingestion/') ||
    key.startsWith('/src/server/runtime/') ||
    key.startsWith('/src/server/config/') ||
    key === '/src/server/config.ts' ||
    key.startsWith('/scripts/')
  )
}

describe('client import boundary', () => {
  it('client code never reaches connectors, ingestion, the producer, or key config', () => {
    expect(Object.keys(SOURCES)).toContain('/src/main.tsx')
    // The generator is in the analyzed graph, so a client import of it would be caught.
    expect(Object.keys(SOURCES)).toContain('/scripts/generateBrief.ts')

    const roots = Object.keys(SOURCES).filter(
      (k) => k === '/src/main.tsx' || k.startsWith('/src/app/'),
    )
    const seen = new Set<string>()
    const queue = [...roots]
    while (queue.length > 0) {
      const key = queue.pop()!
      if (seen.has(key)) continue
      seen.add(key)
      for (const spec of specifiers(SOURCES[key])) {
        const resolved = resolveSpec(key, spec)
        if (resolved && !seen.has(resolved)) queue.push(resolved)
      }
    }

    const reachable = [...seen]
    // Sanity: the traversal works and reaches the pure gate via briefSource — so the
    // forbidden check below is not vacuously passing on an empty graph.
    expect(reachable).toContain('/src/app/briefSource.ts')
    expect(reachable.some((k) => k.startsWith('/src/server/publishing/'))).toBe(true)

    expect(reachable.filter(isForbidden)).toEqual([])
  })
})
