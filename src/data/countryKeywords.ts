// Deterministic country tagging for news items. Reference data ONLY — country
// identity (names, demonyms, capitals, and unambiguous currencies), never an
// analytical fact. CONSERVATIVE by design: a code is assigned only on an
// unambiguous, word-boundary keyword match; anything uncertain yields no tag
// (empty), never a guess. Tokens shared across countries (e.g. "shilling",
// "rand") are deliberately EXCLUDED so a report is never mis-attributed.
//
// Used to tag NewsItems at ingestion so corroborated, country-specific events can
// be grounded to one of the five launch markets. Matching is case-insensitive.

interface CountryKeywords {
  code: string
  patterns: RegExp[]
}

const KEYWORDS: CountryKeywords[] = [
  {
    code: 'NG',
    patterns: [/\bnigeria\b/i, /\bnigerians?\b/i, /\bnaira\b/i, /\babuja\b/i, /\blagos\b/i],
  },
  {
    code: 'KE',
    // "shilling" alone is ambiguous (KE/UG/TZ/SO) — require the Kenyan qualifier.
    patterns: [/\bkenya\b/i, /\bkenyans?\b/i, /\bnairobi\b/i, /\bkenyan\s+shillings?\b/i],
  },
  {
    code: 'ET',
    patterns: [/\bethiopia\b/i, /\bethiopians?\b/i, /\bbirr\b/i, /\baddis\s+ababa\b/i],
  },
  {
    code: 'GH',
    patterns: [/\bghana\b/i, /\bghanaians?\b/i, /\bcedis?\b/i, /\baccra\b/i],
  },
  {
    code: 'ZA',
    // "rand" alone is too ambiguous (a common word/name) — rely on unambiguous
    // place/identity tokens instead.
    patterns: [
      /\bsouth\s+africa\b/i,
      /\bsouth\s+africans?\b/i,
      /\bjohannesburg\b/i,
      /\bpretoria\b/i,
      /\bcape\s+town\b/i,
    ],
  },
]

// ISO codes of every launch market unambiguously named in the text. Empty when
// none match — the caller treats an untagged item conservatively (it can still
// corroborate a global event, but never ground a country-specific claim).
export function inferCountryCodes(text: string): string[] {
  if (!text) return []
  const codes: string[] = []
  for (const { code, patterns } of KEYWORDS) {
    if (patterns.some((re) => re.test(text))) codes.push(code)
  }
  return codes
}
