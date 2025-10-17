import { useEffect, useMemo, useRef, useState } from "react";
import { getCandles, openCandleStream, placeMarketOrder } from "../../lib/api";
import { STRATEGIES } from "./strategies";

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"];
const MAX_HISTORY = 800;
const LOG_LIMIT = 50;
const DEFAULT_VOLUME = 0.1;
const DEFAULT_SL_PIPS = 30;
const DEFAULT_TP_PIPS = 60;
const FALLBACK_MP3 = "data:audio/mpeg;base64,//uQZAAAAAAAAAAAAAAAAAAAAAA==";

const createAudioPlayer = async (frequency = 880) => {
  if (typeof window === "undefined") return new Audio(FALLBACK_MP3);
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported?.("audio/mpeg")) {
    return new Audio(FALLBACK_MP3);
  }

  const ctx = new AudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = 0.35;
  osc.type = "sine";
  osc.frequency.value = frequency;
  osc.connect(gain);
  const dest = ctx.createMediaStreamDestination();
  gain.connect(dest);

  let recorder;
  try {
    recorder = new MediaRecorder(dest.stream, { mimeType: "audio/mpeg" });
  } catch (err) {
    console.warn("media recorder init failed", err);
    try { await ctx.close(); } catch (closeErr) { console.warn("ctx close", closeErr); }
    return new Audio(FALLBACK_MP3);
  }
  const chunks = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data?.size) chunks.push(ev.data);
  };

  const completed = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  recorder.start();
  osc.start();
  setTimeout(() => {
    try { recorder.stop(); } catch (err) { console.warn("recorder stop", err); }
    try { osc.stop(); } catch (err) { console.warn("osc stop", err); }
  }, 260);

  await completed;
  try { await ctx.close(); } catch (err) { console.warn("ctx close", err); }

  const blob = new Blob(chunks, { type: "audio/mpeg" });
  if (!blob.size) {
    return new Audio(FALLBACK_MP3);
  }
  const audio = new Audio();
  audio.src = URL.createObjectURL(blob);
  return audio;
};

const pipSizeFor = (symbol, price) => {
  if (!symbol) return price > 10 ? 0.01 : 0.0001;
  if (/JPY/i.test(symbol)) return 0.01;
  return price >= 10 ? 0.01 : 0.0001;
};

const formatTime = (ts) => new Date(ts).toLocaleTimeString();

const formatPrice = (symbol, price) => {
  const pip = pipSizeFor(symbol, price);
  const digits = pip <= 0.0001 ? 5 : pip <= 0.001 ? 4 : pip <= 0.01 ? 3 : 2;
  return Number(price).toFixed(digits);
};

const normalizeCandle = (candle) => ({
  time: Number(candle.time) * 1000,
  open: Number(candle.open),
  high: Number(candle.high),
  low: Number(candle.low),
  close: Number(candle.close),
  volume: Number(candle.volume ?? 0),
});

