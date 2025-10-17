import { useEffect, useState } from "react";
import "./styles/index.css";
import TopBar from "./components/TopBar";
import { getHealth, getAccount } from "./lib/api";
import ChartPane from "./features/chart/ChartPane.jsx";


export default function App() {
  const [health, setHealth] = useState(null);
  const [account, setAccount] = useState(null);

  useEffect(()=>{
    (async ()=>{
      try {
        const [h,a] = await Promise.all([getHealth(), getAccount()]);
        setHealth(h);
        setAccount(a);
      } catch(e){ console.error(e); }
    })();
  },[]);

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
      </div>

      <div className="row">
        <div style={{gridColumn:"span 12"}}>
          <ChartPane />
        </div>
      </div>
    </div>
  );
}
