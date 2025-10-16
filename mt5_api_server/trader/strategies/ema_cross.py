import pandas as pd
from dataclasses import dataclass
from trader.core.types import Signal, Side

@dataclass
class State:
    last_side: Side = Side.FLAT

class EMACross:
    def __init__(self, fast=21, slow=55):
        self.fast=fast; self.slow=slow
    def init(self, df:pd.DataFrame)->State:
        return State()
    def on_candle(self, df:pd.DataFrame, state:State):
        if len(df)<self.slow+2: return None
        ema_fast=df['c'].ewm(span=self.fast, adjust=False).mean()
        ema_slow=df['c'].ewm(span=self.slow, adjust=False).mean()
        cross_up = ema_fast.iloc[-2] < ema_slow.iloc[-2] and ema_fast.iloc[-1] > ema_slow.iloc[-1]
        cross_dn = ema_fast.iloc[-2] > ema_slow.iloc[-2] and ema_fast.iloc[-1] < ema_slow.iloc[-1]
        if cross_up and state.last_side!=Side.BUY:
            state.last_side=Side.BUY
            return Signal(side=Side.BUY, reason="EMA cross up", extras={})
        if cross_dn and state.last_side!=Side.SELL:
            state.last_side=Side.SELL
            return Signal(side=Side.SELL, reason="EMA cross down", extras={})
        return None
