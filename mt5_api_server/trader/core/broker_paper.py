from dataclasses import dataclass
from typing import Dict, Optional
from .types import Order, Side

@dataclass
class Position:
    qty:float=0.0
    avg:float=0.0

class PaperBroker:
    def __init__(self, starting_cash:float=10_000.0, fee_bps:float=1.0):
        self.cash=starting_cash; self.pos:Dict[str,Position]={}; self.fee_bps=fee_bps
        self.equity=starting_cash

    def on_mark(self, symbol:str, price:float):
        pos=self.pos.get(symbol); eq=self.cash
        if pos: eq += pos.qty*price
        self.equity=eq

    def place(self, order:Order, mkt_price:float)->Dict:
        fee=abs(order.qty*mkt_price)*self.fee_bps/1e4
        pos=self.pos.get(order.symbol, Position())
        if order.side==Side.BUY:
            cost=order.qty*mkt_price+fee
            if self.cash<cost: return {"accepted":False,"reason":"insufficient_cash"}
            self.cash-=cost
            new_qty=pos.qty+order.qty
            pos.avg = (pos.avg*pos.qty + order.qty*mkt_price)/new_qty if new_qty!=0 else 0
            pos.qty=new_qty
        elif order.side==Side.SELL:
            if pos.qty<order.qty: return {"accepted":False,"reason":"short_not_allowed"}
            proceeds=order.qty*mkt_price-fee
            self.cash+=proceeds
            pos.qty-=order.qty
            if pos.qty==0: pos.avg=0
        self.pos[order.symbol]=pos
        return {"accepted":True,"fill_price":mkt_price,"fee":fee,"cash":self.cash,"pos":pos}
