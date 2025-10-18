import { useEffect, useState, useRef } from "react";
import "./styles/index.css";
import TopBar from "./components/TopBar";
import {
  getHealth,
  getAccount,
  getStrategyCatalog,
  getStrategyLevels,
  getStrategySignals,
  getStrategySelection,
  updateStrategySelection,
} from "./lib/api";
import ChartPane from "./features/chart/ChartPane.jsx";
import StrategySelector from "./features/strategies/StrategySelector.jsx";
import SignalLog from "./features/strategies/SignalLog.jsx";


export default function App() {
  const [health, setHealth] = useState(null);
  const [account, setAccount] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategies, setSelectedStrategies] = useState([]);
  const [signals, setSignals] = useState([]);
  const [levels, setLevels] = useState([]);
  const seenSignalsRef = useRef(new Set());
  const audioRef = useRef(null);

  const symbol = "EURUSD";
  const timeframe = "M1";

  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = audioRef.current ?? new AudioCtx();
      audioRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (err) {
      console.warn("Audio error", err);
    }
  };

  useEffect(()=>{
    (async ()=>{
      try {
        const [h,a] = await Promise.all([getHealth(), getAccount()]);
        setHealth(h);
        setAccount(a);
      } catch(e){ console.error(e); }
    })();
  },[]);

  useEffect(() => {
    (async () => {
      try {
        const [catalog, selection] = await Promise.all([
          getStrategyCatalog(),
          getStrategySelection(),
        ]);
        const enabled = (selection.strategies?.length ? selection.strategies : catalog.strategies.filter((s) => s.enabled).map((s) => s.name));
        setStrategies(catalog.strategies);
        setSelectedStrategies(enabled);
      } catch (err) {
        console.error("Failed to load strategies", err);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchSignals = async () => {
      try {
        const resp = await getStrategySignals(200);
        if (cancelled) return;
        setSignals(resp.signals.slice().sort((a, b) => b.opened_at - a.opened_at));
        resp.signals.forEach((sig) => {
          if (sig.status === "open" && !seenSignalsRef.current.has(sig.id)) {
            seenSignalsRef.current.add(sig.id);
            playBeep();
          }
        });
      } catch (err) {
        console.error("Failed to fetch signals", err);
      }
    };
    fetchSignals();
    const t = setInterval(fetchSignals, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLevels = async () => {
      try {
        const resp = await getStrategyLevels(symbol);
        if (cancelled) return;
        setLevels(resp.levels || []);
      } catch (err) {
        console.error("Failed to fetch levels", err);
      }
    };
    loadLevels();
    const t = setInterval(loadLevels, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [symbol]);

  const handleSelectionChange = async (names) => {
    setSelectedStrategies(names);
    try {
      await updateStrategySelection(names);
      const catalog = await getStrategyCatalog();
      setStrategies(catalog.strategies);
      const respLevels = await getStrategyLevels(symbol);
      setLevels(respLevels.levels || []);
    } catch (err) {
      console.error("Failed to update selection", err);
    }
  };

  const visibleLevels = selectedStrategies.length
    ? levels.filter((lvl) => selectedStrategies.includes(lvl.strategy))
    : levels;

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
        <div className="card" style={{gridColumn:"span 4"}}>
          <StrategySelector
            strategies={strategies}
            selected={selectedStrategies}
            onChange={handleSelectionChange}
          />
        </div>
        <div style={{gridColumn:"span 8"}}>
          <ChartPane symbol={symbol} timeframe={timeframe} levels={visibleLevels} />
        </div>
      </div>

      <div className="row" style={{marginTop:16}}>
        <div className="card" style={{gridColumn:"span 12"}}>
          <SignalLog signals={signals} />
        </div>
      </div>
    </div>
  );
}
