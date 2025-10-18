import asyncio
from pathlib import Path

import yaml
from loguru import logger

from trader.core.feed import HistoryFeed, LiveFeed
from trader.core.engine import Engine
from trader.core.risk import RiskManager
from trader.core.selection import StrategySelectionStore
from trader.core.signal_logger import SignalLogger
from trader.core.sizing import FixedFractionSizer
from trader.strategies.ema_cross import EMACross
from trader.strategies.oco_breakout import OCOBreakout
from trader.strategies.range_fade import RangeFade
from trader.strategies.turtle_dennis import TurtleDennis


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
    if "oco_breakout" in cfg["strategies"]:
        p=cfg["strategies"]["oco_breakout"]
        strats["oco_breakout"]=OCOBreakout(**p)
    if "turtle_dennis" in cfg["strategies"]:
        p=cfg["strategies"]["turtle_dennis"]
        strats["turtle_dennis"]=TurtleDennis(**p)
    risk=RiskManager(max_risk_pct=cfg["risk"]["max_risk_pct"])
    sizer=FixedFractionSizer(risk_per_trade_pct=cfg["risk"]["risk_per_trade_pct"])
    base_dir = Path(__file__).resolve().parent / "logs"
    signal_logger = SignalLogger(base_dir)
    selection_store = StrategySelectionStore(base_dir / "strategy_selection.json")
    if not selection_store.all():
        selection_store.set(strats.keys())
    return Engine(lf, hf, strats, risk, sizer, signal_logger=signal_logger, selection_store=selection_store)

async def main():
    cfg=yaml.safe_load(open("config.yaml","r",encoding="utf-8"))
    eng=build_engine(cfg)
    tasks=[eng.run_symbol(sym, cfg["timeframe"]) for sym in cfg["symbols"]]
    await asyncio.gather(*tasks)

if __name__=="__main__":
    logger.add("live.log", rotation="10 MB")
    asyncio.run(main())