export default function AutoTrader({ symbols, symbol, timeframe, onSymbolChange, onTimeframeChange }) {
  const [selectedStrategies, setSelectedStrategies] = useState(["ema_cross"]);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [slPips, setSlPips] = useState(DEFAULT_SL_PIPS);
  const [tpPips, setTpPips] = useState(DEFAULT_TP_PIPS);
  const [status, setStatus] = useState("idle");
  const [isRunning, setIsRunning] = useState(false);
  const [lastPrice, setLastPrice] = useState(null);
  const [log, setLog] = useState([]);
  const [error, setError] = useState("");

  const audioRef = useRef({ buy: null, sell: null });
  const wsRef = useRef(null);
  const candlesRef = useRef([]);
  const runIdRef = useRef(0);

  const strategyMap = useMemo(() => {
    const map = new Map();
    STRATEGIES.forEach((s) => map.set(s.name, s));
    return map;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const [buy, sell] = await Promise.all([createAudioPlayer(880), createAudioPlayer(440)]);
        if (cancelled) return;
        audioRef.current = { buy, sell };
      } catch (err) {
        console.warn("audio setup failed", err);
      }
    };
    boot();
    return () => {
      cancelled = true;
      const { buy, sell } = audioRef.current || {};
      [buy, sell].forEach((audio) => {
        if (audio?.src?.startsWith?.("blob:")) {
          try { URL.revokeObjectURL(audio.src); } catch (err) { console.warn("revoke audio", err); }
        }
      });
      audioRef.current = { buy: null, sell: null };
    };
  }, []);

  useEffect(() => {
    if (!isRunning) return () => {};
    let cancelled = false;
    const currentRun = runIdRef.current + 1;
    runIdRef.current = currentRun;

    const init = async () => {
      setStatus("warming-up");
      setError("");
      try {
        const history = await getCandles(symbol, timeframe, 600);
        if (cancelled || runIdRef.current !== currentRun) return;
        const candles = (history?.candles ?? []).map(normalizeCandle);
        candlesRef.current = candles.slice(-MAX_HISTORY);

        const states = {};
        selectedStrategies.forEach((name) => {
          const desc = strategyMap.get(name);
          if (!desc) return;
          try {
            states[name] = {
              descriptor: desc,
              state: desc.init(candlesRef.current.slice()),
              lastSignalBar: undefined,
            };
          } catch (err) {
            console.error("strategy init failed", name, err);
          }
        });
        setStatus("streaming");
        const ws = openCandleStream(symbol, timeframe);
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            const bar = payload?.bar;
            if (!bar) return;
            const c = normalizeCandle(bar);
            handleIncomingCandle(c, states, symbol, currentRun);
          } catch (err) {
            console.error("ws parse", err);
          }
        };
        ws.onerror = (err) => {
          console.error("stream error", err);
          if (!cancelled) {
            setError("Realtime stream error");
            setStatus("error");
          }
        };
        ws.onclose = () => {
          if (!cancelled) {
            setStatus("idle");
            setIsRunning(false);
          }
        };
      } catch (err) {
        console.error("autotrader init", err);
        if (!cancelled) {
          setError(err?.message ?? "Failed to load history");
          setStatus("error");
          setIsRunning(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      try { wsRef.current?.close(); } catch (err) { console.warn("ws close", err); }
      wsRef.current = null;
    };
  }, [isRunning, symbol, timeframe, selectedStrategies.join("|"), strategyMap]);

  const handleIncomingCandle = (candle, states, sym, runId) => {
    if (runIdRef.current !== runId) return;
    setLastPrice({ price: candle.close, time: candle.time });
    const candles = candlesRef.current.slice();
    const last = candles[candles.length - 1];
    if (!last || candle.time > last.time) {
      candles.push(candle);
    } else if (candle.time === last.time) {
      candles[candles.length - 1] = candle;
    } else {
      return;
    }
    candlesRef.current = candles.slice(-MAX_HISTORY);

    Object.entries(states).forEach(([name, bundle]) => {
      const { descriptor, state } = bundle;
      try {
        const signal = descriptor.onCandle(candlesRef.current, state);
        if (!signal) return;
        if (bundle.lastSignalBar === candle.time) return;
        bundle.lastSignalBar = candle.time;
        triggerTrade(sym, signal, candle.close, name);
      } catch (err) {
        console.error("strategy error", name, err);
      }
    });
  };

  const triggerTrade = async (sym, signal, price, strategyName) => {
    const pip = pipSizeFor(sym, price);
    const sl = slPips > 0 ? (signal.side === "buy" ? price - slPips * pip : price + slPips * pip) : null;
    const tp = tpPips > 0 ? (signal.side === "buy" ? price + tpPips * pip : price - tpPips * pip) : null;

    const req = {
      symbol: sym,
      side: signal.side,
      volume: Number(volume) || DEFAULT_VOLUME,
      sl,
      tp,
      comment: `auto:${strategyName}`,
      deviation: 20,
      magic: 9001,
    };

    playSound(signal.side);
    const entryId = `${strategyName}-${Date.now()}`;
    const entry = {
      id: entryId,
      ts: Date.now(),
      strategy: strategyName,
      side: signal.side,
      price,
      reason: signal.reason,
      status: "pending",
    };
    setLog((prev) => [entry, ...prev].slice(0, LOG_LIMIT));

    try {
      const res = await placeMarketOrder(req);
      const ret = res?.result?.retcode;
      const fillPrice = res?.result?.price;
      const messageParts = [];
      if (typeof ret !== "undefined") messageParts.push(`retcode ${ret}`);
      if (fillPrice) messageParts.push(`price ${formatPrice(sym, fillPrice)}`);
      const successMessage = messageParts.join(" · ") || "sent";
      setLog((prev) =>
        prev
          .map((item) =>
            item.id === entryId
              ? { ...item, status: "sent", message: successMessage }
              : item,
          )
          .slice(0, LOG_LIMIT),
      );
    } catch (err) {
      setLog((prev) =>
        prev
          .map((item) =>
            item.id === entryId
              ? { ...item, status: "error", message: err?.message ?? "Order failed" }
              : item,
          )
          .slice(0, LOG_LIMIT),
      );
    }
  };

  const playSound = (side) => {
    const player = side === "buy" ? audioRef.current.buy : audioRef.current.sell;
    if (!player) return;
    try {
      player.currentTime = 0;
      player.play().catch(() => {});
    } catch (err) {
      console.warn("audio play", err);
    }
  };

  const toggleStrategy = (name) => {
    setSelectedStrategies((prev) => {
      if (prev.includes(name)) {
        return prev.filter((n) => n !== name);
      }
      return [...prev, name];
    });
  };

  const startDisabled = selectedStrategies.length === 0 || isRunning || !symbol;

  return (
    <section className="card" style={{ padding: 16, minHeight: 260 }}>
      <div className="h" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="h" style={{ gap: 8 }}>
          <b>Auto Trader</b>
          <span className="badge">{status}</span>
          {lastPrice && (
            <span className="badge">{symbol} @ {formatPrice(symbol, lastPrice.price)}</span>
          )}
        </div>
        <div className="h" style={{ gap: 8 }}>
          <button
            className="btn"
            disabled={startDisabled}
            onClick={() => {
              setStatus("starting");
              setIsRunning(true);
            }}
          >
            Start
          </button>
          <button
            className="btn"
            disabled={!isRunning}
            onClick={() => {
              setIsRunning(false);
              setStatus("idle");
            }}
          >
            Stop
          </button>
        </div>
      </div>

      {error && <div style={{ color: "var(--bad)", marginBottom: 12 }}>{error}</div>}

      <div className="row" style={{ marginBottom: 12 }}>
        <div style={{ gridColumn: "span 4" }}>
          <label className="label" htmlFor="auto-symbol">Symbol</label>
          <select
            id="auto-symbol"
            className="sel"
            value={symbol}
            onChange={(e) => onSymbolChange(e.target.value)}
          >
            {symbols.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} {s.description ? `— ${s.description}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label className="label" htmlFor="auto-tf">Timeframe</label>
          <select
            id="auto-tf"
            className="sel"
            value={timeframe}
            onChange={(e) => onTimeframeChange(e.target.value)}
          >
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label className="label" htmlFor="auto-volume">Volume (lots)</label>
          <input
            id="auto-volume"
            className="inp"
            type="number"
            min="0"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label className="label" htmlFor="auto-sl">SL (pips)</label>
          <input
            id="auto-sl"
            className="inp"
            type="number"
            min="0"
            step="1"
            value={slPips}
            onChange={(e) => setSlPips(Number(e.target.value))}
          />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <label className="label" htmlFor="auto-tp">TP (pips)</label>
          <input
            id="auto-tp"
            className="inp"
            type="number"
            min="0"
            step="1"
            value={tpPips}
            onChange={(e) => setTpPips(Number(e.target.value))}
          />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 8 }}>Strategies</div>
        <div className="h" style={{ flexWrap: "wrap", gap: 12 }}>
          {STRATEGIES.map((strat) => (
            <label key={strat.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={selectedStrategies.includes(strat.name)}
                onChange={() => toggleStrategy(strat.name)}
              />
              <span>
                <b>{strat.label}</b>
                <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{strat.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="label">Recent signals</div>
        {log.length === 0 && <div style={{ color: "var(--muted)" }}>No trades yet.</div>}
        {log.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 140, overflowY: "auto" }}>
            {log.map((entry) => (
              <li key={entry.id ?? entry.ts} style={{ padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="h" style={{ justifyContent: "space-between" }}>
                  <span>
                    {formatTime(entry.ts)} · <b>{entry.strategy}</b> · {entry.side.toUpperCase()} @ {formatPrice(symbol, entry.price)}
                  </span>
                  <span
                    style={{
                      color:
                        entry.status === "error"
                          ? "var(--bad)"
                          : entry.status === "pending"
                          ? "var(--muted)"
                          : "var(--ok)",
                    }}
                  >
                    {entry.status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{entry.reason}</div>
                {entry.message && <div style={{ fontSize: 12, color: "var(--muted)" }}>{entry.message}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
