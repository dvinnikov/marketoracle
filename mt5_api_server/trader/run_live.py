import asyncio, yaml
from loguru import logger
from trader.core.feed import HistoryFeed, LiveFeed
from trader.core.engine import Engine
from trader.core.risk import RiskManager
from trader.core.sizing import FixedFractionSizer
from trader.strategies.ema_cross import EMACross
from trader.strategies.range_fade import RangeFade


def build_engine(cfg):
    hf=HistoryFeed(cfg["server"]["base_http"])
    lf=LiveFeed(cfg["server"]["base_ws"])
    # instantiate strategies from cfg
    strats={}
    if "ema_cross" in cfg["strategies"]:
        p=cfg["strategies"]["ema_cross"]
        strats["ema_cross"]=EMACross(**p)
    if "range_fade" in cfg["strategies"]:
        p=cfg["strategies"]["range_fade"]
        strats["range_fade"]=RangeFade(**p)
    risk=RiskManager(max_risk_pct=cfg["risk"]["max_risk_pct"])
    sizer=FixedFractionSizer(risk_per_trade_pct=cfg["risk"]["risk_per_trade_pct"])
    return Engine(lf, hf, strats, risk, sizer)

async def main():
    cfg=yaml.safe_load(open("config.yaml","r",encoding="utf-8"))
    eng=build_engine(cfg)
    tasks=[eng.run_symbol(sym, cfg["timeframe"]) for sym in cfg["symbols"]]
    await asyncio.gather(*tasks)

if __name__=="__main__":
    logger.add("live.log", rotation="10 MB")
    asyncio.run(main())
