import asyncio, time
from loguru import logger
from typing import Dict, Callable
from .types import Side, Order
from .broker_paper import PaperBroker

class Engine:
    def __init__(self, feed_live, feed_hist, strategies:Dict[str, Callable], risk, sizer, broker=None):
        self.feed_live=feed_live; self.feed_hist=feed_hist
        self.strategies=strategies; self.risk=risk; self.sizer=sizer
        self.broker = broker or PaperBroker()

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
                sig = strat.on_candle(df, states[name])
                if sig and sig.side!=Side.FLAT:
                    sl,tp = self.risk.stop_target(sig.side, price, sig.extras.get("atr"))
                    qty = self.sizer.qty(self.broker.equity, price, sl)
                    if qty<=0: 
                        logger.info(f"{symbol} {name}: qty=0 — skip"); 
                        continue
                    side = sig.side
                    order=Order(symbol=symbol, side=side, qty=qty, sl=sl, tp=tp)
                    res=self.broker.place(order, mkt_price=price)
                    logger.info(f"{symbol} {time.strftime('%H:%M:%S')} {name} {side} qty={qty} price={price:.5f} sl={sl:.5f} tp={tp:.5f} -> {res}")
