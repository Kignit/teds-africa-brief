// ─────────────────────────────────────────────────────────────
// DIRECTION C — "Signal"
// Premium dark intel terminal. Near-black panels, Space Grotesk +
// JetBrains Mono, glowing sparklines, gold + cyan. Bloomberg DNA. (dark)
// ─────────────────────────────────────────────────────────────
(function () {
  const { useState, useRef } = React;
  const D = window.TAB;

  const PAL = {
    pos: "#35C68A", neg: "#F0584E", neutral: "#8593A6",
    posBg: "rgba(53,198,138,.12)", negBg: "rgba(240,88,78,.12)", neuBg: "rgba(133,147,166,.12)",
    posBd: "rgba(53,198,138,.32)", negBd: "rgba(240,88,78,.32)", neuBd: "rgba(133,147,166,.22)",
  };
  const c = (t, k) =>
    k === "bg" ? (t === "pos" ? PAL.posBg : t === "neg" ? PAL.negBg : PAL.neuBg)
    : k === "bd" ? (t === "pos" ? PAL.posBd : t === "neg" ? PAL.negBd : PAL.neuBd)
    : (t === "pos" ? PAL.pos : t === "neg" ? PAL.neg : PAL.neutral);

  const VARS = {
    "--bg": "#080B10", "--ink": "#E8EDF4", "--muted": "#8493A6",
    "--hair": "rgba(255,255,255,.08)", "--chipBg": "rgba(255,255,255,.045)",
    "--accent": "#EBB949", "--cyan": "#37D7C4", "--card": "#10161F",
    fontFamily: "'Space Grotesk', system-ui, sans-serif",
  };
  const mono = "'JetBrains Mono', ui-monospace, monospace";
  const glow = (col) => `drop-shadow(0 0 4px ${col})`;

  function TickerTape() {
    const items = [...D.fx, ...D.fx];
    return (
      <div style={{ overflow: "hidden", borderBottom: "1px solid var(--hair)", background: "rgba(0,0,0,.3)", padding: "7px 0", position: "relative" }}>
        <div style={{ display: "flex", gap: 26, whiteSpace: "nowrap", animation: "ab-marquee 26s linear infinite", width: "max-content" }}>
          {items.map((r, i) => (
            <span key={i} style={{ fontFamily: mono, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--muted)" }}>{r.code}</span>
              <span style={{ color: "var(--ink)" }}>{r.value}</span>
              <span style={{ color: c(r.tone) }}>{r.chg}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  function Header() {
    return (
      <div style={{ padding: "54px 18px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: mono, fontSize: 10, letterSpacing: 1, color: c("pos"), border: "1px solid " + PAL.posBd, padding: "3px 8px", borderRadius: 5 }}>
            <span className="ab-pulse" style={{ width: 6, height: 6, borderRadius: 6, background: c("pos") }} />LIVE
          </span>
          <span style={{ fontFamily: mono, fontSize: 10, color: "var(--muted)", letterSpacing: 1 }}>{D.meta.issue} · {D.meta.dateShort}</span>
          <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10, color: "var(--accent)", letterSpacing: 1 }}>{D.meta.readTime.toUpperCase()}</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ width: 4, alignSelf: "stretch", background: "linear-gradient(var(--accent), var(--cyan))", borderRadius: 3, minHeight: 52 }} />
          <div>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>Ted's Africa Brief</div>
            <h1 style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.08, letterSpacing: -0.6, margin: 0, color: "var(--ink)" }}>{D.global.headline}</h1>
            <p style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--muted)", margin: "9px 0 0" }}>{D.global.standfirst}</p>
          </div>
        </div>
      </div>
    );
  }

  function Panel({ tag, title, children, action }) {
    return (
      <section style={{ margin: "0 14px 12px", background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12, overflow: "hidden" }}>
        <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: "1px solid var(--hair)" }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 1.5, color: "var(--accent)" }}>{tag}</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: -0.2 }}>{title}</span>
          {action && <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10, color: "var(--cyan)" }}>{action}</span>}
        </header>
        <div style={{ padding: 14 }}>{children}</div>
      </section>
    );
  }

  function Metrics() {
    const tiles = [D.fx[0], D.commods[0], D.fx[5], D.spreads[1]];
    const labels = ["NGN/USD", "BRENT", "EGP/USD", "KE 2031"];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 14px 12px" }}>
        {tiles.map((r, i) => (
          <div key={i} style={{ background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12, padding: "12px 13px" }}>
            <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 1, color: "var(--muted)" }}>{labels[i]}</div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6 }}>
              <span style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{r.value}</span>
              {r.spark && <div style={{ filter: glow(c(r.tone)) }}><Sparkline data={r.spark} color={c(r.tone)} width={48} height={20} strokeWidth={1.8} dot /></div>}
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: c(r.tone), marginTop: 3 }}>{r.chg}</div>
          </div>
        ))}
      </div>
    );
  }

  function ExecSummary() {
    return (
      <Panel tag="SUM" title="Executive summary" action={`${D.summary.length} SIGNALS`}>
        {D.summary.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 11, padding: "9px 0", borderBottom: i < D.summary.length - 1 ? "1px solid var(--hair)" : "none" }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: c(s.tone), paddingTop: 1, filter: glow(c(s.tone)) }}>{s.tone === "pos" ? "▲" : s.tone === "neg" ? "▼" : "■"}</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.25 }}>{s.t}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4, marginTop: 2 }}>{s.s}</div>
            </div>
          </div>
        ))}
      </Panel>
    );
  }

  function ChainGraph({ chain }) {
    return (
      <div style={{ marginBottom: 13 }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1, color: "var(--cyan)", marginBottom: 9 }}>↳ {chain.title}</div>
        <CausalChain chain={chain} c={c} />
      </div>
    );
  }

  function Chains() {
    return (
      <Panel tag="CHN" title="Causal chains" action="TRACE">
        {D.chains.map((ch, i) => <ChainGraph key={i} chain={ch} />)}
      </Panel>
    );
  }

  function Top5Card({ item }) {
    const [open, setOpen] = useState(false);
    return (
      <article style={{ minWidth: "calc(100% - 28px)", scrollSnapAlign: "center", background: "var(--card)", border: "1px solid var(--hair)", borderRadius: 12, padding: 15, marginRight: 10, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: "var(--bg)", background: "var(--accent)", width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.rank}</span>
          <span style={{ fontSize: 18 }}>{item.flag}</span>
          <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: 1, color: "var(--muted)", textTransform: "uppercase" }}>{item.country}</span>
          <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: c(item.stat.tone), filter: glow(c(item.stat.tone)) }}>{item.stat.chg}</span>
        </div>
        <h3 style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.2, color: "var(--ink)", letterSpacing: -0.2, margin: "0 0 6px" }}>{item.headline}</h3>
        <p style={{ fontSize: 12, lineHeight: 1.45, color: "var(--muted)", margin: "0 0 12px" }}>{item.blurb}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 11, background: "rgba(0,0,0,.25)", border: "1px solid var(--hair)", borderRadius: 9, padding: "10px 12px" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 0.8, color: "var(--muted)" }}>{item.stat.label}</div>
            <div style={{ fontFamily: mono, fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{item.stat.value}</div>
          </div>
          <div style={{ marginLeft: "auto", filter: glow(c(item.stat.tone)) }}><Sparkline data={item.stat.spark} color={c(item.stat.tone)} width={94} height={30} strokeWidth={2} dot /></div>
        </div>
        <button onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", boxSizing: "border-box", alignItems: "center", justifyContent: "space-between", marginTop: 12, fontFamily: mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: "var(--cyan)" }}>
          Impact map
          <svg width="12" height="12" viewBox="0 0 13 13" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .25s" }}><path d="M2 4l4.5 4.5L11 4" stroke="var(--cyan)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ maxHeight: open ? 200 : 0, overflow: "hidden", transition: "max-height .3s ease" }}>
          <div style={{ paddingTop: 12 }}><ImpactPills impact={item.impact} dimOrder={D.dimOrder} c={c} variant="pill" /></div>
          <div style={{ fontFamily: mono, fontSize: 9.5, color: "var(--muted)", marginTop: 11, letterSpacing: 0.5 }}>SRC · {item.source}</div>
        </div>
      </article>
    );
  }

  function Top5() {
    const [idx, setIdx] = useState(0);
    const ref = useRef(null);
    const onScroll = () => { const el = ref.current; if (!el) return; setIdx(Math.round(el.scrollLeft / (el.scrollWidth / D.top5.length))); };
    return (
      <section style={{ margin: "0 14px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 11px" }}>
          <span style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: 1.5, color: "var(--accent)" }}>TOP5</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>Africa's biggest moves</span>
          <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: "var(--cyan)" }}>{String(idx + 1).padStart(2, "0")}/05</span>
        </div>
        <div ref={ref} onScroll={onScroll} style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", margin: "0 -14px", padding: "0 14px", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {D.top5.map((it) => <Top5Card key={it.rank} item={it} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 12 }}>
          {D.top5.map((_, i) => <span key={i} style={{ width: i === idx ? 16 : 5, height: 5, borderRadius: 5, background: i === idx ? "var(--accent)" : "var(--hair)", transition: "all .25s" }} />)}
        </div>
      </section>
    );
  }

  function MarketRow({ label, value, chg, tone, spark }) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--hair)" }}>
        <span style={{ fontFamily: mono, fontSize: 11.5, color: "var(--ink)", width: 50 }}>{label}</span>
        {spark ? <div style={{ filter: glow(c(tone)) }}><Sparkline data={spark} color={c(tone)} width={50} height={16} /></div> : <span style={{ width: 50 }} />}
        <span style={{ fontFamily: mono, fontSize: 12, color: "var(--ink)", marginLeft: "auto" }}>{value}</span>
        <span style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: c(tone), width: 54, textAlign: "right" }}>{chg}</span>
      </div>
    );
  }

  function Markets() {
    const [tab, setTab] = useState("fx");
    const tabs = [["fx", "FX"], ["commods", "CMDTY"], ["spreads", "SPREADS"]];
    return (
      <Panel tag="MKT" title="Dashboard">
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ all: "unset", cursor: "pointer", fontFamily: mono, fontSize: 10, letterSpacing: 0.8, padding: "5px 11px", borderRadius: 6, color: tab === k ? "var(--bg)" : "var(--muted)", background: tab === k ? "var(--accent)" : "transparent", border: "1px solid " + (tab === k ? "var(--accent)" : "var(--hair)") }}>{l}</button>
          ))}
        </div>
        {tab === "fx" && D.fx.map((r) => <MarketRow key={r.code} label={r.code} value={r.value} chg={r.chg} tone={r.tone} spark={r.spark} />)}
        {tab === "commods" && D.commods.map((r) => <MarketRow key={r.name} label={r.name} value={r.value} chg={r.chg} tone={r.tone} spark={r.spark} />)}
        {tab === "spreads" && D.spreads.map((r) => <MarketRow key={r.name} label={r.name} value={r.value + "bp"} chg={r.chg} tone={r.tone} />)}
      </Panel>
    );
  }

  function Closers() {
    return (
      <>
        <Panel tag="WHY" title="Why it matters">
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink)", margin: 0, borderLeft: "2px solid var(--accent)", paddingLeft: 12 }}>{D.why}</p>
        </Panel>
        <Panel tag="NXT" title="What to watch next">
          {D.watch.map((w, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: i < D.watch.length - 1 ? "1px solid var(--hair)" : "none" }}>
              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: "var(--cyan)", border: "1px solid var(--hair)", padding: "3px 7px", borderRadius: 5, minWidth: 30, textAlign: "center" }}>{w.d}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{w.t}</span>
              <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 10.5, color: "var(--muted)" }}>{w.note}</span>
            </div>
          ))}
        </Panel>
        <Panel tag="OTL" title="48-hour outlook">
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--muted)", margin: 0 }}>{D.outlook}</p>
        </Panel>
      </>
    );
  }

  function Footer() {
    return (
      <div style={{ padding: "20px 18px 28px", textAlign: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: 0.6, color: "var(--muted)", lineHeight: 1.7, marginBottom: 12 }}>
          SRC · REUTERS · BLOOMBERG · FT · ECONOMIST · BUSINESSDAY · DAILY NATION · AHRAM
        </div>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1, color: "var(--accent)" }}>— FACTS · CONTEXT · BALANCE —</div>
      </div>
    );
  }

  function TabBar() {
    return (
      <nav style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "10px 8px 24px", background: "rgba(0,0,0,.4)", borderTop: "1px solid var(--hair)", flexShrink: 0 }}>
        {D.nav.map((n, i) => (
          <div key={n.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: i === 0 ? "var(--accent)" : "var(--muted)" }}>
            <div style={{ width: 16, height: 16, border: "1.6px solid currentColor", borderRadius: 3, filter: i === 0 ? glow("var(--accent)") : "none", opacity: i === 0 ? 1 : 0.6 }} />
            <span style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: i === 0 ? 700 : 400 }}>{n.label}</span>
          </div>
        ))}
      </nav>
    );
  }

  function SignalBrief() {
    return (
      <div style={{ ...VARS, height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--ink)" }}>
        <div className="ab-scroll" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <Header />
          <TickerTape />
          <div style={{ height: 12 }} />
          <Metrics />
          <ExecSummary />
          <Chains />
          <Top5 />
          <Markets />
          <Closers />
          <Footer />
        </div>
        <TabBar />
      </div>
    );
  }

  window.SignalBrief = SignalBrief;
})();
