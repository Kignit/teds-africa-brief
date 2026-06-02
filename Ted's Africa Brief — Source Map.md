# Ted's Africa Brief — Source Map & Connection Plan

*Verified live, June 2026. Coverage: Ethiopia, Kenya, Nigeria, Ghana, South Africa, plus continental and global context. All sources below are **free** unless explicitly marked otherwise.*

---

## 1. The five ways a source connects

Every source plugs into the **Collect** stage in one of five ways. This matters because most of our work is building a *small set of reusable connectors*, not a separate scraper per source.

| Connection type | What it means | Effort |
|---|---|---|
| **Open API (no key)** | A web address that returns clean data instantly | Easiest |
| **API with a free key** | Same, but you register once for a free key | Easy |
| **RSS feed** | A standard news feed any reader can pull | Easy |
| **Scheduled file grab** | Download a CSV/Excel on a timer | Medium |
| **Platform portal** | One connector unlocks *many* national datasets | Medium (high payoff) |
| **Scrape (HTML/PDF)** | No feed exists; read the page carefully | Hard — use sparingly, respect terms |

**The big simplification:** four "platform portals" (Open Data for Africa / Knoema, PxWeb, CKAN, and the IMF/World Bank APIs) plus a generic RSS reader, a generic file-downloader, and GDELT cover the overwhelming majority of what we need. That's roughly **seven reusable connectors**, not fifty scrapers.

---

## 2. The numbers (market & macro data)

These feed the FX strip, the markets dashboard, and — critically — the *verified figures injected into the AI* so it never invents a number.

| Need | Source | Connect via | Notes |
|---|---|---|---|
| **FX rates** (NGN, KES, ETB, GHS, ZAR) | open.er-api.com | Open API (no key) | All five currencies, daily, no key. Blended midpoint. |
| FX — official/parallel context | CBN, SARB, CBK, BoG, NBE | SARB = API; others = file/scrape | Use for authoritative + parallel-rate accuracy. |
| **Brent crude oil** | US EIA Open Data | API (free key) | Daily Brent + WTI, long history. |
| **Oil basket** | OPEC | Scrape + monthly PDF | Daily basket price + Monthly Oil Market Report. |
| **Gold, cocoa, oil (one series)** | World Bank "Pink Sheet" | Scheduled file grab (Excel) | Monthly. Best single free source for cocoa + gold. |
| Gold (benchmark) | LBMA | Free (delayed) download | Real-time/commercial use is licensed (paid). |
| **US rates, Treasuries, CPI** | FRED (St. Louis Fed) | API (free key) | 800k+ series; also has SA 10y yield. |
| **ECB rates, euro FX** | ECB Data Portal | Open API (SDMX, no key) | Free, attribution requested. |

### ⚠️ The one real gap: African Eurobond yields & spreads
Live secondary-market **Eurobond spreads** for Kenya, Ghana and Egypt have **no free source** — they sit behind Bloomberg / Refinitiv / JPMorgan EMBI (all paid, expensive). Partial free fills:
- **South Africa** — well covered free (FRED, rbond.co.za API, SARB API).
- **Nigeria** — the **Debt Management Office publishes daily Eurobond closing prices/yields** as a free Excel download.
- **Kenya / Ghana / Egypt** — only **lagged primary-auction yields** from central banks/debt offices (free, but local-currency and delayed).

**Decision needed (ties to your "no mock data" rule):** for the markets "Spreads" view we either (a) budget for a paid feed later, (b) show only the free, real, lagged official yields and label them honestly, or (c) hold the spreads feature until it's affordable. We must not show invented spreads.

---

## 3. Official & primary sources (per country)

The authoritative layer — best for the *numbers* and policy events. "ODfA" = the country's **Open Data for Africa** portal (Knoema-powered: REST API / JSON / SDMX), which is the cleanest programmatic route where the official site has no API.

### Ethiopia
| Source | Provides | Connect via |
|---|---|---|
| National Bank of Ethiopia | FX, policy rate, reserves | Scrape (page + PDFs) — no API |
| Ethiopian Statistics Service | CPI, GDP | Scrape PDFs, **or Ethiopia ODfA mirror (API)** |
| Ministry of Finance (MoFED) | Budget, debt bulletins | Scrape (PDF) |

### Kenya
| Source | Provides | Connect via |
|---|---|---|
| Central Bank of Kenya | FX (daily), policy rate, reserves, weekly bulletin | **CSV download** (no formal API) |
| KNBS (statistics) | CPI, GDP | PDF/Excel + NADA, **or Kenya ODfA (REST API/JSON/SDMX)** |
| National Treasury | Budget, debt, borrowing plan | Scrape (PDF) |

### Nigeria
| Source | Provides | Connect via |
|---|---|---|
| Central Bank of Nigeria | FX, MPR, reserves, money & credit | **Excel export + Statistics DB + RSS news feed** |
| NBS (statistics) | CPI, GDP | eLibrary/NADA, **or Nigeria ODfA (REST API/JSON/SDMX)** |
| Debt Management Office | Public debt, FGN bonds, **daily Eurobond prices/yields** | **Excel/PDF download** |

### Ghana
| Source | Provides | Connect via |
|---|---|---|
| Bank of Ghana | FX (daily), MPR, T-bill rates, reserves | Web/time-series + PDF, **or Ghana ODfA (API)** |
| Ghana Statistical Service | CPI, GDP, MIEG | **StatsBank = PxWeb REST API** (CSV/JSON/Excel) — strongest |
| Ministry of Finance | Budget, quarterly debt bulletin | Scrape (PDF/Excel) |

