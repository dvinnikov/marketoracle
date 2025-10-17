export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StrategySignal = {
  side: "buy" | "sell";
  reason: string;
};

export type StrategyDescriptor<S = any> = {
  name: string;
  label: string;
  description: string;
  init: (candles: Candle[]) => S;
  onCandle: (candles: Candle[], state: S) => StrategySignal | null;
};

const emaSeries = (values: number[], period: number): number[] => {
  const out: number[] = [];
  let acc = values[0] ?? 0;
  const alpha = 2 / (period + 1);
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (i === 0) {
      acc = v;
    } else {
      acc = alpha * v + (1 - alpha) * acc;
    }
    out.push(acc);
  }
  return out;
};

const lastN = <T,>(arr: T[], n: number): T[] => arr.slice(Math.max(arr.length - n, 0));

const mean = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
};

const stddev = (values: number[]): number => {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / values.length;
  return Math.sqrt(variance);
};

export const STRATEGIES: StrategyDescriptor[] = [
  {
    name: "ema_cross",
    label: "EMA Cross",
    description: "Signals when a fast EMA crosses above or below a slower EMA.",
    init: () => ({ lastSide: "flat" as "flat" | "buy" | "sell" }),
    onCandle: (candles, state: { lastSide: "flat" | "buy" | "sell" }) => {
      if (candles.length < 57) return null; // ensure enough bars
      const closes = candles.map((c) => c.close);
      const fast = emaSeries(closes, 21);
      const slow = emaSeries(closes, 55);
      const len = fast.length;
      if (len < 2 || slow.length < 2) return null;
      const crossUp = fast[len - 2] < slow[len - 2] && fast[len - 1] > slow[len - 1];
      const crossDown = fast[len - 2] > slow[len - 2] && fast[len - 1] < slow[len - 1];
      if (crossUp && state.lastSide !== "buy") {
        state.lastSide = "buy";
        return { side: "buy", reason: "EMA fast crossed above slow" };
      }
      if (crossDown && state.lastSide !== "sell") {
        state.lastSide = "sell";
        return { side: "sell", reason: "EMA fast crossed below slow" };
      }
      return null;
    },
  },
  {
    name: "oco_breakout",
    label: "OCO Breakout",
    description: "Breakout of the recent high/low range triggers entries.",
    init: () => ({}),
    onCandle: (candles) => {
      const lookback = 30;
      if (candles.length < lookback + 1) return null;
      const recent = lastN(candles, lookback);
      const hi = Math.max(...recent.map((c) => c.high));
      const lo = Math.min(...recent.map((c) => c.low));
      const last = candles[candles.length - 1];
      if (last.close > hi) {
        return { side: "buy", reason: `Breakout above ${hi.toFixed(5)}` };
      }
      if (last.close < lo) {
        return { side: "sell", reason: `Breakout below ${lo.toFixed(5)}` };
      }
      return null;
    },
  },
  {
    name: "range_fade",
    label: "Range Fade",
    description: "Fade moves that extend beyond a Z-score threshold.",
    init: () => ({}),
    onCandle: (candles) => {
      const lookback = 50;
      if (candles.length < lookback + 5) return null;
      const closes = lastN(candles, lookback).map((c) => c.close);
      const m = mean(closes);
      const sd = stddev(closes) || 1e-9;
      const last = candles[candles.length - 1];
      const z = (last.close - m) / sd;
      if (z > 1.5) {
        return { side: "sell", reason: `Z-score ${z.toFixed(2)}` };
      }
      if (z < -1.5) {
        return { side: "buy", reason: `Z-score ${z.toFixed(2)}` };
      }
      return null;
    },
  },
];
