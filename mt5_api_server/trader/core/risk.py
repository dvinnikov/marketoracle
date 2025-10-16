from typing import Optional
from .types import Side

class RiskManager:
    def __init__(self, max_risk_pct=1.0, max_pos_pct=50.0):
        self.max_risk_pct=max_risk_pct
        self.max_pos_pct=max_pos_pct

    def stop_target(self, side:Side, entry:float, atr:Optional[float]=None, rr:float=2.0):
        if atr is None: atr = entry*0.002  # ~0.2% fallback
        if side==Side.BUY:
            sl=entry-atr; tp=entry+rr*atr
        else:
            sl=entry+atr; tp=entry-rr*atr
        return sl, tp