### South Africa — *best machine-readable set*
| Source | Provides | Connect via |
|---|---|---|
| SA Reserve Bank (SARB) | Policy rate, FX, reserves, full macro series | **REST Web API + Excel/CSV query + RSS** |
| Statistics SA | CPI, PPI, GDP | Excel/ASCII time series + PXWeb |
| National Treasury (Vulekamali) | Budget, spending, debt | **CKAN REST API + CSV** |

### Continental & global (multilaterals)
| Source | Provides | Connect via |
|---|---|---|
| **World Bank Open Data** | GDP, CPI, debt, reserves, FX (all countries) | **REST API v2 — no key, JSON** |
| **IMF Data** | IFS: FX, reserves, rates, BOP, trade | SDMX 2.1/3.0 REST API (bulk needs free login) |
| **AfDB — Africa Information Highway** | Socio-economic database; backbone for the country ODfA mirrors | Knoema REST API / SDMX / JSON |
| Afreximbank Databank | Trade stats, reports | Portal + PDF (no API) |
| AfCFTA — African Trade Observatory | Intra-African trade, tariffs | Dashboard (no public API) |

---

## 4. News sources

### Local business press (per country)
Most run on WordPress and expose a **full-text** feed at `/feed/` — the richest free signal. Custom-CMS outlets give headlines/teasers only and lean paywalled (use as signal + link out).

| Country | Outlet | RSS | Depth |
|---|---|---|---|
| Nigeria | Nairametrics | `nairametrics.com/feed/` | Full text |
| Nigeria | BusinessDay | `businessday.ng/feed/` | Full text |
| Nigeria | Premium Times | `premiumtimesng.com/feed` | Full text |
| Kenya | Business Daily (Nation) | `/service/rss/...` | Headline + teaser (paywalled) |
| Kenya | The Standard | `standardmedia.co.ke/rss/business.php` | Headline + summary |
| Ghana | **B&FT** | `thebftonline.com/feed/` | **Full text** (best Ghana feed) |
| Ghana | Citi Business | `citibusinessnews.com/feed/` | Full text |
| Ghana | Graphic Business | `graphic.com.gh/business.html?type=rss` | Teaser |
| South Africa | Business Day / BusinessLive | Arc feeds by category (economy/markets/companies) | Some/all text (mostly paywalled) |
| South Africa | Moneyweb | `moneyweb.co.za/feed/` | Mixed |
| South Africa | Fin24 | RSS index page | Headline + synopsis |
| Ethiopia | Addis Fortune | `addisfortune.news/feed/` | Full text |
| Ethiopia | The Reporter | `thereporterethiopia.com/feed/` | Full text |
| Ethiopia | Addis Standard | `addisstandard.com/feed/` | Full text |

*No African outlet here offers a developer API — RSS is the integration path.*

### Free global aggregation (for triangulation)
| Service | Connect via | Free tier | Verdict |
|---|---|---|---|
| **GDELT Project** | Open API (no key) | Free, commercial-OK with attribution | **Best backbone** — broad, multilingual, returns links + metadata |
| Google News RSS | Query RSS | Free, no key | Usable but **unofficial/fragile** — keep a fallback |
| NewsData.io | API (free key) | 200 credits/day, **commercial OK** | Only keyed API that allows commercial use free |
| NewsAPI.org / GNews / Mediastack | API (key) | Dev/non-commercial only | **Avoid for production** |
| Bing News API | — | **Retired Aug 2025** | Dead — don't build on it |

### Paywalled global wires
Use for **headline/teaser signals + linking out — never republish full text.**

| Wire | Public access | Use |
|---|---|---|
| Financial Times | Headline/teaser RSS (`ft.com/<section>?format=rss`) | Signal + link out |
| The Economist | Headline/teaser RSS (`/<section>/rss.xml`) | Signal + link out |
| Reuters | No editorial RSS | Pick up via GDELT; link out |
| Bloomberg | Unreliable RSS | Pick up via GDELT; link out |

---

## 5. Legal guardrails (the "no subscriptions" approach, done safely)
- Use **sanctioned access only** — official APIs and RSS feeds, never bypassing paywalls or logins.
- **Headlines + teasers** are signals to triangulate; the brief is **our own original analysis**, with attribution and a link out.
- **Never reproduce** a publisher's article text to readers.
- Respect each site's terms; avoid scraping sites whose terms forbid automated access (e.g., Investing.com, TradingEconomics).
- Get a cheap legal once-over before launch. *(This is general guidance, not legal advice.)*

---

## 6. What to wire first (the connectors that unlock the most)
1. **World Bank API + IMF API** — instant, free, no-key macro for all five countries.
2. **Open Data for Africa / Knoema connector** — one connector unlocks Kenya, Nigeria, Ghana, Ethiopia national stats + AfDB.
3. **Generic RSS reader** — all local press + FT/Economist headlines + CBN/SARB feeds.
4. **GDELT** — global/continental triggers for the Causal Map.
5. **open.er-api.com + EIA + World Bank Pink Sheet** — FX, oil, gold, cocoa.
6. **PxWeb + CKAN connectors** — Ghana StatsBank, Stats SA, SA Vulekamali.
7. **Scheduled file-grabbers** — CBK CSV, CBN Excel, Nigeria DMO Eurobond Excel.

Scrape-only sources (Ethiopia central bank/stats/finance, several finance ministries, OPEC basket, Afreximbank, AfCFTA) are lowest priority — add them as needed, carefully.
