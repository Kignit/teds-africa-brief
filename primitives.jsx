// ─────────────────────────────────────────────────────────────
// Shared chart + data primitives. Theme-agnostic: every color
// comes in via props so each direction can restyle them.
// Exports to window: Sparkline, ImpactPills, CausalChain, TrendArrow
// ─────────────────────────────────────────────────────────────

// Tiny line chart. `data` = array of numbers. Colors via props.
function Sparkline({ data, color = "#1E6F4C", width = 64, height = 22, strokeWidth = 1.6, fill = null, dot = false }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - strokeWidth * 2) - strokeWidth;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const areaD = fill ? d + ` L ${width} ${height} L 0 ${height} Z` : null;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
      {fill && <path d={areaD} fill={fill} />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {dot && <circle cx={last[0]} cy={last[1]} r={strokeWidth + 0.8} fill={color} />}
    </svg>
  );
}

function TrendArrow({ tone, size = 10, c }) {
  const col = c ? c(tone) : (tone === "pos" ? "#1E6F4C" : tone === "neg" ? "#B23B2E" : "#7C7C7C");
  if (tone === "neutral") {
    return (
      <svg width={size} height={size} viewBox="0 0 10 10"><path d="M2 5h6" stroke={col} strokeWidth="1.6" strokeLinecap="round" /></svg>
    );
  }
  const up = tone === "pos";
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" style={{ transform: up ? "none" : "rotate(0deg)" }}>
      {up
        ? <path d="M5 2l3 4H6v2H4V6H2z" fill={col} />
        : <path d="M5 8l3-4H6V2H4v2H2z" fill={col} />}
    </svg>
  );
}

// Impact Map — row of dimension pills colored by tone.
// `variant`: "pill" (filled chips) | "bar" (label + level bar) | "grid"
function ImpactPills({ impact, dimOrder, c, variant = "pill", compact = false }) {
  const dims = dimOrder.filter((d) => impact[d]);
  if (variant === "bar") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
        {dims.map((d) => {
          const t = impact[d];
          const col = c(t);
          return (
            <div key={d} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ fontSize: 10.5, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--muted)", width: 62, flexShrink: 0 }}>{d}</span>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--hair)", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, width: t === "neutral" ? "50%" : "100%", background: col, opacity: t === "neutral" ? 0.5 : 1 }} />
              </div>
              <TrendArrow tone={t} c={c} />
            </div>
          );
        })}
      </div>
    );
  }
  // default: filled pills
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {dims.map((d) => {
        const t = impact[d];
        return (
          <span key={d} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: compact ? 10.5 : 11.5, fontWeight: 600, letterSpacing: 0.1,
            padding: compact ? "3px 7px" : "4px 9px", borderRadius: 999,
            color: c(t), background: c(t, "bg"),
            border: `1px solid ${c(t, "bd")}`,
          }}>
            {d}<TrendArrow tone={t} c={c} size={9} />
          </span>
        );
      })}
    </div>
  );
}

// Causal-link chain — the signature feature. Nodes joined by arrows.
function CausalChain({ chain, c, layout = "wrap" }) {
  return (
    <div style={{ display: "flex", flexWrap: layout === "wrap" ? "wrap" : "nowrap", alignItems: "center", gap: 6, rowGap: 8 }}>
      {chain.nodes.map((n, i) => (
        <React.Fragment key={i}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 12, fontWeight: n.kind === "cause" ? 700 : 600,
            padding: "5px 10px", borderRadius: 7,
            background: n.tone ? c(n.tone, "bg") : "var(--chipBg)",
            color: n.tone ? c(n.tone) : "var(--ink)",
            border: `1px solid ${n.tone ? c(n.tone, "bd") : "var(--hair)"}`,
            whiteSpace: "nowrap",
          }}>
            {n.tone && <TrendArrow tone={n.tone} c={c} size={9} />}
            {n.label}
          </span>
          {i < chain.nodes.length - 1 && (
            <svg width="16" height="10" viewBox="0 0 16 10" style={{ flexShrink: 0, opacity: 0.55 }}>
              <path d="M1 5h12M9 1l4 4-4 4" stroke="var(--muted)" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

Object.assign(window, { Sparkline, ImpactPills, CausalChain, TrendArrow });
