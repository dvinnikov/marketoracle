// src/features/chart/CandleChartMini.jsx
export default function CandleChartMini({ bars = [], height = 280, padding = 8 }) {
  const N = bars.length;
  const width = Math.max(300, N * 6 + padding * 2); // ~6px per bar
  if (!N) return <div style={{ color: "var(--muted)" }}>No bars</div>;

  const lows  = bars.map(b => b.low);
  const highs = bars.map(b => b.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || 1;

  const x = i => padding + i * 6 + 3; // center per bar
  const y = v => padding + (1 - (v - min) / range) * (height - padding * 2);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
           style={{ background:"#151515", borderRadius:12, border:"1px solid var(--border)" }}>
        {/* grid-ish lines */}
        {[0.25,0.5,0.75].map((p,i)=>(
          <line key={i} x1={0} x2={width} y1={padding + p*(height-2*padding)} y2={padding + p*(height-2*padding)}
                stroke="#2a2a2a" strokeDasharray="4 4"/>
        ))}

        {/* candles */}
        {bars.map((b, i) => {
          const isUp = b.close >= b.open;
          const bodyTop = y(Math.max(b.open, b.close));
          const bodyBot = y(Math.min(b.open, b.close));
          const bodyH = Math.max(1, bodyBot - bodyTop);
          const wickTop = y(b.high);
          const wickBot = y(b.low);
          const col = isUp ? "#22c55e" : "#ef4444";
          return (
            <g key={b.time ?? i}>
              <line x1={x(i)} x2={x(i)} y1={wickTop} y2={wickBot} stroke={col} strokeWidth="1"/>
              <rect x={x(i)-2} y={bodyTop} width="4" height={bodyH} fill={col} rx="1"/>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
