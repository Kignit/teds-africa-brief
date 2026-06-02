// ─────────────────────────────────────────────────────────────
// DIRECTION A — "The Ledger"
// Editorial terminal. Warm paper, Newsreader serif heads, IBM Plex
// Mono data, hairline rules. FT/Economist DNA. (light)
// ─────────────────────────────────────────────────────────────
(function () {
  const { useState, useRef, useEffect } = React;
  const D = window.TAB;

  const PAL = {
    pos: "#1E7A4E", neg: "#B23B2E", neutral: "#5C6670",
    posBg: "rgba(30,122,78,.09)", negBg: "rgba(178,59,46,.09)", neuBg: "rgba(92,102,112,.08)",
    posBd: "rgba(30,122,78,.24)", negBd: "rgba(178,59,46,.24)", neuBd: "rgba(92,102,112,.18)",
  };
  const c = (t, k) =>
    k === "bg" ? (t === "pos" ? PAL.posBg : t === "neg" ? PAL.negBg : PAL.neuBg)
    : k === "bd" ? (t === "pos" ? PAL.posBd : t === "neg" ? PAL.negBd : PAL.neuBd)
    : (t === "pos" ? PAL.pos : t === "neg" ? PAL.neg : PAL.neutral);

  const VARS = {
    "--bg": "#F6F1E6", "--ink": "#221F19", "--muted": "#6E675A",
    "--hair": "rgba(34,31,25,.13)", "--chipBg": "rgba(34,31,25,.045)",
    "--accent": "#9E2B25", "--card": "#FBF8F1",
    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
  };
  const serif = "'Newsreader', Georgia, serif";
  const mono = "'IBM Plex Mono', ui-monospace, monospace";

  function Kicker({ children }) {
    return <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", fontWeight: 600 }}>{children}</div>;
  }

  function Section({ kicker, title, children, defaultOpen = true, collapsible = true }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <section style={{ padding: "20px 20px 22px", borderTop: "1px solid var(--hair)" }}>
        <header onClick={() => collapsible && setOpen(!open)} style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", cursor: collapsible ? "pointer" : "default", marginBottom: open ? 14 : 0 }}>
          <div>
            {kicker && <Kicker>{kicker}</Kicker>}
            <h2 style={{ fontFamily: serif, fontSize: 21, fontWeight: 600, lineHeight: 1.12, margin: "5px 0 0", color: "var(--ink)", letterSpacing: -0.2 }}>{title}</h2>
          </div>
          {collapsible && (
            <svg width="13" height="13" viewBox="0 0 13 13" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .25s", flexShrink: 0, marginBottom: 4 }}>
              <path d="M2 4l4.5 4.5L11 4" stroke="var(--muted)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </header>
        <div style={{ display: open ? "block" : "none" }}>{children}</div>
      </section>
    );
  }

  function Masthead() {
    return (
      <div style={{ padding: "58px 20px 16px", background: "var(--bg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: mono, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--muted)", paddingBottom: 10, borderBottom: "2px solid var(--ink)" }}>
          <span>{D.meta.issue}</span>
          <span>{D.meta.dateShort} · 2026</span>
        </div>
        <h1 style={{ fontFamily: serif, fontSize: 33, fontWeight: 600, lineHeight: 0.96, letterSpacing: -0.6, margin: "13px 0 8px", color: "var(--ink)" }}>
          Ted's Africa<br />Brief
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: mono, fontSize: 9.5, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--muted)", borderTop: "1px solid var(--hair)", paddingTop: 9 }}>
          <span style={{ color: "var(--accent)", fontWeight: 600 }}>● {D.meta.edition}</span>
          <span style={{ opacity: 0.5 }}>/</span>
          <span>{D.meta.dateLong}</span>
          <span style={{ marginLeft: "auto" }}>{D.meta.readTime}</span>
        </div>
        <p style={{ fontFamily: serif, fontStyle: "italic", fontSize: 12.5, color: "var(--muted)", margin: "10px 0 0", lineHeight: 1.4 }}>{D.brandTop}</p>
      </div>
    );
  }

  function ExecSummary() {
    return (
      <Section kicker="Executive Summary" title="Five things that moved Africa" collapsible={false}>
        <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {D.summary.map((s, i) => (
            <li key={i} style={{ display: "flex", gap: 12, padding: "11px 0", borderBottom: i < D.summary.length - 1 ? "1px solid var(--hair)" : "none" }}>
              <span style={{ fontFamily: mono, fontSize: 12, color: "var(--accent)", fontWeight: 600, paddingTop: 3 }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ width: 7, height: 7, borderRadius: 7, background: c(s.tone), flexShrink: 0, marginTop: 6 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: serif, fontSize: 15.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }}>{s.t}</div>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.42 }}>{s.s}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    );
  }

  function ChainBox({ chain }) {
    return (
      <div style={{ background: "var(--card)", border: "1px solid var(--hair)", borderLeft: "3px solid var(--accent)", borderRadius: "0 8px 8px 0", padding: "12px 13px", marginTop: 12 }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--muted)", marginBottom: 9, display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 13 13"><path d="M2 6.5h7M7 3l3.5 3.5L7 10" stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Causal chain · {chain.title}
        </div>
        <CausalChain chain={chain} c={c} />
      </div>
    );
  }

  function GlobalUpdate() {
    return (
      <Section kicker="Global Update" title={D.global.headline}>
        <p style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.5, color: "var(--ink)", margin: "0 0 11px", fontWeight: 500 }}>{D.global.standfirst}</p>
        {D.global.body.map((p, i) => (
          <p key={i} style={{ fontSize: 13.5, lineHeight: 1.56, color: "var(--ink)", margin: "0 0 10px", opacity: 0.86 }}>{p}</p>
        ))}
        {D.chains.map((ch, i) => <ChainBox key={i} chain={ch} />)}
      </Section>
    );
  }

  function Top5Card({ item }) {
    const [showImpact, setShowImpact] = useState(false);
    return (
      <article style={{ minWidth: "calc(100% - 40px)", scrollSnapAlign: "center", background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12, padding: "15px 15px 14px", marginRight: 12, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
          <span style={{ fontFamily: serif, fontSize: 27, fontWeight: 600, color: "var(--accent)", lineHeight: 1 }}>{item.rank}</span>
          <span style={{ fontSize: 20 }}>{item.flag}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: "var(--muted)" }}>{item.country}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: "var(--muted)", letterSpacing: 0.5 }}>{item.stat.label}</div>
            <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{item.stat.value}</div>
            <div style={{ fontFamily: mono, fontSize: 10.5, color: c(item.stat.tone), fontWeight: 600 }}>{item.stat.chg}</div>
          </div>
        </div>
        <h3 style={{ fontFamily: serif, fontSize: 17, fontWeight: 600, lineHeight: 1.18, margin: "0 0 6px", color: "var(--ink)", letterSpacing: -0.2 }}>{item.headline}</h3>
        <p style={{ fontSize: 12.5, lineHeight: 1.46, color: "var(--muted)", margin: "0 0 11px" }}>{item.blurb}</p>
        <div style={{ marginTop: "auto" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 11 }}>
            <Sparkline data={item.stat.spark} color={c(item.stat.tone)} width={210} height={34} strokeWidth={1.8} fill={c(item.stat.tone, "bg")} dot />
          </div>
          <button onClick={() => setShowImpact(!showImpact)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "var(--accent)", fontWeight: 600, marginBottom: showImpact ? 10 : 0 }}>
            <svg width="11" height="11" viewBox="0 0 13 13" style={{ transform: showImpact ? "rotate(180deg)" : "none", transition: "transform .25s" }}><path d="M2 4l4.5 4.5L11 4" stroke="var(--accent)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Impact map
          </button>
          <div style={{ maxHeight: showImpact ? 160 : 0, overflow: "hidden", transition: "max-height .3s ease" }}>
            <ImpactPills impact={item.impact} dimOrder={D.dimOrder} c={c} variant="bar" />
            <div style={{ fontFamily: mono, fontSize: 9.5, color: "var(--muted)", marginTop: 9, letterSpacing: 0.3 }}>Source · {item.source}</div>
          </div>
        </div>
      </article>
    );
  }

  function Top5() {
    const [idx, setIdx] = useState(0);
    const ref = useRef(null);
    const onScroll = () => {
      const el = ref.current; if (!el) return;
      const w = el.scrollWidth / D.top5.length;
      setIdx(Math.round(el.scrollLeft / w));
    };
    return (
      <Section kicker="Africa Top 5" title="The continent's biggest moves" collapsible={false}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <span style={{ fontFamily: mono, fontSize: 10, color: "var(--muted)", letterSpacing: 0.5 }}>SWIPE →</span>
          <div style={{ flex: 1, height: 1, background: "var(--hair)" }} />
          <span style={{ fontFamily: mono, fontSize: 10, color: "var(--ink)", fontWeight: 600 }}>{String(idx + 1).padStart(2, "0")} / 05</span>
        </div>
        <div ref={ref} onScroll={onScroll} style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -20px", padding: "0 20px", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {D.top5.map((it) => <Top5Card key={it.rank} item={it} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 13 }}>
          {D.top5.map((_, i) => (
            <span key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 6, background: i === idx ? "var(--accent)" : "var(--hair)", transition: "all .25s" }} />
          ))}
        </div>
      </Section>
    );
  }

  function MarketRow({ label, value, chg, tone, spark }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--hair)" }}>
        <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 600, color: "var(--ink)", width: 48 }}>{label}</span>
        {spark && <Sparkline data={spark} color={c(tone)} width={54} height={18} />}
        <span style={{ fontFamily: mono, fontSize: 12.5, color: "var(--ink)", marginLeft: "auto" }}>{value}</span>
        <span style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 600, color: c(tone), width: 56, textAlign: "right" }}>{chg}</span>
      </div>
    );
  }

  function Markets() {
    const [tab, setTab] = useState("fx");
    const tabs = [["fx", "FX"], ["commods", "Commodities"], ["spreads", "Spreads"]];
    return (
      <Section kicker="Market Watch" title="Dashboard">
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ all: "unset", cursor: "pointer", fontFamily: mono, fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", padding: "5px 11px", borderRadius: 6, color: tab === k ? "var(--bg)" : "var(--muted)", background: tab === k ? "var(--ink)" : "transparent", border: "1px solid " + (tab === k ? "var(--ink)" : "var(--hair)") }}>{l}</button>
          ))}
        </div>
        {tab === "fx" && D.fx.map((r) => <MarketRow key={r.code} label={r.code} value={r.value} chg={r.chg} tone={r.tone} spark={r.spark} />)}
        {tab === "commods" && D.commods.map((r) => <MarketRow key={r.name} label={r.name} value={r.value} chg={r.chg} tone={r.tone} spark={r.spark} />)}
        {tab === "spreads" && D.spreads.map((r) => <MarketRow key={r.name} label={r.name} value={r.value + "bp"} chg={r.chg} tone={r.tone} />)}
      </Section>
    );
  }

  function WhyWatch() {
    return (
      <>
        <Section kicker="Why it matters" title="The dollar is the whole story">
          <p style={{ fontFamily: serif, fontSize: 16.5, fontStyle: "italic", lineHeight: 1.46, color: "var(--ink)", margin: 0, borderLeft: "3px solid var(--accent)", paddingLeft: 14 }}>{D.why}</p>
        </Section>
        <Section kicker="What to watch next" title="The week ahead">
          {D.watch.map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < D.watch.length - 1 ? "1px solid var(--hair)" : "none" }}>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 600, color: "var(--bg)", background: "var(--accent)", padding: "4px 7px", borderRadius: 5, letterSpacing: 0.5, minWidth: 30, textAlign: "center" }}>{w.d}</span>
              <span style={{ fontFamily: serif, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{w.t}</span>
              <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)", textAlign: "right" }}>{w.note}</span>
            </div>
          ))}
        </Section>
        <Section kicker="Outlook" title="Our 48-hour read">
          <p style={{ fontSize: 13.5, lineHeight: 1.56, color: "var(--ink)", margin: 0, opacity: 0.9 }}>{D.outlook}</p>
        </Section>
      </>
    );
  }

  function Footer() {
    return (
      <div style={{ padding: "22px 20px 28px", borderTop: "2px solid var(--ink)", background: "var(--bg)" }}>
        <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 0.8, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>
          SOURCES · Reuters · Bloomberg · Financial Times · The Economist · BusinessDay (Lagos) · Daily Nation (Nairobi) · Ahram Online (Cairo)
        </div>
        <div style={{ fontFamily: serif, fontStyle: "italic", fontSize: 14, color: "var(--ink)", textAlign: "center" }}>{D.brandEnd}</div>
      </div>
    );
  }

  function TabBar() {
    return (
      <nav style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "10px 8px 24px", borderTop: "1px solid var(--hair)", background: "var(--card)", flexShrink: 0 }}>
        {D.nav.map((n, i) => (
          <div key={n.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: i === 0 ? "var(--accent)" : "var(--muted)" }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, border: "1.6px solid currentColor", opacity: i === 0 ? 1 : 0.55 }} />
            <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: i === 0 ? 600 : 400 }}>{n.label}</span>
          </div>
        ))}
      </nav>
    );
  }

  function LedgerBrief() {
    return (
      <div style={{ ...VARS, height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--ink)" }}>
        <div className="ab-scroll" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <Masthead />
          <ExecSummary />
          <GlobalUpdate />
          <Top5 />
          <Markets />
          <WhyWatch />
          <Footer />
        </div>
        <TabBar />
      </div>
    );
  }

  window.LedgerBrief = LedgerBrief;
})();
