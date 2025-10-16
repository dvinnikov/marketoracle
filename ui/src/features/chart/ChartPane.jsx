// src/features/chart/ChartPane.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import CandleChartMini from "./CandleChartMini.jsx";
import { getCandles, wsUrl } from "../../lib/api";

export default function ChartPane({ symbol, timeframe }) {
  const [bars, setBars] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | live
  const wsRef = useRef(null);

  const title = useMemo(()=>`${symbol ?? "—"} ${timeframe ?? ""}`, [symbol, timeframe]);

  // Load initial history when symbol/tf change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!symbol || !timeframe) return;
      setStatus("loading");
      try {
        const data = await getCandles(symbol, timeframe, 300);
        if (!cancelled) setBars(data.candles || []);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setStatus("idle");
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe]);

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
          setBars(prev => {
            if (!prev?.length) return [msg.bar];
            const last = prev[prev.length - 1];
            if (last.time === msg.bar.time) {
              // replace last
              const cp = prev.slice();
              cp[cp.length - 1] = msg.bar;
              return cp;
            }
            // append new
            const cp = prev.concat(msg.bar);
            // keep last 400 max
            return cp.length > 400 ? cp.slice(cp.length - 400) : cp;
          });
        }
      } catch {}
    };
    ws.onclose = () => { wsRef.current = null; setStatus("idle"); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  function stop() {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    setStatus("idle");
  }

  return (
    <div className="card">
      <div className="h" style={{justifyContent:"space-between"}}>
        <b>Chart — {title}</b>
        <div className="h" style={{gap:8}}>
          <span className="badge">bars: {bars.length}</span>
          {status === "live" ? (
            <button className="btn" onClick={stop}>Stop</button>
          ) : (
            <button className="btn" onClick={start}>Start</button>
          )}
        </div>
      </div>
      <div className="hr" />
      <CandleChartMini bars={bars} />
    </div>
  );
}
