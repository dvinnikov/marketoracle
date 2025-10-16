from dataclasses import dataclass
from enum import Enum
from typing import Optional, Dict

class Side(str, Enum):
    BUY="BUY"; SELL="SELL"; FLAT="FLAT"

@dataclass
class Candle:
    ts:int; o:float; h:float; l:float; c:float; v:int

@dataclass
class Signal:
    side: Side
    reason: str
    extras: Dict[str, float]

@dataclass
class Order:
    symbol:str
    side:Side
    qty:float
    price_type:str="MKT"  # MKT/LMT
    limit_price:Optional[float]=None
    sl:Optional[float]=None
    tp:Optional[float]=None
