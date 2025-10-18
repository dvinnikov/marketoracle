"""Utility helpers for working with swing pivots.

The trading engine frequently needs to locate the nearest pivot low/high in
order to anchor protective stops.  The helpers in this module operate on the
rolling history DataFrame that the engine maintains for each symbol.

The implementation intentionally keeps the heuristics simple and
deterministic:

* A pivot low is defined as a bar whose low is the minimum within
  ``pivot_left`` candles to the left and ``pivot_right`` candles to the right.
* A pivot high is defined analogously using the bar highs.

The helpers return ``None`` when there is not enough history or when no pivot
matching the criteria can be located.  Callers are expected to fall back to a
different stop sizing technique in that scenario (e.g. ATR based).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import pandas as pd


@dataclass
class PivotConfig:
    """Parameters that describe how strict pivot detection should be."""

    pivot_left: int = 3
    pivot_right: int = 3
    max_lookback: int = 120


def _is_pivot(series: pd.Series, idx: int, left: int, right: int, *, use_high: bool) -> bool:
    """Return True if ``series[idx]`` forms a pivot high/low."""

    start = max(idx - left, 0)
    stop = min(idx + right + 1, len(series))
    window = series.iloc[start:stop]
    if window.empty or len(window) < left + right + 1:
        return False

    value = series.iloc[idx]
    if use_high:
        return value >= window.max()
    return value <= window.min()


def nearest_pivot_low(df: pd.DataFrame, cfg: PivotConfig | None = None) -> Optional[float]:
    """Locate the nearest confirmed pivot low and return its price.

    The function scans backwards from the penultimate bar (``-2``) to avoid
    using the forming candle as a pivot candidate.  ``None`` is returned if
    no pivot can be located inside ``cfg.max_lookback`` bars.
    """

    if df.empty or len(df) < 5:
        return None

    cfg = cfg or PivotConfig()
    lows = df["l"].reset_index(drop=True)
    last = len(lows) - 2  # skip current forming candle
    start = max(last - cfg.max_lookback, 1)

    for idx in range(last, start - 1, -1):
        if _is_pivot(lows, idx, cfg.pivot_left, cfg.pivot_right, use_high=False):
            return float(lows.iloc[idx])
    return None


def nearest_pivot_high(df: pd.DataFrame, cfg: PivotConfig | None = None) -> Optional[float]:
    """Locate the nearest confirmed pivot high and return its price."""

    if df.empty or len(df) < 5:
        return None

    cfg = cfg or PivotConfig()
    highs = df["h"].reset_index(drop=True)
    last = len(highs) - 2
    start = max(last - cfg.max_lookback, 1)

    for idx in range(last, start - 1, -1):
        if _is_pivot(highs, idx, cfg.pivot_left, cfg.pivot_right, use_high=True):
            return float(highs.iloc[idx])
    return None


def nearest_pivot(df: pd.DataFrame, side: str, cfg: PivotConfig | None = None) -> Optional[float]:
    """Convenience wrapper that returns a low for buys and high for sells."""

    from trader.core.types import Side  # local import to avoid cycle

    if side == Side.BUY:
        return nearest_pivot_low(df, cfg)
    if side == Side.SELL:
        return nearest_pivot_high(df, cfg)
    return None

