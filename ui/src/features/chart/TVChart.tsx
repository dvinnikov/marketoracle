// src/features/chart/TVChart.tsx
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { wsUrl, getCandles } from "../../lib/api";
import type { StrategyLevel } from "../../lib/api";

declare global {
  interface Window { TradingView?: any }
}

type Props = {
  symbol?: string;
  timeframe?: string; // your server style e.g. "M1","M5","H1","D1"
  height?: number;
  levels?: StrategyLevel[];
};

// --- Resolution mapping (TV <-> server) ------------------------------
const TV_RESOLUTIONS = [
  "1","5","15","30","60","240","1D","1W","1M",
] as const;

const tvToServerTF = (r: string): string => {
  switch (r) {
    case "1": return "M1";
    case "5": return "M5";
    case "15": return "M15";
    case "30": return "M30";
    case "60": return "H1";
    case "240": return "H4";
    case "1D": return "D1";
    case "1W": return "W1";
    case "1M": return "MN1";
    default: return "M1";
  }
};

const serverTFToTv = (tf?: string): string => {
  const x = (tf || "M1").toUpperCase();
  switch (x) {
    case "M1": return "1";
    case "M5": return "5";
    case "M15": return "15";
    case "M30": return "30";
    case "H1": return "60";
    case "H4": return "240";
    case "D1": return "1D";
    case "W1": return "1W";
    case "MN1": return "1M";
    default: return "1";
  }
};

// --- Script loader ----------------------------------------------------
const ensureTvScript = async (): Promise<void> => {
  if (window.TradingView) return;
  const existing = document.getElementById("tradingview-script") as HTMLScriptElement | null;
  if (existing && (window as any).TradingView) return;
  if (existing) {
    await new Promise<void>((res) => existing.addEventListener("load", () => res(), { once: true }));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.id = "tradingview-script";
    s.src = "https://s3.tradingview.com/tv.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load TradingView tv.js"));
    document.head.appendChild(s);
  });
};

