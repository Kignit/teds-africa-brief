// ─────────────────────────────────────────────────────────────
// PULSE APP — tab navigation + save state + persistence.
// Exports: window.PulseApp
// ─────────────────────────────────────────────────────────────
(function () {
  const { useState, useEffect, useCallback } = React;
  const D = window.TAB;
  const { VARS, SHADOW } = window.PulseUI;
  const SaveCtx = window.SaveCtx;

  const LS_TAB = "tab_active", LS_SAVED = "tab_saved";

  const ICONS = {
    daily: "M3 9.6L11 3l8 6.6V19a1 1 0 01-1 1h-4.2v-5.6H8.2V20H4a1 1 0 01-1-1z",
    markets: "M3 18V9.5M8.3 18V4M13.6 18v-6.5M19 18V7",
    weekly: "M4 6.2A1.2 1.2 0 015.2 5h11.6A1.2 1.2 0 0118 6.2V18a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 9.4h14M8 4v3.2M14 4v3.2",
    saved: "M6 3.3A1 1 0 017 2.4h8a1 1 0 011 .9V19l-5-3.1L6 19z",
  };

  function TabBar({ active, go }) {
    return (
      <nav style={{ display: "flex", justifyContent: "space-around", alignItems: "center", padding: "10px 8px 24px", background: "var(--card)", borderTop: "1px solid var(--hair)", flexShrink: 0, position: "relative", zIndex: 5 }}>
        {D.nav.map((n) => {
          const on = active === n.id;
          const fill = n.id === "saved" && on;
          return (
            <button key={n.id} onClick={() => go(n.id)} style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: on ? "var(--accent)" : "var(--muted)", padding: "2px 14px" }}>
              <svg width="23" height="23" viewBox="0 0 22 22" fill={fill ? "var(--accent)" : "none"}>
                <path d={ICONS[n.id]} stroke="currentColor" strokeWidth={on ? 2 : 1.7} strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 9.5, fontWeight: on ? 700 : 500 }}>{n.label}</span>
            </button>
          );
        })}
      </nav>
    );
  }

  function PulseApp() {
    const [active, setActive] = useState(() => localStorage.getItem(LS_TAB) || "daily");
    const [ids, setIds] = useState(() => {
      try { const s = JSON.parse(localStorage.getItem(LS_SAVED)); return Array.isArray(s) ? s : D.savedSeed.slice(); }
      catch { return D.savedSeed.slice(); }
    });

    useEffect(() => { localStorage.setItem(LS_TAB, active); }, [active]);
    useEffect(() => { localStorage.setItem(LS_SAVED, JSON.stringify(ids)); }, [ids]);

    const go = useCallback((t) => setActive(t), []);
    const toggle = useCallback((id) => setIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]), []);
    const has = useCallback((id) => ids.includes(id), [ids]);

    const screens = [
      ["daily", <window.DailyScreen go={go} />],
      ["markets", <window.MarketsScreen go={go} />],
      ["weekly", <window.WeeklyScreen go={go} />],
      ["saved", <window.SavedScreen go={go} />],
    ];

    return (
      <SaveCtx.Provider value={{ ids, toggle, has }}>
        <div style={{ ...VARS, height: "100%", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--ink)" }}>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            {screens.map(([id, node]) => (
              <div key={id} className="ab-scroll" style={{ position: "absolute", inset: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", display: active === id ? "block" : "none" }}>
                {node}
              </div>
            ))}
          </div>
          <TabBar active={active} go={go} />
        </div>
      </SaveCtx.Provider>
    );
  }

  window.PulseApp = PulseApp;
})();
