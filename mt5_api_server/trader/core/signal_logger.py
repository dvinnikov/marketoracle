"""Structured logging for strategy signals and trade lifecycle events."""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Optional


@dataclass
class SignalRecord:
    id: str
    symbol: str
    timeframe: str
    strategy: str
    side: str
    reason: str
    entry_price: float
    stop_loss: float
    take_profit: float
    pivot: Optional[float]
    qty: float
    opened_at: float
    status: str = "open"
    closed_at: Optional[float] = None
    exit_price: Optional[float] = None
    outcome: Optional[str] = None
    pnl: Optional[float] = None


class SignalLogger:
    """Append-only JSONL log with a mirrored state file for easy querying."""

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.log_path = self.base_dir / "signals.jsonl"
        self.state_path = self.base_dir / "signals_state.json"
        self.levels_path = self.base_dir / "levels.json"
        self.state: Dict[str, SignalRecord] = {}

        if self.state_path.exists():
            try:
                raw = json.loads(self.state_path.read_text(encoding="utf-8"))
                for item in raw.get("signals", []):
                    rec = SignalRecord(**item)
                    self.state[rec.id] = rec
            except Exception:
                self.state = {}

        self._write_levels()

    # ------------------------------------------------------------------
    def _append(self, payload: Dict) -> None:
        with self.log_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload) + "\n")

    # ------------------------------------------------------------------
    def _write_state(self) -> None:
        data = {"signals": [asdict(rec) for rec in sorted(self.state.values(), key=lambda r: r.opened_at)]}
        self.state_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        self._write_levels()

    # ------------------------------------------------------------------
    def _write_levels(self) -> None:
        active = [
            {
                "id": rec.id,
                "symbol": rec.symbol,
                "strategy": rec.strategy,
                "side": rec.side,
                "entry": rec.entry_price,
                "stop": rec.stop_loss,
                "target": rec.take_profit,
                "pivot": rec.pivot,
            }
            for rec in self.state.values()
            if rec.status == "open"
        ]
        payload = {"levels": active, "generated_at": time.time()}
        self.levels_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------
    def record_signal(
        self,
        *,
        symbol: str,
        timeframe: str,
        strategy: str,
        side: str,
        reason: str,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        pivot: Optional[float],
        qty: float,
    ) -> str:
        sig_id = uuid.uuid4().hex
        rec = SignalRecord(
            id=sig_id,
            symbol=symbol,
            timeframe=timeframe,
            strategy=strategy,
            side=side,
            reason=reason,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            pivot=pivot,
            qty=qty,
            opened_at=time.time(),
        )
        self.state[sig_id] = rec
        self._append({"event": "signal", **asdict(rec)})
        self._write_state()
        return sig_id

    # ------------------------------------------------------------------
    def resolve_signal(self, sig_id: str, *, exit_price: float, outcome: str) -> None:
        rec = self.state.get(sig_id)
        if not rec:
            return
        rec.status = "closed"
        rec.closed_at = time.time()
        rec.exit_price = exit_price
        rec.outcome = outcome
        delta = exit_price - rec.entry_price
        rec.pnl = delta * rec.qty if rec.side == "BUY" else -delta * rec.qty
        self._append({"event": "result", **asdict(rec)})
        self._write_state()

