const formatTs = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
};

const formatNumber = (value, digits = 5) => {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(digits);
};

export default function SignalLog({ signals = [] }) {
  return (
    <div>
      <div className="h" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <b>Strategy Signals</b>
        <span className="badge">{signals.length} entries</span>
      </div>
      <div className="hr" />
      <div className="table-scroll">
        <table className="signal-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Strategy</th>
              <th>Side</th>
              <th>Entry</th>
              <th>Stop</th>
              <th>Target</th>
              <th>Status</th>
              <th>Result</th>
              <th>PNL</th>
            </tr>
          </thead>
          <tbody>
            {signals.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "var(--muted)" }}>
                  No signals yet
                </td>
              </tr>
            ) : (
              signals.map((sig) => {
                const pnlClass = sig.pnl > 0 ? "pnl-positive" : sig.pnl < 0 ? "pnl-negative" : "";
                return (
                  <tr key={sig.id} className={sig.status === "open" ? "open" : "closed"}>
                    <td>{formatTs(sig.opened_at)}</td>
                    <td>{sig.strategy}</td>
                    <td>{sig.side}</td>
                    <td>{formatNumber(sig.entry_price)}</td>
                    <td>{formatNumber(sig.stop_loss)}</td>
                    <td>{formatNumber(sig.take_profit)}</td>
                    <td>{sig.status}</td>
                    <td>{sig.outcome ?? "—"}</td>
                    <td className={pnlClass}>{sig.pnl || sig.pnl === 0 ? sig.pnl.toFixed(2) : "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
