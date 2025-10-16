import asyncio, json, requests, websockets
from typing import AsyncIterator, List, Dict
from .types import Candle

class HistoryFeed:
    def __init__(self, base:str): self.base=base.rstrip("/")
    def candles(self, symbol:str, timeframe:str, limit:int=2000)->List[Candle]:
        u=f"{self.base}/candles/{symbol}?timeframe={timeframe}&limit={limit}"
        arr=requests.get(u, timeout=20).json()
        return [Candle(ts=int(pd['time']/1000) if isinstance(pd['time'],int) else
                       int(__import__('datetime').datetime.fromisoformat(pd['time'].replace('Z','+00:00')).timestamp()),
                       o=pd['open'],h=pd['high'],l=pd['low'],c=pd['close'],v=pd.get('tick_volume',0)) for pd in arr]

class LiveFeed:
    def __init__(self, ws_url:str): self.ws_url=ws_url
    async def stream(self, symbol:str, timeframe:str)->AsyncIterator[Candle]:
        url=f"{self.ws_url}/stream/candles?symbol={symbol}&timeframe={timeframe}"
        async with websockets.connect(url, ping_interval=20) as ws:
            # keepalive loop; server sends last-candle on every update
            while True:
                msg=await ws.recv()
                obj=json.loads(msg)
                cd=obj["candle"]
                # ISO → epoch
                ts=int(__import__('datetime').datetime.fromisoformat(cd["time"].replace('Z','+00:00')).timestamp())
                yield Candle(ts, cd["open"], cd["high"], cd["low"], cd["close"], cd.get("tick_volume",0))
