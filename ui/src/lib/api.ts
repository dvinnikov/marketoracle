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

export type StrategyDefinition = {
  name: string;
  params: Record<string, unknown>;
  enabled: boolean;
};

export type StrategyCatalogResponse = { strategies: StrategyDefinition[] };

export const getStrategyCatalog = (): Promise<StrategyCatalogResponse> => request("/strategy/catalog");

export const getStrategySelection = (): Promise<{ strategies: string[] }> => request("/strategy/selection");

export const updateStrategySelection = (strategies: string[]): Promise<{ ok: boolean; strategies: string[] }> =>
  request("/strategy/selection", {
    method: "POST",
    body: JSON.stringify({ strategies }),
  });

export type StrategySignal = {
  id: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  side: string;
  reason: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  pivot?: number | null;
  qty: number;
  opened_at: number;
  status: string;
  closed_at?: number | null;
  exit_price?: number | null;
  outcome?: string | null;
  pnl?: number | null;
};

export const getStrategySignals = (
  limit = 200,
  status?: "open" | "closed"
): Promise<{ signals: StrategySignal[] }> => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set("status", status);
  return request(`/strategy/signals?${params.toString()}`);
};

export type StrategyLevel = {
  id: string;
  symbol: string;
  strategy: string;
  side: string;
  entry: number;
  stop: number;
  target: number;
  pivot?: number | null;
};

export const getStrategyLevels = (symbol?: string): Promise<{ levels: StrategyLevel[]; generated_at?: number }> => {
  const params = symbol ? `?symbol=${encodeURIComponent(symbol)}` : "";
  return request(`/strategy/levels${params}`);
};

