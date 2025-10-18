# server.py
from __future__ import annotations
from datetime import datetime, timezone, timedelta
import time
from fastapi import WebSocket, WebSocketDisconnect
import asyncio
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import time
from typing import Any, Dict, List, Optional, Literal

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import MetaTrader5 as mt5
import yaml

from trader.core.selection import StrategySelectionStore


# -------------------------
# FastAPI setup
# -------------------------
app = FastAPI(title="MT5 Realtime API", version="1.0")

# Allow everything in dev; tighten for prod if needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # set to ["http://localhost:5173"] for stricter dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------
# Shared file locations
# -------------------------
BASE_DIR = Path(__file__).resolve().parent
TRADER_DIR = BASE_DIR / "trader"
LOG_DIR = TRADER_DIR / "logs"
SIGNAL_STATE_PATH = LOG_DIR / "signals_state.json"
LEVELS_PATH = LOG_DIR / "levels.json"
SELECTION_PATH = LOG_DIR / "strategy_selection.json"
CONFIG_PATH = TRADER_DIR / "config.yaml"

LOG_DIR.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _load_trader_config() -> Dict[str, Any]:
    if CONFIG_PATH.exists():
        try:
            return yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8")) or {}
        except Exception:
            return {}
    return {}


def _load_selection() -> List[str]:
    data = _read_json(SELECTION_PATH)
    return [str(x) for x in data.get("strategies", [])]


# -------------------------
# MT5 startup / shutdown
# -------------------------
def _mt5_init_once() -> None:
    """Initialize MT5 terminal if not already connected."""
    if mt5.initialize():
        return
    # Try without path; fall back to env var META_TRADER5_PATH if provided
    path = os.environ.get("META_TRADER5_PATH")
    if path:
        if not mt5.initialize(path):
            raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")
    else:
        # If still not initialized, raise a clear error
        raise RuntimeError(f"MT5 initialize failed: {mt5.last_error()}")


@app.on_event("startup")
def _on_startup():
    _mt5_init_once()


@app.on_event("shutdown")
def _on_shutdown():
    try:
        mt5.shutdown()
    except Exception:
        pass


# -------------------------
# Helpers (robust over numpy.void vs. attribute rows)
# -------------------------
def _rate_field(rate_row, name: str):
    """
    Read a field from a MT5 rate row regardless of whether it is a tuple-like
    object with attributes (r.time) or a numpy.void structured row (r['time']).
    """
    try:
        v = getattr(rate_row, name)
    except Exception:
        v = rate_row[name]  # numpy structured row
    try:
        return v.item()  # convert numpy scalar if present
    except Exception:
        return v


def _rate_to_dict(rate_row) -> Dict[str, Any]:
    """Normalize a single rate row to a plain python dict."""
    # Prefer real_volume if available, else tick_volume
    try:
        vol = _rate_field(rate_row, "real_volume")
    except Exception:
        vol = _rate_field(rate_row, "tick_volume")
    return {
        "time": int(_rate_field(rate_row, "time")),
        "open": float(_rate_field(rate_row, "open")),
        "high": float(_rate_field(rate_row, "high")),
        "low": float(_rate_field(rate_row, "low")),
        "close": float(_rate_field(rate_row, "close")),
        "volume": int(vol),
    }


