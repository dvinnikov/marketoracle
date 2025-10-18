// src/features/chart/ChartPane.jsx
import TVChart from "./TVChart";

export default function ChartPane({
  symbol,
  timeframe,
  levels = [],
  height = 420,
}) {
  // Safe defaults so first render never explodes
  const sym = (symbol || "EURUSD").toString();
  const tf  = (timeframe || "M1").toString().toUpperCase();

  return (
    <section className="card" style={{ padding: 12 }}>
      <div className="h" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <b>Chart — {sym} {tf}</b>
      </div>

      {/* TradingView widget handles history + realtime via its Datafeed */}
      <div style={{ height }}>
        <TVChart symbol={sym} timeframe={tf} height={height} levels={levels} />
      </div>
    </section>
  );
}
