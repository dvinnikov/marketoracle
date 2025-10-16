import { useEffect, useRef } from "react";
import {
  createChart,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type Time,            // UTCTimestamp | BusinessDay
  type CandlestickData, // { time: Time; open; high; low; close }
} from "lightweight-charts";

type Bar = {
  time: number;  // unix seconds from your API
  open: number;
  high: number;
  low: number;
  close: number;
};

type Props = {
  history?: Bar[];
  liveBar?: Bar | null;
  height?: number;
};

export default function TVChart({
  history = [],
  liveBar = null,
  height = 420,
}: Props) {
  const wrapRef  = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // init once
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: { background: { color: "#0b0b0c" }, textColor: "#d1d5db" },
      grid: { vertLines: { color: "#15161a" }, horzLines: { color: "#15161a" } },
      rightPriceScale: { borderColor: "#26272b" },
      timeScale: { borderColor: "#26272b", rightBarStaysOnScroll: true },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // responsive width
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      chart.applyOptions({ width: w });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  // set full history
  useEffect(() => {
    if (!seriesRef.current || !history.length) return;

    const data: CandlestickData[] = history.map((b) => ({
      time: Math.floor(b.time) as Time, // UTCTimestamp
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    seriesRef.current.setData(data);
    chartRef.current?.timeScale().scrollToRealTime();
  }, [history]);

  // push live bar
  useEffect(() => {
    if (!seriesRef.current || !liveBar) return;

    seriesRef.current.update({
      time: Math.floor(liveBar.time) as Time,
      open: liveBar.open,
      high: liveBar.high,
      low: liveBar.low,
      close: liveBar.close,
    });

    chartRef.current?.timeScale().scrollToRealTime();
  }, [liveBar]);

  return <div ref={wrapRef} style={{ width: "100%", height }} />;
}
