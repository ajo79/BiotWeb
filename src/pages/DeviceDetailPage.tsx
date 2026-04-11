import { useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDeviceHistory, useRealtime } from "../hooks/queries";
import { useTimeZoom } from "../hooks/useTimeZoom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import { useMotionPreset } from "../utils/motion";
import { extractPressMetrics, getEnvValues } from "../utils/metrics";
import {
  DEFAULT_SCOPE_PRESET_ID,
  LIVE_SCOPE_BUFFER_MS,
  buildDivisionTicks,
  buildTicksByIntervalMs,
  coerceEpochMs,
  formatDurationShortWithSeconds,
  formatFullDateTimeTick,
  formatHistoryTick,
  formatScopeTick,
  resolveScopeTimePerDivisionMs,
  resolveScopeWindowMs,
  timePerDivisionMs,
} from "../utils/chartTimebase";
import {
  dateInputToSiteDayEndMs,
  dateInputToSiteDayStartMs,
  epochMsToSiteDayEndMs,
  epochMsToSiteDayStartMs,
  getSiteDateInputValue,
  shiftDateInputByDays,
} from "../utils/siteTime";

const HEARTBEAT_THRESHOLD_MS = 10_000;
const POLLING_GRANULARITY_MS = 5_000;
const OFFLINE_AFTER_MS = HEARTBEAT_THRESHOLD_MS + POLLING_GRANULARITY_MS;
const LIVE_MAX_POINTS = Math.ceil(LIVE_SCOPE_BUFFER_MS / 5_000) + 240;

function normalizeDateRange(range: { start: string; end: string }) {
  if (range.start && range.end && range.start > range.end) {
    return { start: range.end, end: range.start };
  }
  return range;
}

const resolvePlotTimestamp = (item: any): number | undefined => {
  const candidates = [
    item?.tsDeviceMs,
    item?.tsEpochMs,
    item?.ts_epoch_ms,
    item?.payload?.tsEpochMs,
    item?.payload?.ts_epoch_ms,
    item?._lastHeartbeatTs,
    item?.ts,
    item?.timestamp,
    item?.time,
  ];
  for (const value of candidates) {
    const ts = coerceEpochMs(value);
    if (Number.isFinite(ts)) return Number(ts);
  }
  return undefined;
};

