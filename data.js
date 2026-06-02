// ─────────────────────────────────────────────────────────────
// Ted's Africa Brief — shared mock content
// Daily Brief for Thursday, May 29 2026. All figures illustrative.
// ─────────────────────────────────────────────────────────────
window.TAB = (function () {
  const brandTop = "By Ted's Africa Brief — Africa-first intelligence Team";
  const brandEnd = "— Ted's Africa Brief | Facts. Context. Balance.";

  const meta = {
    edition: "Daily Brief",
    dateLong: "Thursday, 29 May 2026",
    dateShort: "29 MAY",
    issue: "No. 412",
    readTime: "6 min read",
  };

  // Executive summary — 5 bullets
  const summary = [
    { t: "Fed holds, flags one cut by Q3", s: "Dollar softens; pressure eases on African FX and $-debt service.", tone: "pos" },
    { t: "Naira firms 2.1% w/w", s: "CBN clears FX backlog; reserves hold above $40bn.", tone: "pos" },
    { t: "Brent slips below $71", s: "OPEC+ supply chatter — mixed for Angola/Nigeria, relief for importers.", tone: "neutral" },
    { t: "Kenya prices $900m Eurobond at 9.2%", s: "60bps tighter than 2024 — market access reopening.", tone: "pos" },
    { t: "Intra-African trade up 14% YoY", s: "AfCFTA secretariat reports record corridor volumes.", tone: "pos" },
  ];

  // Global Update — narrative blocks
  const global = {
    headline: "Fed's patience hands African currencies a window",
    standfirst:
      "The FOMC left rates unchanged and nodded to a single cut by Q3. A softer dollar is the cleanest channel into Africa this week — relieving FX and trimming the cost of servicing hard-currency debt.",
    body: [
      "Chair Powell framed the hold as 'insurance against sticky services inflation,' but the dot plot's drift toward easing did the talking. The dollar index fell 0.8% on the session.",
      "For frontier markets, the read-through is mechanical: a weaker greenback lifts local currencies, cools imported inflation, and lowers the local-currency cost of coupon payments on Eurobonds.",
    ],
  };

  // Signature feature — causal-link chains
  const chains = [
    {
      title: "US rates → African FX relief",
      nodes: [
        { label: "Fed signals Q3 cut", kind: "cause" },
        { label: "DXY −0.8%", kind: "delta", tone: "pos" },
        { label: "NGN, ZAR, KES firm", kind: "effect", tone: "pos" },
        { label: "Cheaper $-debt service", kind: "outcome", tone: "pos" },
      ],
    },
    {
      title: "Oil → twin-track impact",
      nodes: [
        { label: "Brent −4% to $70.6", kind: "cause", tone: "neg" },
        { label: "Exporters' revenue dips", kind: "effect", tone: "neg" },
        { label: "Importers' fuel bill eases", kind: "effect", tone: "pos" },
        { label: "Net: inflation relief", kind: "outcome", tone: "pos" },
      ],
    },
  ];

  // Africa Top 5 — each with 6-dimension Impact Map
  // dims order: Growth | Consumers | Inflation | FX | Trade | Debt
  // tone: pos | neg | neutral
  const dimOrder = ["Growth", "Consumers", "Inflation", "FX", "Trade", "Debt"];
  const top5 = [
    {
      rank: 1, country: "Nigeria", code: "NG", flag: "🇳🇬",
      headline: "Naira firms as CBN clears FX backlog",
      blurb: "The central bank settled an estimated $1.8bn of verified obligations, and the naira gained 2.1% against the dollar over the week.",
      source: "BusinessDay (Lagos)",
      impact: { Growth: "pos", Consumers: "pos", Inflation: "pos", FX: "pos", Trade: "neutral", Debt: "pos" },
      stat: { label: "NGN / USD", value: "1,452", chg: "+2.1%", tone: "pos", spark: [1530, 1522, 1510, 1498, 1486, 1470, 1452] },
    },
    {
      rank: 2, country: "South Africa", code: "ZA", flag: "🇿🇦",
      headline: "SARB holds at 7.25%, rand steadies",
      blurb: "The Reserve Bank kept the repo rate unchanged for a third meeting, citing anchored inflation expectations and a calmer rand.",
      source: "Business Day (Johannesburg)",
      impact: { Growth: "neutral", Consumers: "neutral", Inflation: "pos", FX: "pos", Trade: "neutral", Debt: "neutral" },
      stat: { label: "ZAR / USD", value: "18.04", chg: "+0.7%", tone: "pos", spark: [18.4, 18.3, 18.25, 18.2, 18.15, 18.1, 18.04] },
    },
    {
      rank: 3, country: "Kenya", code: "KE", flag: "🇰🇪",
      headline: "$900m Eurobond reopens market access",
      blurb: "Nairobi priced a seven-year note at 9.2%, 60bps inside its 2024 issue — a vote of confidence in the fiscal consolidation path.",
      source: "Daily Nation (Nairobi)",
      impact: { Growth: "pos", Consumers: "neutral", Inflation: "neutral", FX: "pos", Trade: "neutral", Debt: "pos" },
      stat: { label: "10y yield", value: "9.20%", chg: "−60bps", tone: "pos", spark: [9.9, 9.8, 9.7, 9.55, 9.4, 9.3, 9.2] },
    },
    {
      rank: 4, country: "Ghana", code: "GH", flag: "🇬🇭",
      headline: "Inflation eases to 18.2%, cedi stable",
      blurb: "Headline inflation fell for a fifth straight month, giving the Bank of Ghana room to consider easing later in the quarter.",
      source: "Graphic Business (Accra)",
      impact: { Growth: "pos", Consumers: "pos", Inflation: "pos", FX: "neutral", Trade: "neutral", Debt: "neutral" },
      stat: { label: "CPI y/y", value: "18.2%", chg: "−1.1pp", tone: "pos", spark: [23, 22, 21, 20.3, 19.5, 19, 18.2] },
    },
    {
      rank: 5, country: "Egypt", code: "EG", flag: "🇪🇬",
      headline: "IMF disburses $1.2bn; pound under pressure",
      blurb: "The Fund completed its fourth review, but the pound slipped as the market digested a wider managed band.",
      source: "Ahram Online (Cairo)",
      impact: { Growth: "pos", Consumers: "neg", Inflation: "neg", FX: "neg", Trade: "neutral", Debt: "pos" },
      stat: { label: "EGP / USD", value: "49.6", chg: "−1.8%", tone: "neg", spark: [48.2, 48.5, 48.8, 49.0, 49.2, 49.4, 49.6] },
    },
  ];

  // Macro dashboard — FX, commodities, rates, spreads
  const fx = [
    { code: "NGN", value: "1,452", chg: "+2.1%", tone: "pos", spark: [1530, 1510, 1498, 1486, 1470, 1452] },
    { code: "ZAR", value: "18.04", chg: "+0.7%", tone: "pos", spark: [18.4, 18.3, 18.2, 18.15, 18.1, 18.04] },
    { code: "KES", value: "128.9", chg: "+0.3%", tone: "pos", spark: [129.5, 129.3, 129.1, 129.0, 128.95, 128.9] },
    { code: "GHS", value: "13.40", chg: "0.0%", tone: "neutral", spark: [13.4, 13.4, 13.41, 13.4, 13.39, 13.4] },
    { code: "ETB", value: "141.2", chg: "−0.4%", tone: "neg", spark: [140.6, 140.8, 141.0, 141.1, 141.15, 141.2] },
    { code: "EGP", value: "49.6", chg: "−1.8%", tone: "neg", spark: [48.2, 48.6, 49.0, 49.2, 49.4, 49.6] },
  ];
  const commods = [
    { name: "Brent", value: "$70.6", chg: "−4.0%", tone: "neg", spark: [73.5, 73, 72.2, 71.4, 71, 70.6] },
    { name: "Gold", value: "$2,388", chg: "+1.2%", tone: "pos", spark: [2360, 2368, 2372, 2378, 2382, 2388] },
    { name: "Cocoa", value: "$8,910", chg: "+3.4%", tone: "pos", spark: [8600, 8680, 8740, 8800, 8870, 8910] },
  ];
  const spreads = [
    { name: "Nigeria 2032", value: "642", chg: "−18bps", tone: "pos" },
    { name: "Kenya 2031", value: "598", chg: "−42bps", tone: "pos" },
    { name: "Egypt 2033", value: "711", chg: "+24bps", tone: "neg" },
    { name: "Ghana 2030", value: "830", chg: "−9bps", tone: "pos" },
  ];

  const why =
    "A softer dollar is the single most powerful variable for African balance sheets right now. It eases FX defence, cools imported inflation, and shrinks the local-currency cost of Eurobond coupons — buying policymakers room to prioritise growth over currency defence.";

  const watch = [
    { d: "Fri", t: "South Africa Q1 GDP", note: "Consensus +0.4% q/q" },
    { d: "Tue", t: "Kenya CPI (May)", note: "Watch food basket" },
    { d: "Wed", t: "ECB rate decision", note: "Cut priced ~90%" },
    { d: "Thu", t: "Nigeria MPC minutes", note: "Tone on FX reserves" },
  ];

  const outlook =
    "We expect the dollar-relief trade to persist into June, with NGN and KES the cleanest beneficiaries. The key risk is a hawkish ECB surprise that re-firms the dollar's rate differential. Oil's softness is a net positive for the bloc's importers, but Angola and Nigeria's fiscal math tightens if Brent settles below $68. Positioning: constructive on Kenyan and Nigerian local rates; cautious on Egyptian FX.";

  const weekTabs = ["Saturday — Week in Review", "Sunday — Week Ahead"];

  // ── Africa Top 10 (weekly) — top5 plus five more, lighter records
  const top10extra = [
    { rank: 6, country: "Morocco", flag: "🇲🇦", headline: "OCP signs $7bn green-ammonia deal", chg: "+1.4%", tone: "pos" },
    { rank: 7, country: "Côte d'Ivoire", flag: "🇨🇮", headline: "Cocoa premium lifts farmgate price", chg: "+3.4%", tone: "pos" },
    { rank: 8, country: "Angola", flag: "🇦🇴", headline: "Kwanza steadies as diesel subsidy trimmed", chg: "+0.6%", tone: "pos" },
    { rank: 9, country: "Tanzania", flag: "🇹🇿", headline: "LNG talks resume with majors", chg: "0.0%", tone: "neutral" },
    { rank: 10, country: "Senegal", flag: "🇸🇳", headline: "First full-year oil output lifts GDP", chg: "+0.9%", tone: "pos" },
  ];

  // ── Auto-promotion alerts (always elevated by the rules in the brief)
  const alerts = [
    { tag: "FX MOVE", tone: "neg", title: "EGP −5.4% m/m", detail: "Egyptian pound breaches the trigger as the managed band widens.", rule: "FX move > 5% m/m" },
    { tag: "POLICY", tone: "pos", title: "Ghana cuts 200bps", detail: "Bank of Ghana front-loads easing as inflation falls for a fifth month.", rule: "Policy rate ≥ 100bps" },
    { tag: "DEAL", tone: "neutral", title: "OCP green ammonia · $7.0bn", detail: "Morocco anchors the largest African energy-transition deal of 2026.", rule: "Deal ≥ US$100m / ≥1 mtpa" },
    { tag: "COMMODITY", tone: "pos", title: "Cocoa +11% w/w", detail: "Supply fears reignite — a clear tailwind for Ghana and Côte d'Ivoire.", rule: "Commodity shock ±10%" },
  ];

  // ── Dealwire
  const dealwire = [
    { co: "OCP", cc: "MA", title: "Green-ammonia complex", value: "$7.0bn", sector: "Energy" },
    { co: "Dangote", cc: "NG", title: "Refinery output-ramp financing", value: "$1.2bn", sector: "Industrials" },
    { co: "MTN", cc: "ZA", title: "Fibre carve-out stake sale", value: "$0.9bn", sector: "Telecom" },
    { co: "Safaricom", cc: "KE", title: "Ethiopia network expansion", value: "$0.5bn", sector: "Telecom" },
  ];

  // ── Macro & consumer pulse (weekly)
  const pulseStats = [
    { label: "Avg CPI (6)", value: "19.4%", chg: "−0.6pp", tone: "pos" },
    { label: "Avg policy rate", value: "18.1%", chg: "−25bps", tone: "pos" },
    { label: "FX reserves Δ", value: "+$2.1bn", chg: "w/w", tone: "pos" },
    { label: "PMI (avg)", value: "50.7", chg: "+0.9", tone: "pos" },
  ];

  // ── Weekly editions
  const weekly = {
    sat: {
      label: "Week in Review", range: "24–30 May 2026", day: "Saturday",
      blocks: [
        { type: "prose", kicker: "Global Update", title: "A softer dollar set the tone", text: "The week's defining move was the Fed's dovish hold. The dollar index fell 0.8%, lifting frontier currencies and trimming hard-currency debt-service costs across the bloc. Oil's slide to the low-$70s added a second, importer-friendly tailwind." },
        { type: "top10", kicker: "Africa Top 10", title: "The week's biggest moves" },
        { type: "pulse", kicker: "Macro & Consumer Pulse", title: "Inflation cooling, rates following", items: pulseStats },
        { type: "prose", kicker: "Geopolitics & Integration", title: "AfCFTA momentum builds", text: "The AfCFTA secretariat reported intra-African trade up 14% YoY, with the Pan-African Payment and Settlement System now live in 15 markets. ECOWAS reaffirmed its single-currency roadmap; SADC advanced a regional grid-interconnection pact." },
        { type: "dealwire", kicker: "Dealwire", title: "Deals that crossed the wire" },
        { type: "watchlist", kicker: "Market Watchlist", title: "Levels we're tracking" },
      ],
    },
    sun: {
      label: "Week Ahead", range: "31 May–6 Jun 2026", day: "Sunday",
      blocks: [
        { type: "calendar", kicker: "Global & Africa Data", title: "The week's calendar", items: [
          { d: "Mon", t: "Egypt PMI (May)", note: "Watch new orders" },
          { d: "Tue", t: "Kenya CPI (May)", note: "Food basket in focus" },
          { d: "Wed", t: "ECB rate decision", note: "Cut priced ~90%" },
          { d: "Thu", t: "SA Q1 GDP", note: "Consensus +0.4% q/q" },
          { d: "Fri", t: "US payrolls", note: "Dollar-direction setter" },
        ] },
        { type: "prose", kicker: "Policy Watch", title: "Central banks in focus", text: "The ECB headlines a busy calendar; a cut would reinforce the soft-dollar trade that has helped African FX. Locally, the Bank of Ghana's tone after its 200bps cut, and Nigeria's MPC minutes, will shape rate expectations." },
        { type: "deals", kicker: "Deals Outlook", title: "Pipeline to watch" },
        { type: "focal", kicker: "Africa Focal Points", title: "Where attention turns", items: [
          { cc: "NG", t: "Naira durability after the FX-backlog clear-out" },
          { cc: "EG", t: "Pound stability as the IMF band widens" },
          { cc: "KE", t: "Eurobond demand and yield follow-through" },
          { cc: "GH", t: "Pace of easing after the surprise cut" },
        ] },
        { type: "risks", kicker: "Positioning & Risks", title: "How we're leaning", items: [
          { tone: "pos", text: "Constructive on Kenyan and Nigerian local rates as disinflation extends." },
          { tone: "neutral", text: "Neutral oil exporters: importer relief offsets revenue drag near-term." },
          { tone: "neg", text: "Cautious on Egyptian FX until the new band finds a clearing level." },
        ] },
        { type: "watchlist", kicker: "Market Watchlist", title: "Levels we're tracking" },
      ],
    },
  };

  const nav = [
    { id: "daily", label: "Daily" },
    { id: "markets", label: "Markets" },
    { id: "weekly", label: "Weekly" },
    { id: "saved", label: "Saved" },
  ];

  // ── Saveable registry (bookmarks) — id → display record
  const savable = {
    lead: { title: global.headline, meta: "Daily Brief · 29 May", kind: "Daily Brief", tone: "pos" },
  };
  top5.forEach((it) => {
    savable[it.code.toLowerCase()] = { title: it.headline, meta: it.country + " · Africa Top 5", kind: "Top 5", tone: it.stat.tone };
  });
  savable.weekly_sat = { title: "Week in Review — 24–30 May", meta: "Weekly Intelligence", kind: "Weekly", tone: "neutral" };
  const savedSeed = ["lead", "ke"];

  return {
    brandTop, brandEnd, meta, summary, global, chains, dimOrder, top5,
    fx, commods, spreads, why, watch, outlook, weekTabs, nav,
    top10extra, alerts, dealwire, pulseStats, weekly, savable, savedSeed,
  };
})();