export default function TVChart({ symbol = "EURUSD", timeframe = "M1", height = 520, levels = [] }: Props) {
  const containerId = "tvchart-container";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<any>(null);
  const subRef = useRef<{ ws?: WebSocket; uid?: string } | null>(null);
  const levelLinesRef = useRef<any[]>([]);

  const tvSymbol = useMemo(() => String(symbol), [symbol]);
  const initialInterval = useMemo(() => serverTFToTv(timeframe), [timeframe]);

  useLayoutEffect(() => {
    let cancelled = false;

    const init = async () => {
      await ensureTvScript();
      if (cancelled) return;

      const el = containerRef.current;
      if (!el || !el.isConnected) return;

      const tv = window.TradingView;
      if (!tv) return;

      // Custom datafeed using your REST/WS
      const datafeed = {
        onReady: (cb: any) => {
          cb({
            supported_resolutions: TV_RESOLUTIONS as unknown as string[],
            supports_time: true,
            supports_marks: false,
            supports_timescale_marks: false,
            supports_search: false,
            supports_group_request: false,
          });
        },
        resolveSymbol: (sym: string, onResolve: any) => {
          onResolve({
            name: sym,
            ticker: sym,
            description: sym,
            type: "forex",
            session: "24x7",
            timezone: "Etc/UTC",
            has_intraday: true,
            has_no_volume: false,
            minmov: 1,
            pricescale: 100000,
            supported_resolutions: TV_RESOLUTIONS as unknown as string[],
            data_status: "streaming",
          });
        },
        getBars: async (symInfo: any, resolution: string, _from: number, _to: number, onBars: any, onErr: any) => {
          try {
            const tf = tvToServerTF(resolution || initialInterval);
            const resp = await getCandles(symInfo.ticker, tf, 1000);
            const bars = (resp?.candles ?? []).map((r: any) => ({
              time: Number(r.time) * 1000, // ms
              open: Number(r.open),
              high: Number(r.high),
              low:  Number(r.low),
              close:Number(r.close),
              volume: Number(r.volume ?? 0),
            }));
            onBars(bars, { noData: bars.length === 0 });
          } catch (e) {
            onErr?.(e);
          }
        },
        subscribeBars: (symInfo: any, resolution: string, onRealtime: any, uid: string) => {
          // Close previous subscription if any
          if (subRef.current?.ws) {
            try { subRef.current.ws.close(); } catch {}
          }
          const tf = tvToServerTF(resolution || initialInterval);
          const url = wsUrl(`/stream/candles?symbol=${encodeURIComponent(symInfo.ticker)}&timeframe=${encodeURIComponent(tf)}`);
          const ws = new WebSocket(url);
          subRef.current = { ws, uid };

          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(ev.data);
              const b = msg?.bar;
              if (!b) return;
              onRealtime({
                time: Number(b.time) * 1000,
                open: Number(b.open),
                high: Number(b.high),
                low:  Number(b.low),
                close:Number(b.close),
                volume: 0,
              });
            } catch { /* ignore */ }
          };
          ws.onerror = () => { try { ws.close(); } catch {} };
        },
        unsubscribeBars: (uid: string) => {
          if (subRef.current?.uid === uid) {
            try { subRef.current.ws?.close(); } catch {}
            subRef.current = null;
          }
        },
      };

      // Defer widget creation to ensure DOM is stable (StrictMode-safe)
      queueMicrotask(() => {
        if (cancelled || !document.getElementById(containerId)) return;
        requestAnimationFrame(() => {
          if (cancelled || !document.getElementById(containerId)) return;

          // eslint-disable-next-line new-cap
          const widget = new tv.widget({
            container_id: containerId,     // string id (important)
            autosize: true,
            symbol: tvSymbol,
            interval: initialInterval,     // "1","5","60","1D",...
            timezone: "Etc/UTC",
            theme: "dark",
            style: "1",
            // show the top toolbar so the timeframe picker is visible
            hide_top_toolbar: false,
            hide_legend: true,
            hide_ideas: true,
            locale: "en",
            datafeed,
            overrides: {
              "paneProperties.background": "#0b0b0c",
              "paneProperties.vertGridProperties.color": "#15161a",
              "paneProperties.horzGridProperties.color": "#15161a",
              "scalesProperties.lineColor": "#26272b",
              "scalesProperties.textColor": "#9ca3af",
              "mainSeriesProperties.candleStyle.upColor": "#10b981",
              "mainSeriesProperties.candleStyle.downColor": "#ef4444",
              "mainSeriesProperties.candleStyle.borderUpColor": "#10b981",
              "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
              "mainSeriesProperties.candleStyle.wickUpColor": "#10b981",
              "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
            },
          });

          // When user changes timeframe in the UI, our datafeed gets that resolution.
          // No additional wiring needed, but we can log it for debugging:
          widget.onChartReady?.(() => {
            widget.chart()?.onIntervalChanged()?.subscribe(null, (res: string) => {
              // console.log("[TV] interval changed ->", res);
            });
          });

          widgetRef.current = widget;
        });
      });
    };

    init();

    return () => {
      cancelled = true;
      try { subRef.current?.ws?.close(); } catch {}
      subRef.current = null;
      levelLinesRef.current.forEach((line) => {
        try { line.remove(); } catch {}
      });
      levelLinesRef.current = [];
      try { widgetRef.current?.remove?.(); } catch {}
      widgetRef.current = null;
    };
  }, [tvSymbol, initialInterval]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget) return;

    const applyLevels = () => {
      const chart = widget.chart?.();
      if (!chart?.createOrderLine) return;

      levelLinesRef.current.forEach((line) => {
        try { line.remove(); } catch {}
      });
      levelLinesRef.current = [];

      (levels || []).forEach((lvl) => {
        const entryLine = chart.createOrderLine();
        entryLine.setPrice(lvl.entry);
        entryLine.setText(`${lvl.strategy} entry`);
        entryLine.setBodyText(`${lvl.strategy.toUpperCase()} ${lvl.side} @ ${lvl.entry.toFixed(5)}`);
        entryLine.setLineColor(lvl.side === "BUY" ? "#10b981" : "#ef4444");
        entryLine.setExtendLeft(true);
        entryLine.setExtendRight(true);
        levelLinesRef.current.push(entryLine);

        const stopLine = chart.createOrderLine();
        stopLine.setPrice(lvl.stop);
        stopLine.setText(`${lvl.strategy} SL`);
        stopLine.setBodyText(`SL @ ${lvl.stop.toFixed(5)}`);
        stopLine.setLineColor("#f97316");
        stopLine.setLineStyle(2);
        stopLine.setExtendLeft(true);
        stopLine.setExtendRight(true);
        levelLinesRef.current.push(stopLine);

        const targetLine = chart.createOrderLine();
        targetLine.setPrice(lvl.target);
        targetLine.setText(`${lvl.strategy} TP`);
        targetLine.setBodyText(`TP @ ${lvl.target.toFixed(5)}`);
        targetLine.setLineColor("#38bdf8");
        targetLine.setLineStyle(2);
        targetLine.setExtendLeft(true);
        targetLine.setExtendRight(true);
        levelLinesRef.current.push(targetLine);
      });
    };

    const chart = widget.chart?.();
    if (chart?.createOrderLine) {
      applyLevels();
    } else {
      widget.onChartReady?.(() => applyLevels());
    }
  }, [levels, tvSymbol]);

  return (
    <div
      id={containerId}
      ref={containerRef}
      style={{ width: "100%", height }}
    />
  );
}
