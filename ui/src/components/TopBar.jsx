import { API_HTTP, API_WS } from "../lib/config";

export default function TopBar({ health }) {
  return (
    <div className="h" style={{ justifyContent: "space-between", marginBottom: 20 }}>
      <div className="h" style={{ gap: 16 }}>
        <div className="title">Trading Dashboard</div>
        <span className="badge">HTTP: {API_HTTP}</span>
        <span className="badge">WS: {API_WS}</span>
        <span className="badge">MT5: {health?.mt5_connected ? "connected" : "—"}</span>
      </div>
      <span className="badge">v0.1 scaffold</span>
    </div>
  );
}
