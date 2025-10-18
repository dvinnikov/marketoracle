from __future__ import annotations

from typing import Optional

import pandas as pd

from .pivots import PivotConfig, nearest_pivot
from .types import Side

class RiskManager:
    def __init__(self, max_risk_pct=1.0, max_pos_pct=50.0):
        self.max_risk_pct=max_risk_pct
        self.max_pos_pct=max_pos_pct

    def stop_target(
        self,
        df: pd.DataFrame,
        side: Side,
        entry: float,
        atr: Optional[float] = None,
        rr: float = 2.0,
        pivot_cfg: Optional[PivotConfig] = None,
    ):
        pivot = nearest_pivot(df, side, pivot_cfg)
        if pivot is not None:
            buffer = atr or entry * 0.0015
            if side == Side.BUY:
                sl = min(entry - 1e-9, pivot - buffer)
                tp = entry + rr * abs(entry - sl)
            else:
                sl = max(entry + 1e-9, pivot + buffer)
                tp = entry - rr * abs(entry - sl)
            return sl, tp, pivot

        if atr is None:
            atr = entry * 0.002  # ~0.2% fallback
        if side == Side.BUY:
            sl = entry - atr
            tp = entry + rr * atr
        else:
            sl = entry + atr
            tp = entry - rr * atr
        return sl, tp, None
