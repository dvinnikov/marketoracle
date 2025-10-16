# -*- coding: utf-8 -*-
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Dict, Tuple

import numpy as np
import pandas as pd
import requests
import yaml
from loguru import logger

def load_cfg() -> dict:
    here = Path(__file__).resolve().parent
    for p in (Path.cwd() / "config.yaml", here / "config.yaml"):
        if p.exists():
            return yaml.safe_load(p.read_text(encoding="utf-8"))
    return {
        "server": {"base_http": "http://localhost:8000"},
        "symbols": ["EURUSD"],
        "timeframe": "M1",
        "risk": {"max_risk_pct": 1.0, "risk_per_trade_pct": 0.5, "fee_bps": 1.0},
        "strategies": {"ema_cross": {"fast": 21, "slow": 55}},
    }

def _direct_session() -> requests.Session:
    s = requests.Session()
    s.trust_env = False
    s.proxies = {"http": None, "https": None}
    s.headers.update({"User-Agent": "mt5-backtester/1.0"})
    return s

class HistoryFeed:
    def __init__(self, base_http: str):
        self.base = base_http.rstrip("/")
        self.s = _direct_session()
    def candles(self, symbol: str, timeframe: str, limit: int = 10000) -> pd.DataFrame:
        safe_limit = min(int(limit), 5000)
        url = f"{self.base}/candles/{symbol}?timeframe={timeframe}&limit={safe_limit}"
        r = self.s.get(url, timeout=60); r.raise_for_status()
        arr = r.json()
        if not arr: raise RuntimeError(f"No candles returned for {symbol} {timeframe}")
        df = pd.DataFrame(arr)
        if "time" in df.columns:
            if isinstance(df.loc[0, "time"], str):
                df["ts"] = pd.to_datetime(df["time"], utc=True).astype("int64") // 10**9
            else:
                t0 = int(df.loc[0, "time"])
                df["ts"] = (df["time"] // 1000).astype(int) if t0 > 10**12 else df["time"].astype(int)
        cols = {"open":"o","high":"h","low":"l","close":"c","tick_volume":"v","real_volume":"v"}
        for src, dst in cols.items():
            if src in df.columns: df[dst] = df[src]
        return df[["ts","o","h","l","c","v"]].dropna().sort_values("ts").reset_index(drop=True)

class Side: BUY="BUY"; SELL="SELL"; FLAT="FLAT"
@dataclass
class Signal: side:str; reason:str; extras:Dict[str,float]

class RiskManager:
    def __init__(self, max_risk_pct: float = 1.0): self.max_risk_pct=max_risk_pct
    @staticmethod
    def atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
        hi, lo, close = df["h"], df["l"], df["c"]; prev_close=close.shift(1)
        tr = pd.concat([(hi-lo),(hi-prev_close).abs(),(lo-prev_close).abs()], axis=1).max(axis=1)
        return tr.ewm(alpha=1.0/period, adjust=False).mean()
    def stop_target(self, side:str, entry:float, atr_val:Optional[float], rr:float=2.0)->Tuple[float,float]:
        span = atr_val if (atr_val and atr_val>0) else entry*0.002
        return (entry-span, entry+rr*span) if side==Side.BUY else (entry+span, entry-rr*span)

class FixedFractionSizer:
    def __init__(self, risk_per_trade_pct: float = 0.5): self.risk=float(risk_per_trade_pct)
    def qty(self, equity: float, entry: float, sl: float) -> float:
        risk_amt=equity*(self.risk/100.0); per_unit=abs(entry-sl)
        if per_unit<=0: return 0.0
        return max(0.0, round(risk_amt/per_unit, 2))

@dataclass
class EMAState: last_side:str=Side.FLAT
class EMACross:
    def __init__(self, fast:int=21, slow:int=55): self.fast=fast; self.slow=slow
    def init(self, df:pd.DataFrame)->EMAState: return EMAState()
    def on_bar(self, df:pd.DataFrame, state:EMAState)->Optional[Signal]:
        if len(df)<self.slow+2: return None
        ef=df["c"].ewm(span=self.fast, adjust=False).mean()
        es=df["c"].ewm(span=self.slow, adjust=False).mean()
        up = ef.iloc[-2]<es.iloc[-2] and ef.iloc[-1]>es.iloc[-1]
        dn = ef.iloc[-2]>es.iloc[-2] and ef.iloc[-1]<es.iloc[-1]
        if up and state.last_side!=Side.BUY: state.last_side=Side.BUY; return Signal(Side.BUY,"ema_cross_up",{})
        if dn and state.last_side!=Side.SELL: state.last_side=Side.SELL; return Signal(Side.SELL,"ema_cross_dn",{})
        return None

@dataclass
class RFState: ...
class RangeFade:
    def __init__(self, lookback:int=60, z:float=1.8): self.lookback=lookback; self.z=z
    def init(self, df:pd.DataFrame)->RFState: return RFState()
    def on_bar(self, df:pd.DataFrame, state:RFState)->Optional[Signal]:
        if len(df)<self.lookback+5: return None
        s=df["c"].tail(self.lookback); mean=float(s.mean()); std=float(s.std(ddof=0) or 1e-9); px=float(df["c"].iloc[-1]); z=(px-mean)/std
        if z>self.z:  return Signal(Side.SELL, f"fade_hi z={z:.2f}", {})
        if z<-self.z: return Signal(Side.BUY,  f"fade_lo z={z:.2f}", {})
        return None

# ----------------------- Richard Dennis / Turtle (System 2) -------------------
@dataclass
class TurtleState:
    last_side: str = Side.FLAT

class TurtleDennis:
    """
    System 2 flavor:
      - Entry: breakout of N_entry channel (default 55)
      - Reverse/Exit: breakout of N_entry the other way (or use N_exit=20 if you want a faster reversal)
      - Stop: ATR(atr_period) * atr_mult (default 2.0)
    Note: This simple version *reverses* on the opposite breakout (classic Turtle S2 behavior).
          Pyramiding is omitted for clarity (easy to add later).
    """
    def __init__(self,
                 entry_channel:int = 55,
                 exit_channel:int = 20,     # used for info; we reverse on opposite entry by default
                 atr_period:int = 20,
                 atr_mult:float = 2.0):
        self.n_entry = entry_channel
        self.n_exit  = exit_channel
        self.atr_p   = atr_period
        self.k       = float(atr_mult)

    def init(self, df: pd.DataFrame) -> TurtleState:
        return TurtleState()

    def on_bar(self, df: pd.DataFrame, state: TurtleState) -> Optional[Signal]:
        if len(df) < max(self.n_entry, self.atr_p) + 2:
            return None

        # Donchian channels (exclude current bar)
        hi_entry = df['h'].iloc[-self.n_entry-1:-1].max()
        lo_entry = df['l'].iloc[-self.n_entry-1:-1].min()

        c = float(df['c'].iloc[-1])

        # ATR for stop sizing
        close = df['c']
        prev_close = close.shift(1)
        tr = pd.concat([(df['h']-df['l']), (df['h']-prev_close).abs(), (df['l']-prev_close).abs()], axis=1).max(axis=1)
        atr = float(tr.ewm(alpha=1.0/self.atr_p, adjust=False).mean().iloc[-1])

        # Long breakout
        if c > hi_entry and state.last_side != Side.BUY:
            state.last_side = Side.BUY
            sl = c - self.k * atr
            return Signal(Side.BUY, f"turtle_entry_up N={self.n_entry}", {"sl": sl, "atr": atr, "atr_mult": self.k})

        # Short breakout
        if c < lo_entry and state.last_side != Side.SELL:
            state.last_side = Side.SELL
            sl = c + self.k * atr
            return Signal(Side.SELL, f"turtle_entry_dn N={self.n_entry}", {"sl": sl, "atr": atr, "atr_mult": self.k})

        return None


@dataclass
class Trade:
    ts_open:int; ts_close:Optional[int]; side:str; entry:float; exit:Optional[float]; qty:float; sl:float; tp:float; reason:str

def run_bt_for_strategy(symbol:str, timeframe:str, df:pd.DataFrame, strat_name:str, strat_obj)->Dict:
    risk=RiskManager(); sizer=FixedFractionSizer(); fee_bps=1.0
    state=strat_obj.init(df.iloc[:0].copy())
    cash=10_000.0; pos_qty=0.0; pos_side=Side.FLAT; entry=sl=tp=0.0
    atr=risk.atr(df,14)
    trades:List[Trade]=[]; equity_curve=[]
    for i in range(len(df)):
        bar=df.iloc[i]; px=float(bar.c)
        mtm = cash + pos_qty*px; equity_curve.append({"ts":int(bar.ts), "equity":mtm})
        if pos_side!=Side.FLAT:
            hit_sl=(pos_side==Side.BUY and bar.l<=sl) or (pos_side==Side.SELL and bar.h>=sl)
            hit_tp=(pos_side==Side.BUY and bar.h>=tp) or (pos_side==Side.SELL and bar.l<=tp)
            if hit_sl or hit_tp:
                exit_price = sl if hit_sl else tp
                cash += pos_qty*exit_price
                trades[-1].ts_close=int(bar.ts); trades[-1].exit=float(exit_price)
                pos_qty=0.0; pos_side=Side.FLAT; entry=sl=tp=0.0
                continue
        sig=strat_obj.on_bar(df.iloc[:i+1], state)
        if not sig or sig.side==Side.FLAT: continue
        if pos_side!=Side.FLAT:
            cash += pos_qty*px
            trades[-1].ts_close=int(bar.ts); trades[-1].exit=px
            pos_qty=0.0; pos_side=Side.FLAT
        sl_val,tp_val = risk.stop_target(sig.side, px, float(atr.iloc[i]) if not np.isnan(atr.iloc[i]) else None)
        qty=sizer.qty(equity=cash, entry=px, sl=sl_val)
        if qty<=0: continue
        fee=abs(qty*px)*fee_bps/1e4; cash -= fee
        pos_qty = qty if sig.side==Side.BUY else -qty
        pos_side = sig.side; entry=px; sl=sl_val; tp=tp_val
        if sig.side==Side.BUY: cash -= qty*px
        else: cash += qty*px
        trades.append(Trade(int(bar.ts), None, sig.side, px, None, qty, sl_val, tp_val, sig.reason))
    if pos_side!=Side.FLAT:
        last_px=float(df["c"].iloc[-1]); cash += pos_qty*last_px
        trades[-1].ts_close=int(df["ts"].iloc[-1]); trades[-1].exit=last_px
    final_equity=cash
    eq=pd.DataFrame(equity_curve).set_index("ts"); eq["ret"]=eq["equity"].pct_change().fillna(0.0)
    max_dd=(eq["equity"].cummax()-eq["equity"]).max()
    sharpe_like=float((eq["ret"].mean()/(eq["ret"].std(ddof=0)+1e-12))*np.sqrt(252*24*60))
    pnl_list=[]; wins=0
    for t in trades:
        if t.exit is None: continue
        direction=1 if t.side==Side.BUY else -1
        pnl=(t.exit - t.entry)*direction*t.qty; pnl_list.append(pnl)
        if pnl>0: wins+=1
    win_rate=(wins/len(pnl_list))*100 if pnl_list else 0.0
    return {
        "symbol":symbol, "timeframe":timeframe, "strategy":strat_name,
        "final_equity":round(float(final_equity),2), "trades":len(pnl_list),
        "win_rate_pct":round(win_rate,2), "max_drawdown":round(float(max_dd or 0.0),2),
        "sharpe_like":round(float(sharpe_like),3),
        "equity_curve":eq.reset_index(),
        "trades_log":pd.DataFrame([t.__dict__ for t in trades]),
    }

def main():
    cfg = load_cfg()
    base_http = cfg["server"]["base_http"]
    timeframe = cfg.get("timeframe", "M1")
    symbols = cfg.get("symbols", ["EURUSD"])

    feed = HistoryFeed(base_http)

    # ---- instantiate strategies (EMA, RangeFade, TurtleDennis) ----
    strategies: Dict[str, object] = {}
    s_cfg = cfg.get("strategies", {})

    if "ema_cross" in s_cfg:
        strategies["ema_cross"] = EMACross(**s_cfg["ema_cross"])
    if "range_fade" in s_cfg:
        strategies["range_fade"] = RangeFade(**s_cfg["range_fade"])
    if "turtle_dennis" in s_cfg:
        strategies["turtle_dennis"] = TurtleDennis(**s_cfg["turtle_dennis"])

    out_dir = Path("backtests")
    out_dir.mkdir(exist_ok=True)

    summary_rows: List[Dict] = []

    for sym in symbols:
        logger.info(f"Fetching {sym} {timeframe} candles…")
        df = feed.candles(sym, timeframe, limit=5000)

        for name, strat in strategies.items():
            logger.info(f"Backtesting {name} on {sym}…")
            res = run_bt_for_strategy(sym, timeframe, df, name, strat)

            # save outputs
            eq_path = out_dir / f"equity_{sym}_{name}.csv"
            tr_path = out_dir / f"trades_{sym}_{name}.csv"
            res["equity_curve"].to_csv(eq_path, index=False)
            res["trades_log"].to_csv(tr_path, index=False)

            summary_rows.append({
                "symbol": sym,
                "strategy": name,
                "final_equity": res["final_equity"],
                "trades": res["trades"],
                "win_rate_pct": res["win_rate_pct"],
                "max_drawdown": res["max_drawdown"],
                "sharpe_like": res["sharpe_like"],
                "equity_csv": str(eq_path),
                "trades_csv": str(tr_path),
            })

    summary = pd.DataFrame(summary_rows)
    (out_dir / "summary.csv").write_text(summary.to_csv(index=False), encoding="utf-8")

    if not summary.empty:
        logger.info("\n" + summary.to_string(index=False))
        logger.info(f"Saved CSVs in {out_dir.resolve()}")
    else:
        logger.warning("No strategies or no results.")


if __name__=="__main__":
    main()
