const REST_BASE = (import.meta.env.VITE_API_BASE ?? "http://localhost:8000").replace(/\/$/, "");
const WS_BASE = (import.meta.env.VITE_WS_BASE ?? REST_BASE.replace(/^http/, "ws")).replace(/\/$/, "");

const toUrl = (base: string, path: string): string => {
  if (/^https?:\/\//i.test(path) || /^wss?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
};

const restUrl = (path: string): string => toUrl(REST_BASE, path);

export const wsUrl = (path: string): string => toUrl(WS_BASE, path);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(restUrl(path), {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type HealthResponse = { ok: boolean; mt5_connected: boolean };

export const getHealth = (): Promise<HealthResponse> => request<HealthResponse>("/health");

export type AccountResponse = {
  balance: number;
  equity: number;
  margin: number;
  free_margin: number;
  currency: string;
  login: number | null;
  name: string;
  server: string;
  company?: string;
};

export const getAccount = (): Promise<AccountResponse> => request<AccountResponse>("/account");

type SymbolsResponse = {
  symbols: { name: string; path?: string; description?: string }[];
};

export const getSymbols = (limit = 200): Promise<SymbolsResponse> => request(`/symbols?limit=${limit}`);

type CandlesResponse = {
  symbol: string;
  timeframe: string;
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
};

export const getCandles = (symbol: string, timeframe: string, limit = 1000): Promise<CandlesResponse> =>
  request(`/candles/${encodeURIComponent(symbol)}?timeframe=${encodeURIComponent(timeframe)}&limit=${limit}`);

export type Position = {
  ticket: number;
  symbol: string;
  type: number;
  volume: number;
  price_open: number;
  sl: number;
  tp: number;
  profit: number;
  time: number;
  comment?: string;
  magic?: number;
};

type PositionsResponse = { positions: Position[] };

export const getPositions = (): Promise<PositionsResponse> => request<PositionsResponse>("/positions");

export type Order = {
  ticket: number;
  symbol: string;
  type: number;
  type_time: number;
  type_filling: number;
  volume_current: number;
  price_open: number;
  sl: number;
  tp: number;
  time_setup: number;
  comment?: string;
  magic?: number;
};

type OrdersResponse = { orders: Order[] };

export const getOrders = (): Promise<OrdersResponse> => request<OrdersResponse>("/orders");

export type IndicatorRequest = {
  symbol: string;
  timeframe?: string;
  rsi_period?: number;
  ema_period?: number;
  macd_fast?: number;
  macd_slow?: number;
  macd_signal?: number;
};

export type IndicatorResponse = {
  symbol: string;
  timeframe: string;
  rsi: number;
  ema: number;
  macd: number;
  macd_signal: number;
};

export const runIndicators = (payload: IndicatorRequest): Promise<IndicatorResponse> =>
  request<IndicatorResponse>("/indicators/run", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export type MarketOrderRequest = {
  symbol: string;
  side: "buy" | "sell";
  volume: number;
  sl?: number | null;
  tp?: number | null;
  deviation?: number;
  comment?: string;
  magic?: number;
  filling?: number | null;
};

export type MarketOrderResponse = {
  ok: boolean;
  result: {
    retcode: number;
    comment: string;
    order: number;
    deal: number;
    price: number;
    request?: Record<string, unknown> | null;
  };
};

export const placeMarketOrder = (payload: MarketOrderRequest): Promise<MarketOrderResponse> =>
  request<MarketOrderResponse>("/orders/market", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const openCandleStream = (symbol: string, timeframe: string): WebSocket => {
  const url = wsUrl(
    `/stream/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
  );
  return new WebSocket(url);
};

