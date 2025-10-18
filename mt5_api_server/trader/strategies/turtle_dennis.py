import pandas as pd
from dataclasses import dataclass
from trader.core.types import Signal, Side


@dataclass
class State:
    last_side: Side = Side.FLAT


class TurtleDennis:
    def __init__(self, entry_channel: int = 55, exit_channel: int = 20, atr_period: int = 20, atr_mult: float = 2.0):
        self.entry_channel = entry_channel
        self.exit_channel = exit_channel
        self.atr_period = atr_period
        self.atr_mult = atr_mult

    def init(self, df: pd.DataFrame) -> State:
        return State()

    def on_candle(self, df: pd.DataFrame, state: State):
        if len(df) < max(self.entry_channel, self.atr_period) + 2:
            return None

        hi_entry = df["h"].iloc[-self.entry_channel - 1 : -1].max()
        lo_entry = df["l"].iloc[-self.entry_channel - 1 : -1].min()
        close = df["c"].iloc[-1]

        tr = pd.concat(
            [
                (df["h"] - df["l"]),
                (df["h"] - df["c"].shift(1)).abs(),
                (df["l"] - df["c"].shift(1)).abs(),
            ],
            axis=1,
        ).max(axis=1)
        atr = tr.ewm(alpha=1.0 / self.atr_period, adjust=False).mean().iloc[-1]

        if close > hi_entry and state.last_side != Side.BUY:
            state.last_side = Side.BUY
            return Signal(side=Side.BUY, reason=f"breakout_up N={self.entry_channel}", extras={"atr": float(atr)})

        if close < lo_entry and state.last_side != Side.SELL:
            state.last_side = Side.SELL
            return Signal(side=Side.SELL, reason=f"breakout_dn N={self.entry_channel}", extras={"atr": float(atr)})

        return None
