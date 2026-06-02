// ─────────────────────────────────────────────────────────────
// DIRECTION B — "Pulse"
// Clean fintech. Soft white cards on cool gray, Schibsted Grotesk,
// rounded stat tiles, cobalt accent. Robinhood/Monzo DNA. (light)
// ─────────────────────────────────────────────────────────────
(function () {
  const { useState, useRef } = React;
  const D = window.TAB;

  const PAL = {
    pos: "#08A06A", neg: "#E5484D", neutral: "#75808F",
    posBg: "rgba(8,160,106,.10)", negBg: "rgba(229,72,77,.10)", neuBg: "rgba(117,128,143,.10)",
    posBd: "rgba(8,160,106,.20)", negBd: "rgba(229,72,77,.20)", neuBd: "rgba(117,128,143,.16)",
  };
  const c = (t, k) =>
    k === "bg" ? (t === "pos" ? PAL.posBg : t === "neg" ? PAL.negBg : PAL.neuBg)
    : k === "bd" ? (t === "pos" ? PAL.posBd : t === "neg" ? PAL.negBd : PAL.neuBd)
    : (t === "pos" ? PAL.pos : t === "neg" ? PAL.neg : PAL.neutral);

  const VARS = {
    "--bg": "#EEF1F5", "--ink": "#101722", "--muted": "#6B7686",
    "--hair": "rgba(16,23,34,.08)", "--chipBg": "#EEF1F5", "--accent": "#3D4EE8",
    "--card": "#FFFFFF",
    fontFamily: "'Schibsted Grotesk', system-ui, sans-serif",
  };
  const mono = "'Spline Sans Mono', ui-monospace, monospace";
  const SHADOW = "0 1px 2px rgba(16,23,34,.04), 0 6px 20px rgba(16,23,34,.05)";

  function Card({ children, style = {} }) {
    return <div style={{ background: "var(--card)", borderRadius: 20, boxShadow: SHADOW, ...style }}>{children}</div>;
  }

  function Header() {
    return (
      <div style={{ padding: "56px 18px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 40, height: 40, borderRadius: 13, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(61,78,232,.35)" }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: -1 }}>tab</span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.3, lineHeight: 1.15, whiteSpace: "nowrap" }}>Ted's Africa Brief</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{D.meta.dateLong}</div>
          </div>
          <div style={{ marginLeft: "auto", width: 38, height: 38, borderRadius: 999, background: "var(--card)", boxShadow: SHADOW, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative" }}>
              <svg width="17" height="18" viewBox="0 0 17 18" fill="none"><path d="M8.5 1.5a5 5 0 00-5 5v3l-1.5 2.5h13L13.5 9.5v-3a5 5 0 00-5-5z" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" /><path d="M6.5 15a2 2 0 004 0" stroke="var(--ink)" strokeWidth="1.5" /></svg>
              <span style={{ position: "absolute", top: -2, right: -1, width: 7, height: 7, borderRadius: 7, background: "var(--accent)", border: "1.5px solid var(--card)" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  function Ticker() {
    return (
      <div style={{ display: "flex", gap: 9, overflowX: "auto", padding: "10px 18px 4px", scrollbarWidth: "none", margin: "0" }}>
        {D.fx.map((r) => (
          <div key={r.code} style={{ flexShrink: 0, background: "var(--card)", borderRadius: 14, boxShadow: SHADOW, padding: "9px 12px", display: "flex", flexDirection: "column", gap: 3, minWidth: 92 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)", letterSpacing: 0.3 }}>{r.code}</span>
              <Sparkline data={r.spark} color={c(r.tone)} width={28} height={14} strokeWidth={1.6} />
            </div>
            <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{r.value}</span>
            <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 600, color: c(r.tone) }}>{r.chg}</span>
          </div>
        ))}
      </div>
    );
  }

  function Hero() {
    return (
      <div style={{ padding: "10px 18px 0" }}>
        <Card style={{ padding: 18, background: "linear-gradient(135deg, var(--accent), #6D5CF0)", color: "#fff", boxShadow: "0 10px 30px rgba(61,78,232,.32)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.9 }}>
            <span style={{ width: 6, height: 6, borderRadius: 6, background: "#9FE7C6" }} />{D.meta.edition} · {D.meta.readTime}
          </div>
          <h1 style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.12, letterSpacing: -0.5, margin: "10px 0 9px" }}>{D.global.headline}</h1>
          <p style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.92, margin: 0 }}>{D.global.standfirst}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button style={{ all: "unset", cursor: "pointer", background: "#fff", color: "var(--accent)", fontSize: 12.5, fontWeight: 700, padding: "9px 16px", borderRadius: 999 }}>Read brief</button>
            <button style={{ all: "unset", cursor: "pointer", background: "rgba(255,255,255,.18)", color: "#fff", fontSize: 12.5, fontWeight: 600, padding: "9px 16px", borderRadius: 999, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="11" height="12" viewBox="0 0 11 12"><path d="M1 1l9 5-9 5z" fill="#fff" /></svg>Listen
            </button>
          </div>
        </Card>
      </div>
    );
  }

  function SectionTitle({ children, action }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 10px" }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.3, margin: 0 }}>{children}</h2>
        {action && <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent)" }}>{action}</span>}
      </div>
    );
  }

  function ExecSummary() {
    return (
      <>
        <SectionTitle>Executive summary</SectionTitle>
        <div style={{ padding: "0 18px" }}>
          <Card style={{ padding: "6px 16px" }}>
            {D.summary.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: "13px 0", borderBottom: i < D.summary.length - 1 ? "1px solid var(--hair)" : "none" }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: c(s.tone), flexShrink: 0, marginTop: 4 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", lineHeight: 1.25 }}>{s.t}</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4, marginTop: 2 }}>{s.s}</div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </>
    );
  }

  function ChainCard({ chain }) {
    return (
      <Card style={{ padding: 15, marginBottom: 11 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: c("pos", "bg"), display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 13 13"><path d="M2 6.5h7M7 3l3.5 3.5L7 10" stroke={PAL.pos} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{chain.title}</span>
        </div>
        <CausalChain chain={chain} c={c} />
      </Card>
    );
  }

  function Chains() {
    return (
      <>
        <SectionTitle action="How we read it">Causal chains</SectionTitle>
        <div style={{ padding: "0 18px" }}>{D.chains.map((ch, i) => <ChainCard key={i} chain={ch} />)}</div>
      </>
    );
  }

  function Top5Card({ item }) {
    const [open, setOpen] = useState(false);
    return (
      <Card style={{ minWidth: "calc(100% - 36px)", scrollSnapAlign: "center", padding: 16, marginRight: 11, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
          <span style={{ width: 30, height: 30, borderRadius: 10, background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.rank}</span>
          <span style={{ fontSize: 22 }}>{item.flag}</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{item.country}</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 3, fontFamily: mono, fontSize: 12, fontWeight: 700, color: c(item.stat.tone), background: c(item.stat.tone, "bg"), padding: "4px 9px", borderRadius: 999 }}>
            <TrendArrow tone={item.stat.tone} c={c} size={9} />{item.stat.chg}
          </span>
        </div>
        <h3 style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.2, color: "var(--ink)", letterSpacing: -0.3, margin: "0 0 6px" }}>{item.headline}</h3>
        <p style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--muted)", margin: "0 0 12px" }}>{item.blurb}</p>
        <div style={{ background: "var(--chipBg)", borderRadius: 14, padding: "11px 13px", display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>{item.stat.label}</div>
            <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{item.stat.value}</div>
          </div>
          <div style={{ marginLeft: "auto" }}><Sparkline data={item.stat.spark} color={c(item.stat.tone)} width={96} height={32} strokeWidth={2} fill={c(item.stat.tone, "bg")} dot /></div>
        </div>
        <button onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", display: "flex", width: "100%", boxSizing: "border-box", alignItems: "center", justifyContent: "space-between", marginTop: 12, fontSize: 12.5, fontWeight: 700, color: "var(--accent)" }}>
          Impact map
          <svg width="13" height="13" viewBox="0 0 13 13" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .25s" }}><path d="M2 4l4.5 4.5L11 4" stroke="var(--accent)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <div style={{ maxHeight: open ? 200 : 0, overflow: "hidden", transition: "max-height .3s ease" }}>
          <div style={{ paddingTop: 12 }}><ImpactPills impact={item.impact} dimOrder={D.dimOrder} c={c} variant="pill" /></div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 11, fontWeight: 500 }}>Source · {item.source}</div>
        </div>
      </Card>
    );
  }

  function Top5() {
    const [idx, setIdx] = useState(0);
    const ref = useRef(null);
    const onScroll = () => { const el = ref.current; if (!el) return; setIdx(Math.round(el.scrollLeft / (el.scrollWidth / D.top5.length))); };
    return (
      <>
        <SectionTitle action={`${String(idx + 1)} / 5`}>Africa Top 5</SectionTitle>
        <div ref={ref} onScroll={onScroll} style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", padding: "0 18px", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {D.top5.map((it) => <Top5Card key={it.rank} item={it} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
          {D.top5.map((_, i) => <span key={i} style={{ width: i === idx ? 20 : 6, height: 6, borderRadius: 6, background: i === idx ? "var(--accent)" : "var(--hair)", transition: "all .25s" }} />)}
        </div>
      </>
    );
  }

  function Markets() {
    const [tab, setTab] = useState("fx");
    const tabs = [["fx", "FX"], ["commods", "Commodities"], ["spreads", "Spreads"]];
    const rows = tab === "fx" ? D.fx.map(r => ({ k: r.code, ...r })) : tab === "commods" ? D.commods.map(r => ({ k: r.name, label: r.name, ...r })) : D.spreads.map(r => ({ k: r.name, label: r.name, value: r.value + "bp", ...r }));
    return (
      <>
        <SectionTitle action="Dashboard">Markets</SectionTitle>
        <div style={{ display: "flex", gap: 7, padding: "0 18px 12px" }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 999, color: tab === k ? "#fff" : "var(--muted)", background: tab === k ? "var(--ink)" : "var(--card)", boxShadow: tab === k ? "none" : SHADOW }}>{l}</button>
          ))}
        </div>
        <div style={{ padding: "0 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {rows.map((r) => (
            <Card key={r.k} style={{ padding: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{r.code || r.label}</span>
                {r.spark && <Sparkline data={r.spark} color={c(r.tone)} width={40} height={16} strokeWidth={1.6} />}
              </div>
              <div style={{ fontFamily: mono, fontSize: 17, fontWeight: 700, color: "var(--ink)", marginTop: 5 }}>{r.value}</div>
              <div style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: c(r.tone), marginTop: 1 }}>{r.chg}</div>
            </Card>
          ))}
        </div>
      </>
    );
  }

  function Closers() {
    return (
      <>
        <SectionTitle>Why it matters</SectionTitle>
        <div style={{ padding: "0 18px" }}>
          <Card style={{ padding: 16, background: "var(--ink)", color: "#fff" }}>
            <p style={{ fontSize: 14.5, lineHeight: 1.5, margin: 0, fontWeight: 500 }}>{D.why}</p>
          </Card>
        </div>
        <SectionTitle>What to watch next</SectionTitle>
        <div style={{ padding: "0 18px", display: "flex", flexDirection: "column", gap: 9 }}>
          {D.watch.map((w, i) => (
            <Card key={i} style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "rgba(61,78,232,.10)", padding: "5px 9px", borderRadius: 9, minWidth: 32, textAlign: "center" }}>{w.d}</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{w.t}</span>
              <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)", textAlign: "right" }}>{w.note}</span>
            </Card>
          ))}
        </div>
        <SectionTitle>48-hour outlook</SectionTitle>
        <div style={{ padding: "0 18px" }}>
          <Card style={{ padding: 16 }}>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink)", margin: 0, opacity: 0.85 }}>{D.outlook}</p>
          </Card>
        </div>
      </>
    );
  }

  function Footer() {
    return (
      <div style={{ padding: "26px 24px 30px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Facts. Context. Balance.</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>Ted's Africa Brief · Africa-first intelligence</div>
      </div>
    );
  }

  function TabBar() {
    const icons = [
      "M3 9.5L11 3l8 6.5V19a1 1 0 01-1 1h-4v-6H8v6H4a1 1 0 01-1-1z",
      "M11 2a9 9 0 100 18 9 9 0 000-18zM11 6v5l3 2",
      "M3 13l4-4 4 3 6-6", "M4 4h14v14H4zM4 9h14M9 9v9",
      "M6 3h10v17l-5-3-5 3z",
    ];
    return (
      <nav style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "10px 8px 24px", background: "var(--card)", borderTop: "1px solid var(--hair)", flexShrink: 0 }}>
        {D.nav.map((n, i) => (
          <div key={n.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: i === 0 ? "var(--accent)" : "var(--muted)" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d={icons[i]} stroke="currentColor" strokeWidth={i === 0 ? 2 : 1.7} strokeLinejoin="round" strokeLinecap="round" /></svg>
            <span style={{ fontSize: 9.5, fontWeight: i === 0 ? 700 : 500 }}>{n.label}</span>
          </div>
        ))}
      </nav>
    );
  }

  function PulseBrief() {
    return (
      <div style={{ ...VARS, height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--ink)" }}>
        <div className="ab-scroll" style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          <Header />
          <Ticker />
          <Hero />
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

  window.PulseBrief = PulseBrief;
})();
