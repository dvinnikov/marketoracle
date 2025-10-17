import { useEffect, useMemo, useState } from "react";
import { runIndicators } from "../../lib/api";

const TIMEFRAMES = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"];

export default function IndicatorsCard({ symbols, defaultSymbol, defaultTimeframe = "M30" }) {
  const initialSymbol = useMemo(() => defaultSymbol || symbols?.[0]?.name || "EURUSD", [defaultSymbol, symbols]);
  const [form, setForm] = useState({
    symbol: initialSymbol,
    timeframe: defaultTimeframe,
    rsi_period: 14,
    ema_period: 21,
    macd_fast: 12,
    macd_slow: 26,
    macd_signal: 9,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((prev) => ({ ...prev, symbol: initialSymbol }));
  }, [initialSymbol]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: field.includes("period") ? Number(value) : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        symbol: form.symbol,
        timeframe: form.timeframe,
        rsi_period: Number(form.rsi_period),
        ema_period: Number(form.ema_period),
        macd_fast: Number(form.macd_fast),
        macd_slow: Number(form.macd_slow),
        macd_signal: Number(form.macd_signal),
      };
      const resp = await runIndicators(payload);
      setResult(resp);
    } catch (err) {
      setError(err?.message ?? "Failed to run indicators");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card" style={{ padding: 16 }}>
      <form onSubmit={handleSubmit}>
        <div className="h" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <b>Indicators</b>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Running…" : "Run"}
          </button>
        </div>

        {error && <div style={{ color: "var(--bad)", marginBottom: 8 }}>{error}</div>}

        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ gridColumn: "span 6" }}>
            <label className="label" htmlFor="ind-symbol">Symbol</label>
            <select
              id="ind-symbol"
              className="sel"
              value={form.symbol}
              onChange={handleChange("symbol")}
            >
              {symbols?.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} {s.description ? `— ${s.description}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "span 6" }}>
            <label className="label" htmlFor="ind-tf">Timeframe</label>
            <select id="ind-tf" className="sel" value={form.timeframe} onChange={handleChange("timeframe")}>
              {TIMEFRAMES.map((tf) => (
                <option key={tf} value={tf}>
                  {tf}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ gridColumn: "span 4" }}>
            <label className="label" htmlFor="rsi-period">RSI Period</label>
            <input
              id="rsi-period"
              className="inp"
              type="number"
              min="1"
              value={form.rsi_period}
              onChange={handleChange("rsi_period")}
            />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <label className="label" htmlFor="ema-period">EMA Period</label>
            <input
              id="ema-period"
              className="inp"
              type="number"
              min="1"
              value={form.ema_period}
              onChange={handleChange("ema_period")}
            />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <label className="label" htmlFor="macd-fast">MACD Fast</label>
            <input
              id="macd-fast"
              className="inp"
              type="number"
              min="1"
              value={form.macd_fast}
              onChange={handleChange("macd_fast")}
            />
          </div>
        </div>

        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ gridColumn: "span 6" }}>
            <label className="label" htmlFor="macd-slow">MACD Slow</label>
            <input
              id="macd-slow"
              className="inp"
              type="number"
              min="1"
              value={form.macd_slow}
              onChange={handleChange("macd_slow")}
            />
          </div>
          <div style={{ gridColumn: "span 6" }}>
            <label className="label" htmlFor="macd-signal">MACD Signal</label>
            <input
              id="macd-signal"
              className="inp"
              type="number"
              min="1"
              value={form.macd_signal}
              onChange={handleChange("macd_signal")}
            />
          </div>
        </div>
      </form>

      {result && (
        <div>
          <div className="hr" />
          <div className="kv" style={{ gridTemplateColumns: "auto 1fr" }}>
            <div>Symbol</div>
            <div>{result.symbol}</div>
            <div>Timeframe</div>
            <div>{result.timeframe}</div>
            <div>RSI</div>
            <div>{result.rsi.toFixed(2)}</div>
            <div>EMA</div>
            <div>{result.ema.toFixed(5)}</div>
            <div>MACD</div>
            <div>{result.macd.toFixed(5)}</div>
            <div>Signal</div>
            <div>{result.macd_signal.toFixed(5)}</div>
          </div>
        </div>
      )}
    </section>
  );
}