const normalizePlotRows = (rows: any[] = []) =>
  (rows ?? [])
    .map((row) => {
      const plotTs = resolvePlotTimestamp(row);
      if (!Number.isFinite(plotTs)) return null;
      return { ...row, plotTs: Number(plotTs) };
    })
    .filter((row): row is any => Boolean(row))
    .sort((a, b) => (a.plotTs ?? 0) - (b.plotTs ?? 0));

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const motionPreset = useMotionPreset();
  const [mode, setMode] = useState<"live" | "history">("live");
  const [liveSeries, setLiveSeries] = useState<any[]>([]);
  const [liveHistoryAnchorTs, setLiveHistoryAnchorTs] = useState(() => Date.now());
  const [thresholds, setThresholds] = useState<{ low: string; high: string }>({ low: "", high: "" });
  const scopePresetId = DEFAULT_SCOPE_PRESET_ID;
  const lastTsRef = useRef<number | null>(null);
  const [initialHistoryRange] = useState(() => {
    const end = getSiteDateInputValue();
    const start = shiftDateInputByDays(end, -7);
    return { start, end };
  });
  const [draftRange, setDraftRange] = useState(initialHistoryRange);
  const [appliedRange, setAppliedRange] = useState(initialHistoryRange);
  const chartMargin = { top: 10, right: 8, left: 8, bottom: 46 };

  const realtime = useRealtime({
    enabled: mode === "live",
    refetchInterval: mode === "live" ? 5000 : false,
  });
  const liveTick = realtime.dataUpdatedAt;
  const historyQuery = useDeviceHistory(
    mode === "history" ? id || "" : "",
    dateInputToSiteDayStartMs(appliedRange.start),
    dateInputToSiteDayEndMs(appliedRange.end)
  );
  const liveHistoryBounds = useMemo(() => {
    const anchorTs = Number.isFinite(liveHistoryAnchorTs) ? Number(liveHistoryAnchorTs) : Date.now();
    return { from: epochMsToSiteDayStartMs(anchorTs), to: epochMsToSiteDayEndMs(anchorTs) };
  }, [liveHistoryAnchorTs]);
  const liveHistoryQuery = useDeviceHistory(
    mode === "live" ? id || "" : "",
    liveHistoryBounds.from,
    liveHistoryBounds.to
  );

  const liveItem = useMemo(() => {
    const items = realtime.data?.items ?? [];
    return items.find((item) => String(item.deviceId) === String(id));
  }, [realtime.data?.items, id]);

  const liveStatusTag = String(liveItem?._onlineStatus ?? "").trim().toLowerCase();
  const liveOnlineFromState =
    liveStatusTag === "online" || liveStatusTag === "stale"
      ? true
      : liveStatusTag === "offline"
      ? false
      : undefined;
  const liveTs = coerceEpochMs(liveItem?.ts);
  const heartbeatTs = coerceEpochMs(liveItem?._lastHeartbeatTs ?? liveTs);
  const isLiveOnline =
    typeof liveOnlineFromState === "boolean"
      ? liveOnlineFromState
      : Number.isFinite(liveTs)
      ? Date.now() - Number(liveTs) <= OFFLINE_AFTER_MS
      : true;
  const lastSeen = Number.isFinite(heartbeatTs) ? new Date(Number(heartbeatTs)).toLocaleString() : "unknown";

  useEffect(() => {
    if (mode !== "live") return;
    setLiveSeries([]);
    setLiveHistoryAnchorTs(Date.now());
    lastTsRef.current = null;
  }, [id, mode]);

  useEffect(() => {
    if (mode !== "live" || !id) return;
    setLiveHistoryAnchorTs(Date.now());
  }, [mode, id]);

  useEffect(() => {
    if (mode !== "live") return;
    const items = realtime.data?.items ?? [];
    const match = items.find((item) => String(item.deviceId) === String(id));
    if (!match) return;

    const pointTs = resolvePlotTimestamp(match) ?? Date.now();
    if (lastTsRef.current === pointTs) return;
    lastTsRef.current = pointTs;

    setLiveSeries((prev) => {
      const next = [...prev, { ...match, ts: pointTs }];
      const cutoff = pointTs - LIVE_SCOPE_BUFFER_MS;
      const filtered = next.filter((row) => {
        const ts = resolvePlotTimestamp(row);
        return Number.isFinite(ts) && Number(ts) >= cutoff;
      });
      return filtered.slice(-LIVE_MAX_POINTS);
    });
  }, [realtime.data?.items, id, mode]);

  const historyData = useMemo(() => normalizePlotRows(historyQuery.data ?? []), [historyQuery.data]);
  const liveHistoryData = useMemo(() => normalizePlotRows(liveHistoryQuery.data ?? []), [liveHistoryQuery.data]);
  const liveRealtimeData = useMemo(() => normalizePlotRows(liveSeries), [liveSeries]);

  const seriesData = useMemo(() => {
    if (mode !== "live") return historyData;
    const byTs = new Map<number, any>();
    liveHistoryData.forEach((row) => {
      byTs.set(Number(row.plotTs), row);
    });
    liveRealtimeData.forEach((row) => {
      const ts = Number(row.plotTs);
      const prev = byTs.get(ts);
      byTs.set(ts, prev ? { ...prev, ...row } : row);
    });
    return Array.from(byTs.values()).sort((a, b) => (a.plotTs ?? 0) - (b.plotTs ?? 0));
  }, [mode, historyData, liveHistoryData, liveRealtimeData]);

  const scopeWindowMs = resolveScopeWindowMs(scopePresetId);
  const scopeDivisionMs = resolveScopeTimePerDivisionMs(scopePresetId);

  const scopeDomain = useMemo(() => {
    if (mode === "live") {
      const latestTs = Number(seriesData.at(-1)?.plotTs);
      const endTs = Number.isFinite(latestTs) ? Math.max(Number(latestTs), Date.now()) : Date.now();
      return { startTs: epochMsToSiteDayStartMs(endTs), endTs };
    }

    const selectedStartTs = dateInputToSiteDayStartMs(appliedRange.start);
    const selectedEndTs = dateInputToSiteDayEndMs(appliedRange.end);
    if (Number.isFinite(selectedStartTs) && Number.isFinite(selectedEndTs) && selectedEndTs > selectedStartTs) {
      return { startTs: selectedStartTs, endTs: selectedEndTs };
    }

    const firstPointTs = Number(seriesData[0]?.plotTs);
    const lastPointTs = Number(seriesData.at(-1)?.plotTs);
    if (Number.isFinite(firstPointTs) && Number.isFinite(lastPointTs) && lastPointTs > firstPointTs) {
      return { startTs: firstPointTs, endTs: lastPointTs };
    }

    const fallbackEndTs = Number.isFinite(lastPointTs)
      ? lastPointTs
      : Number.isFinite(dateInputToSiteDayEndMs(appliedRange.end))
      ? dateInputToSiteDayEndMs(appliedRange.end)
      : Date.now();
    return { startTs: fallbackEndTs - scopeWindowMs, endTs: fallbackEndTs };
  }, [mode, seriesData, scopeWindowMs, appliedRange.start, appliedRange.end, liveTick]);

  const historyBoundsDomain = useMemo(() => {
    const startTs = dateInputToSiteDayStartMs(appliedRange.start);
    const endTs = dateInputToSiteDayEndMs(appliedRange.end);
    if (Number.isFinite(startTs) && Number.isFinite(endTs) && endTs > startTs) {
      return { startTs, endTs };
    }
    return scopeDomain;
  }, [appliedRange.start, appliedRange.end, scopeDomain]);
  const zoomBoundsDomain = mode === "history" ? historyBoundsDomain : scopeDomain;

  const scopeStartTs = scopeDomain.startTs;
  const scopeEndTs = scopeDomain.endTs;
  const { visibleDomain, isZoomed, canPan, panRatio, setPanRatio, zoomIn, zoomOut, resetZoom, setWheelElement } = useTimeZoom({
    baseDomain: scopeDomain,
    boundsDomain: zoomBoundsDomain,
    minWindowMs: 15_000,
    maxWindowMs: mode === "history" ? Math.max(15_000, zoomBoundsDomain.endTs - zoomBoundsDomain.startTs) : Math.max(15_000, scopeEndTs - scopeStartTs),
  });
  const visibleStartTs = visibleDomain.startTs;
  const visibleEndTs = visibleDomain.endTs;

  useEffect(() => {
    resetZoom();
  }, [mode, id, appliedRange.start, appliedRange.end, resetZoom]);

  const chartData = useMemo(
    () =>
      seriesData.filter((row) => {
        const ts = Number(row?.plotTs);
        return Number.isFinite(ts) && ts >= visibleStartTs && ts <= visibleEndTs;
      }),
    [seriesData, visibleStartTs, visibleEndTs]
  );

  const axisTicks = useMemo(() => {
    if (mode === "live") {
      return buildTicksByIntervalMs(visibleStartTs, visibleEndTs, scopeDivisionMs, 2000);
    }
    return buildDivisionTicks(visibleStartTs, visibleEndTs);
  }, [mode, visibleStartTs, visibleEndTs, scopeDivisionMs]);
  const tickFormatWindowMs = mode === "live" ? scopeDivisionMs : scopeWindowMs;
  const formatXAxisTick = (value: number) =>
    mode === "history"
      ? formatHistoryTick(Number(value), visibleStartTs, visibleEndTs)
      : formatScopeTick(Number(value), tickFormatWindowMs);
  const currentTimeDiv = useMemo(
    () =>
      formatDurationShortWithSeconds(
        timePerDivisionMs(Math.max(1, Number(visibleEndTs) - Number(visibleStartTs)))
      ),
    [visibleStartTs, visibleEndTs]
  );

  const pressIds = useMemo(
    () =>
      Array.from(
        new Set(chartData.flatMap((row) => extractPressMetrics(row).map((phase) => phase.id)))
      ).sort((a, b) => Number(a) - Number(b)),
    [chartData]
  );
  const hasPress = pressIds.length > 0;
  const modeLabel = chartData.length === 0 ? "Device Metrics" : hasPress ? "Press Amps" : "Env (Temp/Humidity)";
  const lowThreshold = Number(thresholds.low);
  const highThreshold = Number(thresholds.high);
  const hasLow = Number.isFinite(lowThreshold);
  const hasHigh = Number.isFinite(highThreshold);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="glass rounded-xl px-4 py-3 border border-white/5">
          <p className="text-xs text-slate-400">Device</p>
          <p className="text-lg font-semibold">{id}</p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="glass rounded-xl px-3 py-2 border border-white/5">
            From
            <input
              className="bg-transparent ml-2 focus:outline-none"
              type="date"
              value={draftRange.start}
              onChange={(e) => setDraftRange((prev) => ({ ...prev, start: e.target.value }))}
            />
          </label>
          <label className="glass rounded-xl px-3 py-2 border border-white/5">
            To
            <input
              className="bg-transparent ml-2 focus:outline-none"
              type="date"
              value={draftRange.end}
              onChange={(e) => setDraftRange((prev) => ({ ...prev, end: e.target.value }))}
            />
          </label>
          <button
            onClick={() => {
              setMode("live");
            }}
            className={`px-3 py-2 rounded-xl font-semibold border ${
              mode === "live" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-600 border-blue-200"
            }`}
          >
            Live
          </button>
          <button
            onClick={() => {
              const nextRange = normalizeDateRange(draftRange);
              setDraftRange(nextRange);
              setMode("history");
              const changed =
                nextRange.start !== appliedRange.start || nextRange.end !== appliedRange.end;
              if (changed) {
                setAppliedRange(nextRange);
              } else {
                historyQuery.refetch();
              }
            }}
            className={`px-3 py-2 rounded-xl font-semibold border ${
              mode === "history"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-blue-600 border-blue-200"
            }`}
          >
            Load History
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="flex flex-col">
            Low threshold {hasPress ? "(A)" : ""}
            <input
              value={thresholds.low}
              onChange={(e) => setThresholds((prev) => ({ ...prev, low: e.target.value }))}
              className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel w-28"
              placeholder="e.g. 0.5"
            />
          </label>
          <label className="flex flex-col">
            High threshold {hasPress ? "(A)" : ""}
            <input
              value={thresholds.high}
              onChange={(e) => setThresholds((prev) => ({ ...prev, high: e.target.value }))}
              className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel w-28"
              placeholder="e.g. 5.0"
            />
          </label>
        </div>
      </div>

      <motion.div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient" {...motionPreset}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-slate-400">{mode === "live" ? "Live" : "History"}</p>
            <h2 className="text-xl font-semibold">{chartData.length === 0 ? "Device Metrics" : hasPress ? "Phase Amps" : "Temperature / Humidity"}</h2>
            <p className="mt-1 text-xs text-slate-600">
              Mode: <span className="font-semibold text-slate-900">{modeLabel}</span>
              <span className="ml-2">
                Time/Div: <span className="font-semibold text-slate-900">{currentTimeDiv}</span>
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={zoomOut}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
              aria-label="Zoom out timeline"
              title="Zoom out"
            >
              -
            </button>
            <button
              type="button"
              onClick={zoomIn}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
              aria-label="Zoom in timeline"
              title="Zoom in"
            >
              +
            </button>
            {isZoomed && (
              <>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                  Zoom locked
                </span>
                <button
                  type="button"
                  onClick={resetZoom}
                  className="rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:border-blue-300 hover:text-blue-800"
                >
                  Reset Zoom
                </button>
              </>
            )}
            {historyQuery.isLoading && <span className="text-xs text-slate-400">Loading...</span>}
          </div>
        </div>

        {mode === "live" && !isLiveOnline && (
          <div className="mb-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-400">
            Device is offline. Showing today history only. Last seen: {lastSeen}.
          </div>
        )}

        {chartData.length === 0 ? (
          <p className="text-sm text-slate-400">
            {mode === "live"
              ? liveHistoryQuery.isLoading
                ? "Loading today's history..."
                : "Waiting for live data..."
              : "No data for selected window."}
          </p>
        ) : hasPress ? (
          <div
            className="h-[21rem] -mx-2 cursor-zoom-in sm:-mx-3 lg:-mx-4"
            ref={setWheelElement}
            title="Use mouse wheel to zoom the time axis"
          >
            <ResponsiveContainer>
              <LineChart data={chartData} margin={chartMargin}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                <XAxis
                  type="number"
                  dataKey="plotTs"
                  domain={[visibleStartTs, visibleEndTs]}
                  ticks={axisTicks}
                  tickFormatter={(value) => formatXAxisTick(Number(value))}
                  stroke="#94a3b8"
                  minTickGap={mode === "history" ? 48 : 20}
                  tick={{ fontSize: 12 }}
                />
                <YAxis stroke="#94a3b8" width={52} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
                  labelStyle={{ color: "#0f172a" }}
                  labelFormatter={(value) => {
                    const ts = Number(value);
                    return Number.isFinite(ts) ? formatFullDateTimeTick(ts) : String(value ?? "");
                  }}
                  formatter={(value: any) =>
                    Number.isFinite(Number(value)) ? Number(value).toFixed(2) : value
                  }
                />
                <Legend verticalAlign="top" height={30} />
                {hasLow && (
                  <ReferenceLine
                    y={lowThreshold}
                    stroke="#f97316"
                    strokeDasharray="6 4"
                    label={{ value: `Low ${lowThreshold}`, position: "right", fill: "#f97316", fontSize: 11 }}
                  />
                )}
                {hasHigh && (
                  <ReferenceLine
                    y={highThreshold}
                    stroke="#dc2626"
                    strokeDasharray="6 4"
                    label={{ value: `High ${highThreshold}`, position: "right", fill: "#dc2626", fontSize: 11 }}
                  />
                )}
                {pressIds.map((pid, idx) => (
                  <Line
                    key={pid}
                    type="monotone"
                    dataKey={(row: any) => {
                      const phase = extractPressMetrics(row).find((item) => item.id === pid);
                      return phase ? phase.amps : 0;
                    }}
                    name={`Phase ${pid} Amps`}
                    stroke={["#2563eb", "#16a34a", "#f59e0b", "#dc2626"][idx % 4]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3.5, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 1.5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div
            className="h-[21rem] -mx-2 cursor-zoom-in sm:-mx-3 lg:-mx-4"
            ref={setWheelElement}
            title="Use mouse wheel to zoom the time axis"
          >
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={chartMargin}>
                <defs>
                  <linearGradient id="temp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hum" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                <XAxis
                  type="number"
                  dataKey="plotTs"
                  domain={[visibleStartTs, visibleEndTs]}
                  ticks={axisTicks}
                  tickFormatter={(value) => formatXAxisTick(Number(value))}
                  stroke="#94a3b8"
                  minTickGap={mode === "history" ? 48 : 20}
                  tick={{ fontSize: 12 }}
                />
                <YAxis stroke="#94a3b8" width={52} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
                  labelStyle={{ color: "#0f172a" }}
                  labelFormatter={(value) => {
                    const ts = Number(value);
                    return Number.isFinite(ts) ? formatFullDateTimeTick(ts) : String(value ?? "");
                  }}
                  formatter={(value: any) =>
                    Number.isFinite(Number(value)) ? Number(value).toFixed(2) : value
                  }
                />
                <Legend verticalAlign="top" height={30} />
                {hasLow && (
                  <ReferenceLine
                    y={lowThreshold}
                    stroke="#f97316"
                    strokeDasharray="6 4"
                    label={{ value: `Low ${lowThreshold}`, position: "right", fill: "#f97316", fontSize: 11 }}
                  />
                )}
                {hasHigh && (
                  <ReferenceLine
                    y={highThreshold}
                    stroke="#dc2626"
                    strokeDasharray="6 4"
                    label={{ value: `High ${highThreshold}`, position: "right", fill: "#dc2626", fontSize: 11 }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey={(row: any) => getEnvValues(row).temperature ?? 0}
                  name="Temp (C)"
                  stroke="#2563eb"
                  fill="url(#temp)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 1.5 }}
                />
                <Area
                  type="monotone"
                  dataKey={(row: any) => getEnvValues(row).humidity ?? 0}
                  name="Humidity (%)"
                  stroke="#0d9488"
                  fill="url(#hum)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, fill: "#0d9488", stroke: "#ffffff", strokeWidth: 1.5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {canPan && (
          <div className="mt-3 rounded-xl border border-slate-200/80 bg-white/60 px-3 py-2">
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600">
              <span>Scroll Timeline</span>
              <span>{Math.round(panRatio * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={Math.round(panRatio * 1000)}
              onChange={(e) => setPanRatio(Number(e.target.value) / 1000)}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
              aria-label="Scroll chart timeline"
            />
          </div>
        )}

      </motion.div>
    </div>
  );
}
