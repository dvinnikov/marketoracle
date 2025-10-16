# trader/core/sizing.py
class FixedFractionSizer:
    def __init__(self, risk_per_trade_pct=0.5):
        self.risk = risk_per_trade_pct
    def qty(self, equity: float, entry: float, sl: float) -> float:
        risk_amt = equity * (self.risk / 100.0)
        per_unit = abs(entry - sl)
        if per_unit <= 0:
            return 0.0
        q = risk_amt / per_unit
        return max(0.0, round(q, 2))  # adjust rounding for your instrument
