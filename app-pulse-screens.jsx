// ─────────────────────────────────────────────────────────────
// PULSE SCREENS — Markets, Weekly, Saved
// Uses window.PulseUI, window.SaveCtx, window.TAB, primitives.
// Exports: window.MarketsScreen, window.WeeklyScreen, window.SavedScreen
// ─────────────────────────────────────────────────────────────
(function () {
  const { useState, useContext } = React;
  const D = window.TAB;
  const { c, mono, SHADOW, Card, SectionTitle, Pill } = window.PulseUI;
  const SaveCtx = window.SaveCtx;
  const Spark = window.Sparkline;

  function ScreenHead({ title, sub }) {
    return (
      <div style={{ padding: "58px 20px 8px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)" }}>{sub}</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8, color: "var(--ink)", margin: "3px 0 0" }}>{title}</h1>
      </div>
    );
  }

  // ───────────────────────────── MARKETS ─────────────────────────────
  function FeaturedChart() {
    const ranges = ["1W", "1M", "3M", "1Y"];
    const [r, setR] = useState("1W");
    const f = D.fx[0]; // NGN
    return (
      <div style={{ padding: "12px 18px 0" }}>
        <Card style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>NGN / USD · spot</div>
              <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, color: "var(--ink)", lineHeight: 1.1, marginTop: 3 }}>{f.value}</div>
            </div>
            <Pill tone={f.tone}>{f.chg} w/w</Pill>
          </div>
          <div style={{ margin: "14px -2px 0" }}>
            <Spark data={[1565, 1548, 1530, 1522, 1510, 1498, 1486, 1470, 1452]} color={c(f.tone)} width={326} height={92} strokeWidth={2.4} fill={c(f.tone, "bg")} dot />
          </div>
          <div style={{ display: "flex", gap: 7, marginTop: 14 }}>
            {ranges.map((x) => (
              <button key={x} onClick={() => setR(x)} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700, padding: "7px 0", borderRadius: 9, color: r === x ? "#fff" : "var(--muted)", background: r === x ? "var(--ink)" : "var(--chipBg)" }}>{x}</button>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  function Alerts() {
    return (
      <>
        <SectionTitle action="Auto-promoted">Triggered alerts</SectionTitle>
        <div className="ab-scroll" style={{ display: "flex", gap: 11, overflowX: "auto", padding: "0 18px 4px", scrollbarWidth: "none" }}>
          {D.alerts.map((a, i) => (
            <Card key={i} style={{ minWidth: 232, flexShrink: 0, padding: 14, borderLeft: `3px solid ${c(a.tone)}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: c(a.tone), background: c(a.tone, "bg"), padding: "3px 7px", borderRadius: 6 }}>{a.tag}</span>
                <window.TrendArrow tone={a.tone} c={c} size={11} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.2 }}>{a.title}</div>
              <p style={{ fontSize: 12, lineHeight: 1.42, color: "var(--muted)", margin: "5px 0 9px" }}>{a.detail}</p>
              <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, borderTop: "1px solid var(--hair)", paddingTop: 8 }}>Rule · {a.rule}</div>
            </Card>
          ))}
        </div>
      </>
    );
  }

  function MarketTable() {
    const [tab, setTab] = useState("fx");
    const tabs = [["fx", "FX"], ["commods", "Commodities"], ["spreads", "Spreads"]];
    const rows = tab === "fx" ? D.fx.map(r => ({ k: r.code, label: r.code, ...r }))
      : tab === "commods" ? D.commods.map(r => ({ k: r.name, label: r.name, ...r }))
      : D.spreads.map(r => ({ k: r.name, label: r.name, value: r.value + "bp", ...r }));
    return (
      <>
        <SectionTitle>Dashboard</SectionTitle>
        <div style={{ display: "flex", gap: 7, padding: "0 18px 12px" }}>
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 999, color: tab === k ? "#fff" : "var(--muted)", background: tab === k ? "var(--ink)" : "var(--card)", boxShadow: tab === k ? "none" : SHADOW }}>{l}</button>
          ))}
        </div>
        <div style={{ padding: "0 18px" }}>
          <Card style={{ padding: "4px 16px" }}>
            {rows.map((r, i) => (
              <div key={r.k} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--hair)" : "none" }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", width: 70 }}>{r.label}</span>
                {r.spark ? <Spark data={r.spark} color={c(r.tone)} width={56} height={20} strokeWidth={1.8} /> : <span style={{ width: 56 }} />}
                <span style={{ fontFamily: mono, fontSize: 14, color: "var(--ink)", marginLeft: "auto" }}>{r.value}</span>
                <span style={{ fontFamily: mono, fontSize: 12.5, fontWeight: 700, color: c(r.tone), width: 60, textAlign: "right" }}>{r.chg}</span>
              </div>
            ))}
          </Card>
        </div>
      </>
    );
  }

  function MarketsScreen() {
    return (
      <>
        <ScreenHead sub="Live · 29 May" title="Markets" />
        <FeaturedChart />
        <Alerts />
        <MarketTable />
        <div style={{ height: 30 }} />
      </>
    );
  }

  // ───────────────────────────── WEEKLY ─────────────────────────────
  function WeekProse({ b }) {
    return (
      <Card style={{ padding: 16, marginBottom: 11 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)", marginBottom: 5 }}>{b.kicker}</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.3, margin: "0 0 7px" }}>{b.title}</h3>
        <p style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink)", opacity: 0.82, margin: 0 }}>{b.text}</p>
      </Card>
    );
  }

  function WeekTop10({ b }) {
    const rows = [...D.top5.map(t => ({ rank: t.rank, country: t.country, flag: t.flag, headline: t.headline, chg: t.stat.chg, tone: t.stat.tone })), ...D.top10extra];
    return (
      <Card style={{ padding: "6px 16px", marginBottom: 11 }}>
        <div style={{ padding: "12px 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)" }}>{b.kicker}</div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--hair)" : "none" }}>
            <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: "var(--muted)", width: 18 }}>{String(r.rank).padStart(2, "0")}</span>
            <span style={{ fontSize: 17 }}>{r.flag}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{r.country}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", lineHeight: 1.25 }}>{r.headline}</div>
            </div>
            <span style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 700, color: c(r.tone) }}>{r.chg}</span>
          </div>
        ))}
      </Card>
    );
  }

  function WeekPulse({ b }) {
    return (
      <Card style={{ padding: 16, marginBottom: 11 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>{b.kicker}</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.3, margin: "0 0 12px" }}>{b.title}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {b.items.map((s, i) => (
            <div key={i} style={{ background: "var(--chipBg)", borderRadius: 13, padding: "11px 13px" }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: "var(--ink)", marginTop: 3 }}>{s.value}</div>
              <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 700, color: c(s.tone), marginTop: 1 }}>{s.chg}</div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  function WeekDealwire({ b }) {
    return (
      <Card style={{ padding: "6px 16px", marginBottom: 11 }}>
        <div style={{ padding: "12px 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)" }}>{b.kicker}</div>
        {D.dealwire.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < D.dealwire.length - 1 ? "1px solid var(--hair)" : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--chipBg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "var(--accent)", flexShrink: 0 }}>{d.cc}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{d.co}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{d.title} · {d.sector}</div>
            </div>
            <span style={{ fontFamily: mono, fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{d.value}</span>
          </div>
        ))}
      </Card>
    );
  }

  function WeekWatchlist({ b }) {
    const rows = [D.fx[0], D.fx[1], D.commods[0], D.spreads[1]];
    const labels = ["NGN/USD", "ZAR/USD", "Brent", "KE 2031"];
    return (
      <Card style={{ padding: "6px 16px", marginBottom: 11 }}>
        <div style={{ padding: "12px 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)" }}>{b.kicker}</div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--hair)" : "none" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", width: 76 }}>{labels[i]}</span>
            {r.spark && <Spark data={r.spark} color={c(r.tone)} width={50} height={18} />}
            <span style={{ fontFamily: mono, fontSize: 13, color: "var(--ink)", marginLeft: "auto" }}>{r.value}{i === 3 ? "bp" : ""}</span>
            <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: c(r.tone), width: 56, textAlign: "right" }}>{r.chg}</span>
          </div>
        ))}
      </Card>
    );
  }

  function WeekCalendar({ b }) {
    return (
      <Card style={{ padding: "6px 16px", marginBottom: 11 }}>
        <div style={{ padding: "12px 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)" }}>{b.kicker}</div>
        {b.items.map((w, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < b.items.length - 1 ? "1px solid var(--hair)" : "none" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "rgba(61,78,232,.10)", padding: "5px 9px", borderRadius: 9, minWidth: 36, textAlign: "center" }}>{w.d}</span>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{w.t}</span>
            <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)", textAlign: "right" }}>{w.note}</span>
          </div>
        ))}
      </Card>
    );
  }

  function WeekDeals({ b }) {
    return (
      <Card style={{ padding: "6px 16px", marginBottom: 11 }}>
        <div style={{ padding: "12px 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)" }}>{b.kicker}</div>
        {D.dealwire.slice(0, 3).map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < 2 ? "1px solid var(--hair)" : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--chipBg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "var(--accent)", flexShrink: 0 }}>{d.cc}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{d.co} · {d.title}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Expected to price this week</div>
            </div>
            <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{d.value}</span>
          </div>
        ))}
      </Card>
    );
  }

  function WeekFocal({ b }) {
    return (
      <Card style={{ padding: "6px 16px", marginBottom: 11 }}>
        <div style={{ padding: "12px 0 6px", fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)" }}>{b.kicker}</div>
        {b.items.map((it, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderBottom: i < b.items.length - 1 ? "1px solid var(--hair)" : "none" }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: "var(--chipBg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "var(--accent)", flexShrink: 0 }}>{it.cc}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", lineHeight: 1.3 }}>{it.t}</span>
          </div>
        ))}
      </Card>
    );
  }

  function WeekRisks({ b }) {
    return (
      <Card style={{ padding: 16, marginBottom: 11 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)", marginBottom: 4 }}>{b.kicker}</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: -0.3, margin: "0 0 12px" }}>{b.title}</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {b.items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: c(it.tone), flexShrink: 0, marginTop: 5 }} />
              <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink)", opacity: 0.85 }}>{it.text}</span>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const BLOCK = { prose: WeekProse, top10: WeekTop10, pulse: WeekPulse, dealwire: WeekDealwire, watchlist: WeekWatchlist, calendar: WeekCalendar, deals: WeekDeals, focal: WeekFocal, risks: WeekRisks };

  function WeeklyScreen() {
    const ctx = useContext(SaveCtx);
    const [ed, setEd] = useState("sat");
    const e = D.weekly[ed];
    return (
      <>
        <ScreenHead sub="Weekly Intelligence" title="Weekly" />
        <div style={{ padding: "10px 18px 4px", display: "flex", gap: 8 }}>
          {[["sat", "Sat · Review"], ["sun", "Sun · Ahead"]].map(([k, l]) => (
            <button key={k} onClick={() => setEd(k)} style={{ all: "unset", cursor: "pointer", flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: 700, padding: "10px 0", borderRadius: 12, color: ed === k ? "#fff" : "var(--muted)", background: ed === k ? "var(--accent)" : "var(--card)", boxShadow: ed === k ? "0 4px 12px rgba(61,78,232,.3)" : SHADOW }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 8px" }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)", letterSpacing: -0.3 }}>{e.label}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{e.day} · {e.range}</div>
          </div>
          <window.PulseUI.SaveButton id="weekly_sat" />
        </div>
        <div style={{ padding: "0 18px" }}>
          {e.blocks.map((b, i) => { const C = BLOCK[b.type]; return C ? <C key={i} b={b} /> : null; })}
        </div>
        <div style={{ padding: "8px 24px 30px", textAlign: "center" }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>— Ted's Africa Brief | Facts. Context. Balance.</div>
        </div>
      </>
    );
  }

  // ───────────────────────────── SAVED ─────────────────────────────
  function SavedScreen({ go }) {
    const ctx = useContext(SaveCtx);
    const [filter, setFilter] = useState("All");
    const items = ctx.ids.map((id) => ({ id, ...D.savable[id] })).filter(Boolean);
    const kinds = ["All", "Daily Brief", "Top 5", "Weekly"];
    const shown = filter === "All" ? items : items.filter((x) => x.kind === filter);
    return (
      <>
        <ScreenHead sub={`${items.length} saved`} title="Saved" />
        <div className="ab-scroll" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 18px 6px", scrollbarWidth: "none" }}>
          {kinds.map((k) => (
            <button key={k} onClick={() => setFilter(k)} style={{ all: "unset", cursor: "pointer", flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "7px 14px", borderRadius: 999, color: filter === k ? "#fff" : "var(--muted)", background: filter === k ? "var(--ink)" : "var(--card)", boxShadow: filter === k ? "none" : SHADOW }}>{k}</button>
          ))}
        </div>
        {shown.length === 0 ? (
          <div style={{ padding: "70px 40px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 18, background: "var(--card)", boxShadow: SHADOW, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="22" height="24" viewBox="0 0 15 17" fill="none"><path d="M2 2.2A1.2 1.2 0 013.2 1h8.6A1.2 1.2 0 0113 2.2V16l-5.5-3.4L2 16V2.2z" stroke="var(--muted)" strokeWidth="1.5" strokeLinejoin="round" /></svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>Nothing saved yet</div>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, margin: "6px 0 16px" }}>Tap the bookmark on any brief or Top 5 card to keep it here for later.</p>
            <button onClick={() => go("daily")} style={{ all: "unset", cursor: "pointer", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 700, padding: "10px 20px", borderRadius: 999 }}>Go to Daily</button>
          </div>
        ) : (
          <div style={{ padding: "8px 18px 30px", display: "flex", flexDirection: "column", gap: 11 }}>
            {shown.map((x) => (
              <Card key={x.id} style={{ padding: 15, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: 8, background: c(x.tone), flexShrink: 0, marginTop: 6 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--accent)" }}>{x.kind}</div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)", lineHeight: 1.25, margin: "3px 0 4px" }}>{x.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{x.meta}</div>
                </div>
                <window.PulseUI.SaveButton id={x.id} size={32} />
              </Card>
            ))}
          </div>
        )}
      </>
    );
  }

  Object.assign(window, { MarketsScreen, WeeklyScreen, SavedScreen });
})();
