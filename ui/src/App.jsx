import { useEffect, useMemo, useState } from "react";
import "./styles/index.css";
import TopBar from "./components/TopBar";
import { getAccount, getHealth, getSymbols } from "./lib/api";
import ChartPane from "./features/chart/ChartPane.jsx";
import AutoTrader from "./features/autotrade/AutoTrader.jsx";
import IndicatorsCard from "./features/indicators/IndicatorsCard.jsx";
import OrdersPanel from "./features/orders/OrdersPanel.jsx";
import Tables from "./features/tables/Tables.jsx";

const DEFAULT_SYMBOL = "EURUSD";
const DEFAULT_TIMEFRAME = "M1";

export default function App() {
  const [health, setHealth] = useState(null);
  const [account, setAccount] = useState(null);
  const [symbols, setSymbols] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL);
  const [selectedTimeframe, setSelectedTimeframe] = useState(DEFAULT_TIMEFRAME);

  useEffect(() => {
    (async () => {
      try {
        const [h, a] = await Promise.all([getHealth(), getAccount()]);
        setHealth(h);
        setAccount(a);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const resp = await getSymbols(200);
        const list = resp?.symbols ?? [];
        setSymbols(list);
      } catch (e) {
        console.error("symbols", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (!symbols?.length) return;
    const match = symbols.find((s) => s.name === selectedSymbol);
    if (!match) {
      setSelectedSymbol(symbols[0]?.name ?? DEFAULT_SYMBOL);
    }
  }, [symbols, selectedSymbol]);

  const accountFields = useMemo(() => ({
    login: account?.login ?? "—",
    name: account?.name ?? "—",
    server: account?.server ?? "—",
    currency: account?.currency ?? "—",
    balance: account?.balance ?? 0,
    equity: account?.equity ?? 0,
    free_margin: account?.free_margin ?? 0,
    company: account?.company ?? "",
  }), [account]);

  return (
    <div className="app">
      <TopBar health={health} />

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="card" style={{ gridColumn: "span 4" }}>
          <b>Account</b>
          <div className="hr" />
          {account ? (
            <div className="kv">
              <div>Login</div><div>{accountFields.login}</div>
              <div>Name</div><div>{accountFields.name}</div>
              <div>Server</div><div>{accountFields.server}</div>
              <div>Broker</div><div>{accountFields.company || "—"}</div>
              <div>Currency</div><div>{accountFields.currency}</div>
              <div>Balance</div><div>{accountFields.balance.toFixed(2)}</div>
              <div>Equity</div><div>{accountFields.equity.toFixed(2)}</div>
              <div>Free Margin</div><div>{accountFields.free_margin.toFixed(2)}</div>
            </div>
          ) : (
            <div style={{ color: "var(--muted)" }}>Loading…</div>
          )}
        </div>
        <div style={{ gridColumn: "span 8" }}>
          <AutoTrader
            symbols={symbols}
            symbol={selectedSymbol}
            timeframe={selectedTimeframe}
            onSymbolChange={setSelectedSymbol}
            onTimeframeChange={setSelectedTimeframe}
          />
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <div style={{ gridColumn: "span 6" }}>
          <IndicatorsCard symbols={symbols} defaultSymbol={selectedSymbol} defaultTimeframe={selectedTimeframe} />
        </div>
        <div style={{ gridColumn: "span 6" }}>
          <OrdersPanel symbols={symbols} defaultSymbol={selectedSymbol} />
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <div style={{ gridColumn: "span 12" }}>
          <Tables symbols={symbols} />
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <div style={{ gridColumn: "span 12" }}>
          <ChartPane symbol={selectedSymbol} timeframe={selectedTimeframe} />
        </div>
      </div>
    </div>
  );
}
