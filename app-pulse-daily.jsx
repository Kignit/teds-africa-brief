// ─────────────────────────────────────────────────────────────
// PULSE KIT — shared theme, primitives & save state for the app.
// Exports: window.PulseUI (tokens + Card/SectionTitle/Pill/SaveButton),
//          window.SaveCtx (React context), window.DailyScreen
// ─────────────────────────────────────────────────────────────
(function () {
  const { useState, useRef, useContext } = React;
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

  const SaveCtx = React.createContext({ ids: [], toggle: () => {}, has: () => false });

  function Card({ children, style = {} }) {
    return <div style={{ background: "var(--card)", borderRadius: 20, boxShadow: SHADOW, ...style }}>{children}</div>;
  }

  function SectionTitle({ children, action, onAction }) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 20px 11px" }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.3, margin: 0 }}>{children}</h2>
        {action && <span onClick={onAction} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--accent)", cursor: onAction ? "pointer" : "default" }}>{action}</span>}
      </div>
    );
  }

  // Bookmark toggle bound to the save context
  function SaveButton({ id, dark = false, size = 34 }) {
    const ctx = useContext(SaveCtx);
    const on = ctx.has(id);
    const stroke = dark ? "#fff" : "var(--ink)";
    const col = on ? "var(--accent)" : "transparent";
    const line = on ? "var(--accent)" : (dark ? "rgba(255,255,255,.85)" : "var(--muted)");
    return (
      <button onClick={(e) => { e.stopPropagation(); ctx.toggle(id); }} aria-label="Save"
        style={{ all: "unset", cursor: "pointer", width: size, height: size, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: dark ? "rgba(255,255,255,.16)" : "var(--chipBg)", flexShrink: 0, transition: "transform .15s", transform: on ? "scale(1.04)" : "scale(1)" }}>
        <svg width="15" height="17" viewBox="0 0 15 17" fill={col} style={{ transition: "fill .15s" }}>
          <path d="M2 2.2A1.2 1.2 0 013.2 1h8.6A1.2 1.2 0 0113 2.2V16l-5.5-3.4L2 16V2.2z" stroke={line} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  function Pill({ tone, children }) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: mono, fontSize: 12, fontWeight: 700, color: c(tone), background: c(tone, "bg"), padding: "4px 9px", borderRadius: 999 }}>
        <window.TrendArrow tone={tone} c={c} size={9} />{children}
      </span>
    );
  }

  window.PulseUI = { PAL, c, VARS, mono, SHADOW, Card, SectionTitle, SaveButton, Pill };
  window.SaveCtx = SaveCtx;

  // ───────────────────────────────────────────────────────────
  // DAILY SCREEN
  // ───────────────────────────────────────────────────────────
  function TopBar() {
    return (
      <div style={{ padding: "56px 18px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 40, height: 40, borderRadius: 13, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(61,78,232,.35)" }}>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 17, letterSpacing: -1 }}>tab</span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.3, lineHeight: 1.15, whiteSpace: "nowrap" }}>Ted's Africa Brief</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{D.meta.dateLong}</div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 999, background: "var(--card)", boxShadow: SHADOW, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "relative" }}>
              <svg width="17" height="18" viewBox="0 0 17 18" fill="none"><path d="M8.5 1.5a5 5 0 00-5 5v3l-1.5 2.5h13L13.5 9.5v-3a5 5 0 00-5-5z" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" /><path d="M6.5 15a2 2 0 004 0" stroke="var(--ink)" strokeWidth="1.5" /></svg>
              <span style={{ position: "absolute", top: -2, right: -1, width: 7, height: 7, borderRadius: 7, background: "var(--accent)", border: "1.5px solid var(--card)" }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  function Ticker({ go }) {
    return (
      <div style={{ display: "flex", gap: 9, overflowX: "auto", padding: "12px 18px 4px", scrollbarWidth: "none" }} className="ab-scroll">
        {D.fx.map((r) => (
          <div key={r.code} onClick={() => go("markets")} style={{ cursor: "pointer", flexShrink: 0, background: "var(--card)", borderRadius: 14, boxShadow: SHADOW, padding: "9px 12px", display: "flex", flexDirection: "column", gap: 3, minWidth: 92 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)", letterSpacing: 0.3 }}>{r.code}</span>
              <window.Sparkline data={r.spark} color={c(r.tone)} width={28} height={14} strokeWidth={1.6} />
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", opacity: 0.9 }}>
              <span style={{ width: 6, height: 6, borderRadius: 6, background: "#9FE7C6" }} />{D.meta.edition} · {D.meta.readTime}
            </div>
            <div style={{ marginLeft: "auto" }}><SaveButton id="lead" dark /></div>
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
        <window.CausalChain chain={chain} c={c} />
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
          <span style={{ marginLeft: "auto" }}><Pill tone={item.stat.tone}>{item.stat.chg}</Pill></span>
        </div>
        <h3 style={{ fontSize: 16.5, fontWeight: 700, lineHeight: 1.2, color: "var(--ink)", letterSpacing: -0.3, margin: "0 0 6px" }}>{item.headline}</h3>
        <p style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--muted)", margin: "0 0 12px" }}>{item.blurb}</p>
        <div style={{ background: "var(--chipBg)", borderRadius: 14, padding: "11px 13px", display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600 }}>{item.stat.label}</div>
            <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>{item.stat.value}</div>
          </div>
          <div style={{ marginLeft: "auto" }}><window.Sparkline data={item.stat.spark} color={c(item.stat.tone)} width={96} height={32} strokeWidth={2} fill={c(item.stat.tone, "bg")} dot /></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <button onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, fontWeight: 700, color: "var(--accent)" }}>
            Impact map
            <svg width="13" height="13" viewBox="0 0 13 13" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .25s" }}><path d="M2 4l4.5 4.5L11 4" stroke="var(--accent)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <SaveButton id={item.code.toLowerCase()} size={30} />
        </div>
        <div style={{ maxHeight: open ? 200 : 0, overflow: "hidden", transition: "max-height .3s ease" }}>
          <div style={{ paddingTop: 12 }}><window.ImpactPills impact={item.impact} dimOrder={D.dimOrder} c={c} variant="pill" /></div>
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
        <SectionTitle action={`${idx + 1} / 5`}>Africa Top 5</SectionTitle>
        <div ref={ref} onScroll={onScroll} className="ab-scroll" style={{ display: "flex", overflowX: "auto", scrollSnapType: "x mandatory", padding: "0 18px", scrollbarWidth: "none" }}>
          {D.top5.map((it) => <Top5Card key={it.rank} item={it} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
          {D.top5.map((_, i) => <span key={i} style={{ width: i === idx ? 20 : 6, height: 6, borderRadius: 6, background: i === idx ? "var(--accent)" : "var(--hair)", transition: "all .25s" }} />)}
        </div>
      </>
    );
  }

  function MarketsSnapshot({ go }) {
    return (
      <>
        <SectionTitle action="Open dashboard →" onAction={() => go("markets")}>Markets at a glance</SectionTitle>
        <div style={{ padding: "0 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[D.commods[0], D.commods[1], D.commods[2], D.spreads[1]].map((r, i) => (
            <Card key={i} style={{ padding: 13 }} onClick={() => go("markets")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{r.name}</span>
                {r.spark && <window.Sparkline data={r.spark} color={c(r.tone)} width={40} height={16} strokeWidth={1.6} />}
              </div>
              <div style={{ fontFamily: mono, fontSize: 17, fontWeight: 700, color: "var(--ink)", marginTop: 5 }}>{r.value}{r.name.includes("20") ? "bp" : ""}</div>
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
        <div style={{ padding: "26px 24px 30px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>Facts. Context. Balance.</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>Ted's Africa Brief · Africa-first intelligence</div>
        </div>
      </>
    );
  }

  function DailyScreen({ go }) {
    return (
      <>
        <TopBar />
        <Ticker go={go} />
        <Hero />
        <ExecSummary />
        <Chains />
        <Top5 />
        <MarketsSnapshot go={go} />
        <Closers />
      </>
    );
  }

  window.DailyScreen = DailyScreen;
})();
