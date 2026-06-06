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
    // ZA needs domestic-identity tokens beyond place names: unlike NG/KE/ET/GH, its currency
    // ("rand") is excluded as ambiguous, and SA outlets rarely write "South Africa" in domestic
    // copy. So we add a few SA-only national institutions / market identities (a state-owned
    // enterprise, the central bank, the energy regulator, the national exchange) as IDENTITY
    // tokens, never analytical facts. Still excluded as ambiguous: "rand" (a common word/name),
    // "SARS" (the disease; note SARB is a different token), and a bare "SA".
    patterns: [
      /\bsouth\s+africa\b/i,
      /\bsouth\s+africans?\b/i, // also matches "South African Reserve Bank", etc.
      /\bjohannesburg\b/i, // also matches "Johannesburg Stock Exchange"
      /\bpretoria\b/i,
      /\bcape\s+town\b/i,
      /\beskom\b/i, // state power utility
      /\btransnet\b/i, // state rail / ports / pipelines SOE
      /\bnersa\b/i, // National Energy Regulator of South Africa
      /\bsarb\b/i, // South African Reserve Bank
      /\bjse\b/i, // Johannesburg Stock Exchange
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