def _safe_float(x, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _safe_int(x, default: int = 0) -> int:
    try:
        return int(x)
    except Exception:
        return default


def _account_to_dict(ai) -> Dict[str, Any]:
    if ai is None:
        return {
            "balance": 0.0,
            "equity": 0.0,
            "margin": 0.0,
            "free_margin": 0.0,
            "currency": "",
            "login": None,
            "name": "",
            "server": "",
        }
    return {
        "balance": _safe_float(getattr(ai, "balance", 0.0)),
        "equity": _safe_float(getattr(ai, "equity", 0.0)),
        "margin": _safe_float(getattr(ai, "margin", 0.0)),
        "free_margin": _safe_float(getattr(ai, "margin_free", 0.0)),
        "currency": getattr(ai, "currency", ""),
        "login": getattr(ai, "login", None),
        "name": getattr(ai, "name", ""),
        "server": getattr(ai, "server", ""),
        "company": getattr(ai, "company", ""),
    }


def _position_to_dict(p) -> Dict[str, Any]:
    return {
        "ticket": _safe_int(getattr(p, "ticket", 0)),
        "symbol": getattr(p, "symbol", ""),
        "type": _safe_int(getattr(p, "type", 0)),
        "volume": _safe_float(getattr(p, "volume", 0.0)),
        "price_open": _safe_float(getattr(p, "price_open", 0.0)),
        "sl": _safe_float(getattr(p, "sl", 0.0)),
        "tp": _safe_float(getattr(p, "tp", 0.0)),
        "profit": _safe_float(getattr(p, "profit", 0.0)),
        "time": _safe_int(getattr(p, "time", 0)),
        "comment": getattr(p, "comment", ""),
        "magic": _safe_int(getattr(p, "magic", 0)),
    }


def _order_to_dict(o) -> Dict[str, Any]:
    return {
        "ticket": _safe_int(getattr(o, "ticket", 0)),
        "symbol": getattr(o, "symbol", ""),
        "type": _safe_int(getattr(o, "type", 0)),
        "type_time": _safe_int(getattr(o, "type_time", 0)),
        "type_filling": _safe_int(getattr(o, "type_filling", 0)),
        "volume_current": _safe_float(getattr(o, "volume_current", 0.0)),
        "price_open": _safe_float(getattr(o, "price_open", 0.0)),
        "sl": _safe_float(getattr(o, "sl", 0.0)),
        "tp": _safe_float(getattr(o, "tp", 0.0)),
        "time_setup": _safe_int(getattr(o, "time_setup", 0)),
        "comment": getattr(o, "comment", ""),
        "magic": _safe_int(getattr(o, "magic", 0)),
    }


# timeframe mapping
TF_MAP: Dict[str, int] = {
    "M1": mt5.TIMEFRAME_M1,
    "M5": mt5.TIMEFRAME_M5,
    "M15": mt5.TIMEFRAME_M15,
    "M30": mt5.TIMEFRAME_M30,
    "H1": mt5.TIMEFRAME_H1,
    "H4": mt5.TIMEFRAME_H4,
    "D1": mt5.TIMEFRAME_D1,
    "W1": mt5.TIMEFRAME_W1,
    "MN1": mt5.TIMEFRAME_MN1,
}


# -------------------------
# Pydantic models
# -------------------------
Side = Literal["buy", "sell"]


class MarketOrderReq(BaseModel):
    symbol: str = Field(..., examples=["EURUSD"])
    side: Side  # lower-case only
    volume: float = Field(..., gt=0)
    sl: Optional[float] = None
    tp: Optional[float] = None
    deviation: int = Field(20, ge=0, le=100)
    comment: str = "API"
    magic: int = 0
    # Optional requested filling; if not provided we will auto-try FOK -> IOC -> RETURN
    filling: Optional[int] = None


class StrategySelectionRequest(BaseModel):
    strategies: List[str]


class IndicatorReq(BaseModel):
    symbol: str
    timeframe: str = "M30"
    rsi_period: int = 14
    ema_period: int = 21
    macd_fast: int = 12
    macd_slow: int = 26
    macd_signal: int = 9


# -------------------------
# Public API
# -------------------------
@app.get("/health")
def health():
    return {"ok": True, "mt5_connected": bool(mt5.terminal_info())}


@app.get("/account")
def account():
    _mt5_init_once()
    ai = mt5.account_info()
    if ai is None:
        raise HTTPException(500, f"account_info failed: {mt5.last_error()}")
    return _account_to_dict(ai)


@app.get("/symbols")
def symbols(limit: int = 200):
    """Return a list of tradeable symbols (name + description)."""
    res = []
    all_syms = mt5.symbols_get()
    if not all_syms:
        return {"symbols": res}

    for s in all_syms:
        res.append({
            "name": getattr(s, "name", ""),
            "path": getattr(s, "path", ""),
            "description": getattr(s, "description", getattr(s, "name", "")),
        })
        if len(res) >= limit:
            break
    return {"symbols": res}


@app.get("/positions")
def positions():
    pos = mt5.positions_get()
    if pos is None:
        return {"positions": []}
    return {"positions": [_position_to_dict(p) for p in pos]}


@app.get("/orders")
def orders():
    ords = mt5.orders_get()
    if ords is None:
        return {"orders": []}
    return {"orders": [_order_to_dict(o) for o in ords]}


@app.get("/candles/{symbol}")
def candles(symbol: str, timeframe: str = Query("M1"), limit: int = Query(1000, ge=1, le=10000)):
    tf = TF_MAP.get(timeframe.upper())
    if tf is None:
        raise HTTPException(422, "Unsupported timeframe")
    if not mt5.symbol_select(symbol, True):
        raise HTTPException(400, f"Cannot select symbol {symbol}")

    rates = mt5.copy_rates_from_pos(symbol, tf, 0, limit)
    if rates is None or len(rates) == 0:
        raise HTTPException(500, "copy_rates_from_pos failed or returned empty")

    out = [_rate_to_dict(r) for r in rates]
    out.sort(key=lambda x: x["time"])  # ensure ascending
    return {"symbol": symbol, "timeframe": timeframe, "candles": out}


@app.get("/strategy/catalog")
def strategy_catalog():
    cfg = _load_trader_config()
    selection = set(_load_selection())
    fallback_enabled = not selection
    strategies = []
    for name, params in (cfg.get("strategies") or {}).items():
        strategies.append({
            "name": name,
            "params": params,
            "enabled": fallback_enabled or name in selection,
        })
    return {"strategies": strategies}


@app.get("/strategy/selection")
def get_strategy_selection():
    return {"strategies": _load_selection()}


@app.post("/strategy/selection")
def set_strategy_selection(req: StrategySelectionRequest):
    store = StrategySelectionStore(SELECTION_PATH)
    store.set(req.strategies)
    return {"ok": True, "strategies": store.all()}


@app.get("/strategy/signals")
def get_strategy_signals(limit: int = 200, status: Optional[str] = None):
    data = _read_json(SIGNAL_STATE_PATH).get("signals", [])
    if status:
        data = [d for d in data if d.get("status") == status]
    return {"signals": data[-limit:]}


@app.get("/strategy/levels")
def get_strategy_levels(symbol: Optional[str] = None):
    payload = _read_json(LEVELS_PATH)
    levels = payload.get("levels", [])
    if symbol:
        levels = [lvl for lvl in levels if lvl.get("symbol") == symbol]
    return {"levels": levels, "generated_at": payload.get("generated_at")}


@app.post("/indicators/run")
def run_indicators(req: IndicatorReq):
    tf = TF_MAP.get(req.timeframe.upper(), mt5.TIMEFRAME_M30)
    if not mt5.symbol_select(req.symbol, True):
        raise HTTPException(400, f"Cannot select {req.symbol}")

    # Query the last N bars so indicators have data
    bars = max(100, req.rsi_period + req.ema_period + req.macd_slow + 5)
    rates = mt5.copy_rates_from_pos(req.symbol, tf, 0, bars)
    if rates is None or len(rates) == 0:
        raise HTTPException(500, "No rates for indicators")

    closes = [float(_rate_field(r, "close")) for r in rates]

    # Simple indicator calcs (pure python) to avoid handle issues:
    def ema(arr: List[float], period: int) -> float:
        if period <= 1:
            return arr[-1]
        alpha = 2.0 / (period + 1.0)
        v = arr[0]
        for x in arr[1:]:
            v = alpha * x + (1 - alpha) * v
        return v

    def sma(arr: List[float], period: int) -> float:
        return sum(arr[-period:]) / period

    # RSI (classic Wilder)
    def rsi(arr: List[float], period: int) -> float:
        gains, losses = 0.0, 0.0
        for i in range(-period, -1):
            diff = arr[i + 1] - arr[i]
            if diff >= 0:
                gains += diff
            else:
                losses -= diff
        if period > 0:
            gains /= period
            losses /= period
        rs = gains / (losses if losses != 0 else 1e-12)
        return 100.0 - (100.0 / (1.0 + rs))

    # MACD(EMA fast - EMA slow), signal is EMA(signal)
    macd_val = ema(closes, req.macd_fast) - ema(closes, req.macd_slow)
    macd_signal = ema([ema(closes[:i], req.macd_fast) - ema(closes[:i], req.macd_slow)
                       for i in range(1, len(closes) + 1)], req.macd_signal)

    return {
        "symbol": req.symbol,
        "timeframe": req.timeframe,
        "rsi": round(rsi(closes, req.rsi_period), 6),
        "ema": round(ema(closes, req.ema_period), 6),
        "macd": round(macd_val, 6),
        "macd_signal": round(macd_signal, 6),
    }


# -------------------------
# Order send utilities
# -------------------------
def _tick_price(symbol: str, side: Side) -> float:
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        raise HTTPException(400, f"No tick for {symbol}")
    return float(tick.ask if side == "buy" else tick.bid)


def _build_market_request(
    symbol: str,
    side: Side,
    volume: float,
    price: float,
    deviation: int,
    sl: Optional[float],
    tp: Optional[float],
    comment: str,
    magic: int,
    filling: int,
) -> Dict[str, Any]:
    return {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol,
        "type": mt5.ORDER_TYPE_BUY if side == "buy" else mt5.ORDER_TYPE_SELL,
        "volume": float(volume),
        "price": float(price),
        "sl": float(sl) if sl else 0.0,
        "tp": float(tp) if tp else 0.0,
        "deviation": int(deviation),
        "type_filling": int(filling),
        "type_time": mt5.ORDER_TIME_GTC,
        "comment": comment,
        "magic": int(magic),
    }


def _result_to_dict(res) -> Dict[str, Any]:
    if res is None:
        return {"retcode": -1, "comment": "order_send returned None"}
    d = {
        "retcode": _safe_int(getattr(res, "retcode", 0)),
        "comment": getattr(res, "comment", ""),
        "order": _safe_int(getattr(res, "order", 0)),
        "deal": _safe_int(getattr(res, "deal", 0)),
        "price": _safe_float(getattr(res, "price", 0.0)),
        "request": None,
    }
    # res.request is a TradeRequest object (not dict-like)
    try:
        r = getattr(res, "request", None)
        if r is not None:
            d["request"] = {
                "symbol": getattr(r, "symbol", ""),
                "type": _safe_int(getattr(r, "type", 0)),
                "volume": _safe_float(getattr(r, "volume", 0.0)),
                "price": _safe_float(getattr(r, "price", 0.0)),
                "sl": _safe_float(getattr(r, "sl", 0.0)),
                "tp": _safe_float(getattr(r, "tp", 0.0)),
                "type_filling": _safe_int(getattr(r, "type_filling", 0)),
            }
    except Exception:
        pass
    return d


def order_send_with_fallback(req: MarketOrderReq) -> Dict[str, Any]:
    """Try sending order with requested filling, else try sensible fallbacks."""
    price = _tick_price(req.symbol, req.side)

    # If caller specified a filling, try only that
    candidates: List[int]
    if req.filling is not None:
        candidates = [int(req.filling)]
    else:
        # Common broker requirement order:
        candidates = [mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_RETURN]

    last_result = None
    for fill in candidates:
        request = _build_market_request(
            symbol=req.symbol,
            side=req.side,
            volume=req.volume,
            price=price,
            deviation=req.deviation,
            sl=req.sl,
            tp=req.tp,
            comment=req.comment,
            magic=req.magic,
            filling=fill,
        )
        result = mt5.order_send(request)
        last_result = _result_to_dict(result)
        # 10030 -> unsupported filling mode, try next
        if last_result["retcode"] != 10030:
            break

    return last_result


@app.post("/orders/market")
def place_market(req: MarketOrderReq):
    if not mt5.symbol_select(req.symbol, True):
        raise HTTPException(400, f"Cannot select symbol {req.symbol}")

    # Ensure side is lower-case 'buy' | 'sell'
    side = req.side
    if side not in ("buy", "sell"):
        raise HTTPException(422, "side must be 'buy' or 'sell'")

    res = order_send_with_fallback(req)
    if res["retcode"] != mt5.TRADE_RETCODE_DONE:
        # Return 400 with broker message for the UI to show
        raise HTTPException(400, detail={"message": f"MT5 error {res['retcode']}: {res['comment']}", "result": res})
    return {"ok": True, "result": res}


# -------------------------
# WebSocket streaming
# -------------------------
class Hub:
    def __init__(self):
        self.clients: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.clients.add(ws)

    def disconnect(self, ws: WebSocket):
        try:
            self.clients.discard(ws)
        except Exception:
            pass

    async def send_all(self, text: str):
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


hub = Hub()


@app.websocket("/stream/candles")
async def stream_candles(ws: WebSocket, symbol: str, timeframe: str = "M1", throttle_ms: int = 20):
    await ws.accept()

    TF_SECONDS = {
        "M1": 60, "M5": 300, "M15": 900, "M30": 1800,
        "H1": 3600, "H4": 14400, "D1": 86400, "W1": 604800, "MN1": 2592000,
    }
    step = TF_SECONDS.get(timeframe.upper(), 60)
    tf = TF_MAP.get(timeframe.upper(), mt5.TIMEFRAME_M1)

    if not mt5.symbol_select(symbol, True):
        await ws.send_text(json.dumps({"type": "error", "message": f"Cannot select {symbol}"}))
        return

    # Seed current bar from MT5
    rates = mt5.copy_rates_from_pos(symbol, tf, 0, 1)
    if not rates or len(rates) == 0:
        await ws.send_text(json.dumps({"type": "error", "message": "No rates"}))
        return

    seed = _rate_to_dict(rates[0])
    cur_bar = {
        "time": int(seed["time"]),              # bar open, seconds
        "open": float(seed["open"]),
        "high": float(seed["high"]),
        "low":  float(seed["low"]),
        "close": float(seed["close"]),
    }
    last_sent_close = cur_bar["close"]

    # ---- Millisecond cursor (DON'T use seconds) ----
    # start slightly in the past so we don't miss first ticks
    last_msc = int(time.time() * 1000) - 1500

    def price_from_tick(t):
        # prefer trade last; else mid of bid/ask
        try:
            last = float(getattr(t, "last", 0.0))
            if last > 0:
                return last
        except Exception:
            pass
        bid = float(getattr(t, "bid", 0.0) or 0.0)
        ask = float(getattr(t, "ask", 0.0) or 0.0)
        if bid > 0 and ask > 0:
            return (bid + ask) / 2.0
        return ask or bid or cur_bar["close"]

    try:
        while True:
            # Build datetime from milliseconds; subtract 1 ms to include boundary tick
            start_dt = datetime.fromtimestamp(max(last_msc - 1, 0) / 1000.0, tz=timezone.utc)
            ticks = mt5.copy_ticks_from(symbol, start_dt, 4096, mt5.COPY_TICKS_ALL)

            if ticks is not None and len(ticks) > 0:
                for t in ticks:
                    # read both second and millisecond fields safely
                    sec = int(_rate_field(t, "time"))
                    msc = int(_rate_field(t, "time_msc"))  # ms since epoch
                    if msc <= last_msc:
                        continue
                    last_msc = msc

                    px = price_from_tick(t)
                    bar_start = (sec // step) * step

                    # roll to a new bar if needed
                    if bar_start > cur_bar["time"]:
                        prev_close = cur_bar["close"]
                        cur_bar = {
                            "time": bar_start,
                            "open": prev_close,
                            "high": prev_close,
                            "low":  prev_close,
                            "close": prev_close,
                        }

                    # update OHLC on EVERY tick
                    if px > cur_bar["high"]:
                        cur_bar["high"] = px
                    if px < cur_bar["low"]:
                        cur_bar["low"] = px
                    cur_bar["close"] = px

                    # emit every change (or remove this check to emit every tick unconditionally)
                    if cur_bar["close"] != last_sent_close:
                        last_sent_close = cur_bar["close"]
                        await ws.send_text(json.dumps({
                            "type": "tick",
                            "symbol": symbol,
                            "timeframe": timeframe,
                            "bar": cur_bar
                        }))

            await asyncio.sleep(throttle_ms / 1000.0)

    except WebSocketDisconnect:
        pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass