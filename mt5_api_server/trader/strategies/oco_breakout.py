import pandas as pd
from dataclasses import dataclass
from ..core.types import Signal, Side

@dataclass
class State: pass
class OCOBreakout:
    def __init__(self, lookback=30):
        self.lookback=lookback
    def init(self, df:pd.DataFrame)->State: return State()
    def on_candle(self, df:pd.DataFrame, state:State):
        if len(df)<self.lookback+1: return None
        hi=df['h'].tail(self.lookback).max()
        lo=df['l'].tail(self.lookback).min()
        px=df['c'].iloc[-1]
        if px>hi: return Signal(side=Side.BUY, reason="breakout_up", extras={})
        if px<lo: return Signal(side=Side.SELL, reason="breakout_dn", extras={})
        return None
