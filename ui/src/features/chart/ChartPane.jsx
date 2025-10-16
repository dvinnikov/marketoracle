import { useEffect, useRef, useState } from "react";
import TVChart from "./TVChart.jsx";
import { getCandles, wsUrl } from "../../lib/api";

export default function ChartPane({ symbol, timeframe, height = 420 }) {
  const [history, setHistory] = useState([]);
  const [liveBar, setLiveBar] = useState(null);
  const [status, setStatus] = useState("idle");
  const wsRef = useRef(null);

  // load history when symbol/tf changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!symbol || !timeframe) return;
      setStatus("loading");
      try {
        const data = await getCandles(symbol, timeframe, 500);
        if (!cancelled) setHistory(data?.candles ?? []);
      } catch (e) {
        console.error(e);
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setStatus("idle");
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  // simple live WS
  function start() {
    if (!symbol || !timeframe || wsRef.current) return;
    const url = wsUrl(`/stream/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    setStatus("live");

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === "tick" && msg?.bar) {
          const b = msg.bar; // {time, open, high, low, close}
          setLiveBar(b);
          setHistory((prev) => {
            if (!prev.length) return [b];
            const last = prev[prev.length - 1];
            if (last.time === b.time) {
              const cp = prev.slice();
              cp[cp.length - 1] = b;
              return cp;
            }
            const cp = prev.concat(b);
            return cp.length > 1000 ? cp.slice(cp.length - 1000) : cp;
          });
        }
      } catch {}
    };
    ws.onclose = () => { wsRef.current = null; setStatus("idle"); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  function stop() {
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    setStatus("idle");
  }

  return (
    <div className="card">
      <div className="h" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <b>Chart — {symbol ?? "—"} {timeframe}</b>
        <div className="h" style={{ gap: 8 }}>
          <span className="badge">bars: {history.length}</span>
          {status === "live" ? (
            <button className="btn" onClick={stop}>Stop</button>
          ) : (
            <button className="btn" onClick={start}>Start</button>
          )}
        </div>
      </div>

      <TVChart history={history} liveBar={liveBar} height={height} />
    </div>
  );
}
