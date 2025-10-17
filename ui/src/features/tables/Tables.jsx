import { useEffect, useMemo, useState } from "react";
import { getOrders, getPositions } from "../../lib/api";

const typeLabel = (type) => {
  if (type === 0) return "Buy";
  if (type === 1) return "Sell";
  return String(type);
};

export default function Tables({ symbols }) {
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [posRes, ordRes] = await Promise.all([getPositions(), getOrders()]);
        if (!active) return;
        setPositions(posRes?.positions ?? []);
        setOrders(ordRes?.orders ?? []);
        setLastUpdated(Date.now());
        setError("");
      } catch (err) {
        if (!active) return;
        setError(err?.message ?? "Failed to refresh data");
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const filteredSymbols = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return symbols || [];
    return (symbols || []).filter((s) =>
      s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q),
    );
  }, [symbols, query]);

  return (
    <section className="card" style={{ padding: 16 }}>
      <div className="h" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <div className="h" style={{ gap: 8 }}>
          <b>Account Tables</b>
          {loading && <span className="badge">Loading…</span>}
          {lastUpdated && !loading && (
            <span className="badge">Updated {new Date(lastUpdated).toLocaleTimeString()}</span>
          )}
        </div>
      </div>

      {error && <div style={{ color: "var(--bad)", marginBottom: 12 }}>{error}</div>}

      <div className="label" style={{ marginBottom: 4 }}>Open Positions</div>
      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Volume</th>
              <th>Open</th>
              <th>SL</th>
              <th>TP</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted)", textAlign: "center" }}>
                  No open positions
                </td>
              </tr>
            )}
            {positions.map((p) => (
              <tr key={p.ticket}>
                <td>{p.ticket}</td>
                <td>{p.symbol}</td>
                <td>{typeLabel(p.type)}</td>
                <td>{Number(p.volume).toFixed(2)}</td>
                <td>{Number(p.price_open).toFixed(5)}</td>
                <td>{p.sl ? Number(p.sl).toFixed(5) : "—"}</td>
                <td>{p.tp ? Number(p.tp).toFixed(5) : "—"}</td>
                <td style={{ color: p.profit >= 0 ? "var(--ok)" : "var(--bad)" }}>
                  {Number(p.profit).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="label" style={{ marginBottom: 4 }}>Pending Orders</div>
      <div style={{ overflowX: "auto", marginBottom: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Symbol</th>
              <th>Type</th>
              <th>Volume</th>
              <th>Price</th>
              <th>SL</th>
              <th>TP</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted)", textAlign: "center" }}>
                  No pending orders
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.ticket}>
                <td>{o.ticket}</td>
                <td>{o.symbol}</td>
                <td>{typeLabel(o.type)}</td>
                <td>{Number(o.volume_current).toFixed(2)}</td>
                <td>{Number(o.price_open).toFixed(5)}</td>
                <td>{o.sl ? Number(o.sl).toFixed(5) : "—"}</td>
                <td>{o.tp ? Number(o.tp).toFixed(5) : "—"}</td>
                <td>{o.comment || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="label" style={{ marginBottom: 4 }}>Symbols</div>
      <input
        className="inp"
        placeholder="Search symbols"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ maxHeight: 140, overflowY: "auto", fontSize: 13 }}>
        {filteredSymbols.length === 0 && <div style={{ color: "var(--muted)" }}>No matches</div>}
        {filteredSymbols.map((s) => (
          <div key={s.name} style={{ padding: "2px 0", borderBottom: "1px solid var(--border)" }}>
            <b>{s.name}</b>
            {s.description && <span style={{ color: "var(--muted)", marginLeft: 6 }}>{s.description}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
