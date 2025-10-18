"""Persistent storage for strategy enable/disable selection.

The trading engine as well as the FastAPI server need a single source of
truth that lists which strategies should currently be active.  The
``StrategySelectionStore`` class encapsulates the tiny JSON file that stores
this information and provides a convenient API for polling/reloading the
selection without keeping the file open.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from threading import RLock
from typing import Iterable, List, Set


@dataclass
class StrategySelectionStore:
    """Manages the set of enabled strategy names."""

    path: Path
    _enabled: Set[str] = field(default_factory=set, init=False)
    _mtime: float = field(default=0.0, init=False)
    _lock: RLock = field(default_factory=RLock, init=False)

    def __post_init__(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists():
            self._load()

    # ------------------------------------------------------------------
    def _load(self) -> None:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            enabled = set(str(x) for x in data.get("strategies", []))
        except Exception:
            enabled = set()
        self._enabled = enabled
        try:
            self._mtime = self.path.stat().st_mtime
        except FileNotFoundError:
            self._mtime = 0.0

    # ------------------------------------------------------------------
    def refresh(self) -> None:
        """Reload the file if it changed on disk."""

        try:
            mtime = self.path.stat().st_mtime
        except FileNotFoundError:
            mtime = 0.0
        if mtime <= self._mtime:
            return
        with self._lock:
            self._load()

    # ------------------------------------------------------------------
    def all(self) -> List[str]:
        with self._lock:
            return sorted(self._enabled)

    # ------------------------------------------------------------------
    def is_enabled(self, name: str) -> bool:
        self.refresh()
        with self._lock:
            return name in self._enabled or not self._enabled

    # ------------------------------------------------------------------
    def set(self, strategies: Iterable[str]) -> None:
        with self._lock:
            self._enabled = set(strategies)
            self.path.write_text(
                json.dumps({"strategies": sorted(self._enabled)}, indent=2),
                encoding="utf-8",
            )
            try:
                self._mtime = self.path.stat().st_mtime
            except FileNotFoundError:
                self._mtime = 0.0

