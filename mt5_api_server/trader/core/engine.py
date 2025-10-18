import asyncio, time
from typing import Dict, Callable, Optional, Tuple

from loguru import logger

from .broker_paper import PaperBroker
from .risk import RiskManager
from .signal_logger import SignalLogger
from .types import Order, Side
from .selection import StrategySelectionStore

class Engine:
    def __init__(
        self,
        feed_live,
        feed_hist,
        strategies: Dict[str, Callable],
        risk: RiskManager,
        sizer,
        *,
        broker=None,
        signal_logger: Optional[SignalLogger] = None,
        selection_store: Optional[StrategySelectionStore] = None,
    ):
        self.feed_live = feed_live
        self.feed_hist = feed_hist
        self.strategies = strategies
        self.risk = risk
        self.sizer = sizer
        self.broker = broker or PaperBroker()
        self.signal_logger = signal_logger
        self.selection_store = selection_store
        self._open_trades: Dict[Tuple[str, str], Dict] = {}

    async def run_symbol(self, symbol:str, timeframe:str):
        # warmup history for each strategy
        import pandas as pd
        hist=self.feed_hist.candles(symbol, timeframe, limit=2000)
        df=pd.DataFrame([{"ts":c.ts,"o":c.o,"h":c.h,"l":c.l,"c":c.c,"v":c.v} for c in hist])
        states={name: strat.init(df.copy()) for name, strat in self.strategies.items()}

        async for candle in self.feed_live.stream(symbol, timeframe):
            df.loc[len(df)]={"ts":candle.ts,"o":candle.o,"h":candle.h,"l":candle.l,"c":candle.c,"v":candle.v}
            price=candle.c
            self.broker.on_mark(symbol, price)

            for name, strat in self.strategies.items():
                if self.selection_store and not self.selection_store.is_enabled(name):
                    continue

                trade_key = (symbol, name)
                active = self._open_trades.get(trade_key)
                if active:
                    hit_sl = (active["side"] == Side.BUY and candle.l <= active["sl"]) or (
                        active["side"] == Side.SELL and candle.h >= active["sl"]
                    )
                    hit_tp = (active["side"] == Side.BUY and candle.h >= active["tp"]) or (
                        active["side"] == Side.SELL and candle.l <= active["tp"]
                    )
                    if hit_sl or hit_tp:
                        exit_price = active["sl"] if hit_sl else active["tp"]
                        outcome = "stop_loss" if hit_sl else "take_profit"
                        if self.signal_logger:
                            self.signal_logger.resolve_signal(active["signal_id"], exit_price=exit_price, outcome=outcome)
                        self._open_trades.pop(trade_key, None)
                        active = None
                    else:
                        continue

                sig = strat.on_candle(df, states[name])
                if sig and sig.side!=Side.FLAT:
                    sl,tp,pivot = self.risk.stop_target(df, sig.side, price, sig.extras.get("atr"))
                    qty = self.sizer.qty(self.broker.equity, price, sl)
                    if qty<=0:
                        logger.info(f"{symbol} {name}: qty=0 — skip");
                        continue
                    side = sig.side
                    order=Order(symbol=symbol, side=side, qty=qty, sl=sl, tp=tp)
                    res=self.broker.place(order, mkt_price=price)
                    logger.info(
                        f"{symbol} {time.strftime('%H:%M:%S')} {name} {side} qty={qty} price={price:.5f} sl={sl:.5f} tp={tp:.5f} -> {res}"
                    )
                    if res.get("accepted"):
                        sig_id = None
                        if self.signal_logger:
                            sig_id = self.signal_logger.record_signal(
                                symbol=symbol,
                                timeframe=timeframe,
                                strategy=name,
                                side=sig.side.value,
                                reason=sig.reason,
                                entry_price=price,
                                stop_loss=sl,
                                take_profit=tp,
                                pivot=pivot,
                                qty=qty,
                            )
                        self._open_trades[trade_key] = {
                            "signal_id": sig_id,
                            "side": sig.side,
                            "sl": sl,
                            "tp": tp,
                        }
