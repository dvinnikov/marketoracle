import pandas as pd, numpy as np
from dataclasses import dataclass
from trader.core.types import Signal, Side

@dataclass
class State: pass

class RangeFade:
    def __init__(self, lookback=50, z=1.5):
        self.lookback=lookback; self.z=z
    def init(self, df:pd.DataFrame)->State: return State()
    def on_candle(self, df:pd.DataFrame, state:State):
        if len(df)<self.lookback+5: return None
        s=df['c'].tail(self.lookback)
        mean=s.mean(); std=s.std(ddof=0) or 1e-9
        px=df['c'].iloc[-1]
        z=(px-mean)/std
        if z>self.z:  return Signal(side=Side.SELL, reason=f"z={z:.2f}", extras={})
        if z<-self.z: return Signal(side=Side.BUY,  reason=f"z={z:.2f}", extras={})
        return None
