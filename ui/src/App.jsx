import { useEffect, useState, useMemo } from "react";
import "./styles/index.css";
import TopBar from "./components/TopBar";
import { getHealth, getAccount, getSymbols, getCandles } from "./lib/api";

export default function App() {
  const [health, setHealth] = useState(null);
  const [account, setAccount] = useState(null);
  const [symbols, setSymbols] = useState([]);
  const [symbol, setSymbol]   = useState("EURUSD");
  const [tf, setTf]           = useState("M1");
  const [probe, setProbe]     = useState(null);
  const [loading, setLoading] = useState(false);
  const tfs = useMemo(()=>["M1","M5","M15","M30","H1","H4","D1"],[]);

  useEffect(()=>{
    (async ()=>{
      try {
        const [h,a,s] = await Promise.all([getHealth(), getAccount(), getSymbols(500)]);
        setHealth(h); setAccount(a); setSymbols(s.symbols||[]);
      } catch(e){ console.error(e); }
    })();
  },[]);

  async function fetchCandles(){
    setLoading(true);
    try {
      const data = await getCandles(symbol, tf, 400);
      const last = data.candles?.at(-1);
      setProbe({ count:data.candles?.length||0, lastClose:last?.close, lastTime:last?.time });
    } catch(e){ alert(e.message); }
    finally{ setLoading(false); }
  }

  return (
    <div className="app">
      <TopBar health={health} />

      <div className="row" style={{marginBottom:16}}>
        <div className="card" style={{gridColumn:"span 4"}}>
          <b>Account</b>
          <div className="hr"/>
          {account ? (
            <div className="kv">
              <div>Login</div><div>{account.login??"—"}</div>
              <div>Name</div><div>{account.name??"—"}</div>
              <div>Server</div><div>{account.server??"—"}</div>
              <div>Currency</div><div>{account.currency??"—"}</div>
              <div>Balance</div><div>{account.balance?.toFixed?.(2)??"0.00"}</div>
              <div>Equity</div><div>{account.equity?.toFixed?.(2)??"0.00"}</div>
              <div>Free Margin</div><div>{account.free_margin?.toFixed?.(2)??"0.00"}</div>
            </div>
          ) : <div style={{color:"var(--muted)"}}>Loading…</div>}
        </div>

        <div className="card" style={{gridColumn:"span 8"}}>
          <b>Quick Candles Probe</b>
          <div className="hr"/>
          <div className="row">
            <div style={{gridColumn:"span 6"}}>
              <label className="label">Symbol</label>
              <select className="sel" value={symbol} onChange={e=>setSymbol(e.target.value)}>
                {symbols.map(s=> <option key={s.name} value={s.name}>{s.name} — {s.description}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"span 3"}}>
              <label className="label">Timeframe</label>
              <select className="sel" value={tf} onChange={e=>setTf(e.target.value)}>
                {tfs.map(x=> <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div style={{gridColumn:"span 3", display:"flex", alignItems:"end"}}>
              <button className="btn" onClick={fetchCandles} disabled={loading}>
                {loading ? "Loading…" : "Fetch 400 bars"}
              </button>
            </div>
          </div>
          {probe && (
            <div style={{marginTop:12, fontSize:14, color:"var(--muted)"}}>
              Bars: <b style={{color:"var(--text)"}}>{probe.count}</b> •
              &nbsp;Last close: <b style={{color:"var(--text)"}}>{probe.lastClose}</b> •
              &nbsp;Last time: <b style={{color:"var(--text)"}}>{probe.lastTime}</b>
            </div>
          )}
        </div>
      </div>

      <div className="row">
        <div className="card" style={{gridColumn:"span 12", color:"var(--muted)"}}>
          Placeholders ready: ChartPane, IndicatorsCard, OrdersPanel, Tables.
        </div>
      </div>
    </div>
  );
}
