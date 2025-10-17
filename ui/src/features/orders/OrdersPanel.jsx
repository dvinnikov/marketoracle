import { useEffect, useMemo, useState } from "react";
import { placeMarketOrder } from "../../lib/api";

export default function OrdersPanel({ symbols, defaultSymbol }) {
  const initialSymbol = useMemo(() => defaultSymbol || symbols?.[0]?.name || "EURUSD", [defaultSymbol, symbols]);
  const [form, setForm] = useState({
    symbol: initialSymbol,
    side: "buy",
    volume: 0.1,
    sl: "",
    tp: "",
    deviation: 20,
    comment: "dashboard",
    magic: 9001,
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm((prev) => ({ ...prev, symbol: initialSymbol }));
  }, [initialSymbol]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      const payload = {
        symbol: form.symbol,
        side: form.side,
        volume: Number(form.volume),
        sl: form.sl ? Number(form.sl) : null,
        tp: form.tp ? Number(form.tp) : null,
        deviation: Number(form.deviation) || 20,
        comment: form.comment,
        magic: Number(form.magic) || 0,
      };
      const resp = await placeMarketOrder(payload);
      setMessage(`Order ${resp?.result?.order ?? resp?.result?.deal ?? ""} sent (retcode ${resp?.result?.retcode})`);
    } catch (err) {
      setError(err?.message ?? "Order failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card" style={{ padding: 16 }}>
      <form onSubmit={handleSubmit}>
        <div className="h" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <b>Place Market Order</b>
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>

        {error && <div style={{ color: "var(--bad)", marginBottom: 8 }}>{error}</div>}
        {message && <div style={{ color: "var(--ok)", marginBottom: 8 }}>{message}</div>}

        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ gridColumn: "span 4" }}>
            <label className="label" htmlFor="order-symbol">Symbol</label>
            <select id="order-symbol" className="sel" value={form.symbol} onChange={handleChange("symbol")}>
              {symbols?.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} {s.description ? `— ${s.description}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="order-side">Side</label>
            <select id="order-side" className="sel" value={form.side} onChange={handleChange("side")}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="order-volume">Volume</label>
            <input
              id="order-volume"
              className="inp"
              type="number"
              min="0"
              step="0.01"
              value={form.volume}
              onChange={handleChange("volume")}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="order-sl">Stop Loss</label>
            <input
              id="order-sl"
              className="inp"
              type="number"
              step="0.0001"
              value={form.sl}
              onChange={handleChange("sl")}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="order-tp">Take Profit</label>
            <input
              id="order-tp"
              className="inp"
              type="number"
              step="0.0001"
              value={form.tp}
              onChange={handleChange("tp")}
            />
          </div>
        </div>

        <div className="row">
          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="order-deviation">Deviation</label>
            <input
              id="order-deviation"
              className="inp"
              type="number"
              min="0"
              step="1"
              value={form.deviation}
              onChange={handleChange("deviation")}
            />
          </div>
          <div style={{ gridColumn: "span 4" }}>
            <label className="label" htmlFor="order-comment">Comment</label>
            <input
              id="order-comment"
              className="inp"
              value={form.comment}
              onChange={handleChange("comment")}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <label className="label" htmlFor="order-magic">Magic</label>
            <input
              id="order-magic"
              className="inp"
              type="number"
              step="1"
              value={form.magic}
              onChange={handleChange("magic")}
            />
          </div>
        </div>
      </form>
    </section>
  );
}
