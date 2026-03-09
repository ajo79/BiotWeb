import { useEffect, useMemo, useState } from "react";
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

const HEARTBEAT_THRESHOLD_MS = 10_000;
const POLLING_GRANULARITY_MS = 5_000;
const OFFLINE_AFTER_MS = HEARTBEAT_THRESHOLD_MS + POLLING_GRANULARITY_MS;
const LIVE_MAX_POINTS = Math.ceil(LIVE_SCOPE_BUFFER_MS / 5_000) + 240;

const toLocalStart = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d).getTime();
};

const toLocalEnd = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
};

const toLocalDayStart = (epochMs: number) => {
  const d = new Date(epochMs);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const toLocalDayEnd = (epochMs: number) => {
  const d = new Date(epochMs);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

const normalizeDateRange = (range: { start: string; end: string }) => {
  if (range.start && range.end && range.start > range.end) {
    return { start: range.end, end: range.start };
  }
  return range;
};

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

type StatSummary = { min: string; max: string; avg: string };
type Stats =
  | { type: "press"; perPhase: Record<string, StatSummary> }
  | { type: "env"; temp: StatSummary; hum: StatSummary };

const classify = (item: any) => {
  const statusTag = String(item?._onlineStatus ?? "").trim().toLowerCase();
  const onlineFromState =
    statusTag === "online" || statusTag === "stale"
      ? true
      : statusTag === "offline"
      ? false
      : undefined;
  const ts = coerceEpochMs(item?.ts);
  const online =
    typeof onlineFromState === "boolean"
      ? onlineFromState
      : typeof ts === "number"
      ? Date.now() - ts <= OFFLINE_AFTER_MS
      : true;
  const keys = ["common issue", "common issues", "common alarm", "commonAlarm", "commonIssue"];
  const lower: Record<string, any> = {};
  Object.entries(item || {}).forEach(([k, v]) => (lower[String(k).toLowerCase()] = v));
  const commonIssue = keys.some((k) => {
    if (!(k in lower)) return false;
    const v = lower[k];
    if (typeof v === "boolean") return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n !== 0;
    return Boolean(v);
  });
  return { online, commonIssue };
};

export default function GraphPage() {
  const [mode, setMode] = useState<"live" | "history">("live");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [liveSeries, setLiveSeries] = useState<any[]>([]);
  const [liveHistoryAnchorTs, setLiveHistoryAnchorTs] = useState(() => Date.now());
  const [thresholds, setThresholds] = useState<{ low: string; high: string }>({ low: "", high: "" });
  const [refreshAnimating, setRefreshAnimating] = useState(false);
  const scopePresetId = DEFAULT_SCOPE_PRESET_ID;
  const [initialHistoryRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 1);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const [draftRange, setDraftRange] = useState(initialHistoryRange);
  const [appliedRange, setAppliedRange] = useState(initialHistoryRange);
  const chartMargin = { top: 10, right: 8, left: 8, bottom: 46 };

  const realtime = useRealtime({
    enabled: true,
    refetchInterval: mode === "live" ? 5000 : false,
  });

  const liveItems = realtime.data?.realtimeItems ?? [];
  const liveTick = realtime.dataUpdatedAt;
  const allDeviceOptions = useMemo(() => {
    const ids = new Set<string>();
    const source = [...(realtime.data?.items ?? []), ...(realtime.data?.realtimeItems ?? [])];
    source.forEach((item) => {
      const id = item?.deviceId != null ? String(item.deviceId).trim() : "";
      if (id) ids.add(id);
    });
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [realtime.data?.items, realtime.data?.realtimeItems]);
  const selectedId = selectedDevice || allDeviceOptions[0] || "";

  useEffect(() => {
    if (!allDeviceOptions.length) return;
    if (!selectedDevice || !allDeviceOptions.includes(selectedDevice)) {
      setSelectedDevice(allDeviceOptions[0]);
    }
  }, [selectedDevice, allDeviceOptions]);

  useEffect(() => {
    if (mode !== "live") return;
    if (!liveItems.length) return;
    const targetId = selectedId || liveItems[0]?.deviceId;
    if (!targetId) return;
    const reading = liveItems.find((d: any) => d.deviceId === targetId) ?? liveItems[0];
    if (!reading) return;

    const pointTs = resolvePlotTimestamp(reading) ?? Date.now();
    setLiveSeries((prev) => {
      const lastPointTs = resolvePlotTimestamp(prev.at(-1));

      if (Number.isFinite(lastPointTs) && pointTs < Number(lastPointTs)) return prev;
      if (Number.isFinite(lastPointTs) && pointTs === Number(lastPointTs)) {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], ...reading, ts: pointTs };
        return next;
      }

      const next = [...prev, { ...reading, ts: pointTs }];
      const cutoff = pointTs - LIVE_SCOPE_BUFFER_MS;
      const filtered = next.filter((row) => {
        const ts = resolvePlotTimestamp(row);
        return Number.isFinite(ts) && Number(ts) >= cutoff;
      });
      return filtered.slice(-LIVE_MAX_POINTS);
    });
  }, [mode, liveItems, selectedId, liveTick]);

  useEffect(() => {
    if (mode === "live") {
      setLiveSeries([]);
      setLiveHistoryAnchorTs(Date.now());
    }
  }, [mode, selectedId]);

  useEffect(() => {
    if (mode !== "live" || !selectedId) return;
    setLiveHistoryAnchorTs(Date.now());
  }, [mode, selectedId]);

  const history = useDeviceHistory(
    mode === "history" ? selectedId : "",
    toLocalStart(appliedRange.start),
    toLocalEnd(appliedRange.end)
  );

  const liveHistoryBounds = useMemo(() => {
    const anchorTs = Number.isFinite(liveHistoryAnchorTs) ? Number(liveHistoryAnchorTs) : Date.now();
    return { from: toLocalDayStart(anchorTs), to: toLocalDayEnd(anchorTs) };
  }, [liveHistoryAnchorTs]);

  const liveHistory = useDeviceHistory(
    mode === "live" ? selectedId : "",
    liveHistoryBounds.from,
    liveHistoryBounds.to
  );

  const historyData = useMemo(() => normalizePlotRows(history.data ?? []), [history.data]);

  const liveHistoryData = useMemo(() => normalizePlotRows(liveHistory.data ?? []), [liveHistory.data]);

  const liveData = useMemo(() => normalizePlotRows(liveSeries), [liveSeries]);

  const scopeWindowMs = resolveScopeWindowMs(scopePresetId);
  const scopeDivisionMs = resolveScopeTimePerDivisionMs(scopePresetId);
  const modeData = useMemo(() => {
    if (mode !== "live") return historyData;
    const byTs = new Map<number, any>();
    liveHistoryData.forEach((row) => {
      byTs.set(Number(row.plotTs), row);
    });
    liveData.forEach((row) => {
      const ts = Number(row.plotTs);
      const prev = byTs.get(ts);
      byTs.set(ts, prev ? { ...prev, ...row } : row);
    });
    return Array.from(byTs.values()).sort((a, b) => (a.plotTs ?? 0) - (b.plotTs ?? 0));
  }, [mode, historyData, liveHistoryData, liveData]);

  const scopeDomain = useMemo(() => {
    if (mode === "live") {
      const latestTs = Number(modeData.at(-1)?.plotTs);
      const endTs = Number.isFinite(latestTs) ? Math.max(Number(latestTs), Date.now()) : Date.now();
      return { startTs: toLocalDayStart(endTs), endTs };
    }

    const selectedStartTs = toLocalStart(appliedRange.start);
    const selectedEndTs = toLocalEnd(appliedRange.end);
    if (Number.isFinite(selectedStartTs) && Number.isFinite(selectedEndTs) && selectedEndTs > selectedStartTs) {
      return { startTs: selectedStartTs, endTs: selectedEndTs };
    }

    const firstPointTs = Number(modeData[0]?.plotTs);
    const lastPointTs = Number(modeData.at(-1)?.plotTs);
    if (Number.isFinite(firstPointTs) && Number.isFinite(lastPointTs) && lastPointTs > firstPointTs) {
      return { startTs: firstPointTs, endTs: lastPointTs };
    }

    const fallbackEndTs = Number.isFinite(lastPointTs)
      ? lastPointTs
      : Number.isFinite(toLocalEnd(appliedRange.end))
      ? toLocalEnd(appliedRange.end)
      : Date.now();
    return { startTs: fallbackEndTs - scopeWindowMs, endTs: fallbackEndTs };
  }, [mode, modeData, scopeWindowMs, appliedRange.start, appliedRange.end, liveTick]);

  const historyBoundsDomain = useMemo(() => {
    const startTs = toLocalStart(appliedRange.start);
    const endTs = toLocalEnd(appliedRange.end);
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
  }, [mode, selectedId, appliedRange.start, appliedRange.end, resetZoom]);

  const chartData = useMemo(
    () =>
      modeData.filter((row) => {
        const ts = Number(row?.plotTs);
        return Number.isFinite(ts) && ts >= visibleStartTs && ts <= visibleEndTs;
      }),
    [modeData, visibleStartTs, visibleEndTs]
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

  const selected = realtime.data?.items?.find((d) => d.deviceId === selectedId);
  const status = selected ? classify(selected) : { online: true, commonIssue: false };
  const lastSeenTs = coerceEpochMs(selected?.ts);
  const lastSeen = Number.isFinite(lastSeenTs) ? new Date(lastSeenTs as number).toLocaleString() : "unknown";

  const pressIds = useMemo(() => {
    const ids = new Set<string>();
    chartData.forEach((row) => {
      extractPressMetrics(row).forEach((phase) => ids.add(phase.id));
    });
    return Array.from(ids).sort((a, b) => Number(a) - Number(b));
  }, [chartData]);
  const isPress = pressIds.length > 0;
  const lowThreshold = Number(thresholds.low);
  const highThreshold = Number(thresholds.high);
  const hasLow = Number.isFinite(lowThreshold);
  const hasHigh = Number.isFinite(highThreshold);

  const computeStats = (values: number[]) => {
    const nums = values.filter((v) => Number.isFinite(v));
    if (!nums.length) return { min: "--", max: "--", avg: "--" };
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const fmt = (value: number) => value.toFixed(2);
    return { min: fmt(min), max: fmt(max), avg: fmt(avg) };
  };

  const stats = useMemo<Stats>(() => {
    if (isPress) {
      const perPhase: Record<string, StatSummary> = {};
      pressIds.forEach((pid) => {
        const vals = chartData.map((row) => {
          const phase = extractPressMetrics(row).find((x) => x.id === pid);
          return phase ? phase.amps : NaN;
        });
        perPhase[pid] = computeStats(vals);
      });
      return { type: "press", perPhase };
    }
    const tempVals = chartData.map((row) => getEnvValues(row).temperature ?? NaN);
    const humVals = chartData.map((row) => getEnvValues(row).humidity ?? NaN);
    return { type: "env", temp: computeStats(tempVals), hum: computeStats(humVals) };
  }, [chartData, isPress, pressIds]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const labelTs = coerceEpochMs(label);
    const dt = Number.isFinite(labelTs) ? formatFullDateTimeTick(Number(labelTs)) : "";

    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow">
        <div className="font-semibold text-slate-900">{dt}</div>
        <div className="mt-1 space-y-0.5">
          {payload.map((point: any, idx: number) => {
            const color = point.color || point.stroke || "#0f172a";
            const value = Number.isFinite(point.value) ? Number(point.value).toFixed(2) : point.value;
            return (
              <div key={idx} style={{ color }} className="flex items-center justify-between gap-3">
                <span className="font-semibold">{point.name}</span>
                <span>{value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleHistoryLoad = async () => {
    const nextRange = normalizeDateRange(draftRange);
    setDraftRange(nextRange);
    setRefreshAnimating(true);
    const changed =
      nextRange.start !== appliedRange.start || nextRange.end !== appliedRange.end;
    if (changed) {
      setAppliedRange(nextRange);
    } else {
      await history.refetch();
    }
    setTimeout(() => setRefreshAnimating(false), 350);
  };

  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-4 border border-white/5 shadow-ambient flex flex-wrap gap-3 items-end">
        <div className="flex items-center gap-2 text-sm">
          {[{ key: "live", label: "Live" }, { key: "history", label: "History" }].map((chip) => (
            <button
              key={chip.key}
              onClick={() => setMode(chip.key as "live" | "history")}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                mode === chip.key ? "bg-blue-600 text-white border-blue-300" : "glass border-white/5"
              }`}
            >
              {chip.label}
            </button>
          ))}
          {mode === "live" && <span className="text-xs text-slate-400">auto-refresh 5s</span>}
        </div>

        <div className="flex flex-col text-sm">
          <label className="text-slate-400">Device</label>
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="mt-1 glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
          >
            {allDeviceOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </div>

        {mode === "history" && (
          <div className="flex items-center gap-2 text-sm">
            <label className="flex flex-col">
              From
              <input
                type="date"
                value={draftRange.start}
                onChange={(e) => setDraftRange((prev) => ({ ...prev, start: e.target.value }))}
                className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
              />
            </label>
            <label className="flex flex-col">
              To
              <input
                type="date"
                value={draftRange.end}
                onChange={(e) => setDraftRange((prev) => ({ ...prev, end: e.target.value }))}
                className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel"
              />
            </label>
          </div>
        )}

        <div className="text-sm text-slate-600">
          Status:{" "}
          <span className="text-slate-900">{status.online ? (status.commonIssue ? "Alarm" : "Online") : "Offline"}</span>
        </div>

        {mode === "history" && (
          <button
            onClick={handleHistoryLoad}
            className={`px-3 py-2 rounded-xl bg-blue-600 text-white font-semibold shadow-glow transition transform active:scale-95 ${
              refreshAnimating || history.isFetching ? "animate-pulse" : ""
            }`}
            disabled={history.isFetching}
          >
            Load History
          </button>
        )}

        {isPress && (
          <div className="flex items-center gap-2 text-sm">
            <label className="flex flex-col">
              Low threshold (A)
              <input
                value={thresholds.low}
                onChange={(e) => setThresholds((prev) => ({ ...prev, low: e.target.value }))}
                className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel w-28"
                placeholder="e.g. 0.5"
              />
            </label>
            <label className="flex flex-col">
              High threshold (A)
              <input
                value={thresholds.high}
                onChange={(e) => setThresholds((prev) => ({ ...prev, high: e.target.value }))}
                className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel w-28"
                placeholder="e.g. 5.0"
              />
            </label>
          </div>
        )}
      </div>

      <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-slate-400">{mode === "live" ? "Realtime" : "History"}</p>
            <h2 className="text-xl font-semibold">Device Metrics</h2>
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
            {mode === "history" && history.isLoading && <span className="text-xs text-slate-400">Loading...</span>}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
          <div>
            Points: <span className="text-slate-900 font-semibold">{chartData.length}</span>
          </div>
          <div>
            Mode:{" "}
            <span className="text-slate-900 font-semibold">
              {chartData.length === 0 ? "Device Metrics" : isPress ? "Press Amps" : "Env (Temp/Humidity)"}
            </span>
            <span className="ml-2 text-slate-500">
              Time/Div: <span className="font-semibold text-slate-900">{currentTimeDiv}</span>
            </span>
          </div>
          {mode === "live" && (
            <div className="col-span-2 text-slate-500">
              Device is streamed against oscilloscope window and divisions.
            </div>
          )}
          {stats.type === "press" ? (
            <div className="col-span-2 flex flex-wrap gap-3">
              {pressIds.map((pid) => (
                <div key={pid} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                  <span className="font-semibold text-slate-800">Phase {pid}</span>{" "}
                  <span>
                    min {stats.perPhase[pid].min} / max {stats.perPhase[pid].max} / avg {stats.perPhase[pid].avg}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="col-span-2 flex flex-wrap gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <span className="font-semibold text-slate-800">Temp</span> min {stats.temp.min} / max{" "}
                {stats.temp.max} / avg {stats.temp.avg}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <span className="font-semibold text-slate-800">Humidity</span> min {stats.hum.min} / max{" "}
                {stats.hum.max} / avg {stats.hum.avg}
              </div>
            </div>
          )}
        </div>

        {mode === "live" && !status.online && (
          <div className="mb-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-400">
            Device is offline. Showing today history only. Last seen: {lastSeen}.
          </div>
        )}

        {chartData.length === 0 ? (
          <p className="text-sm text-slate-400">
            {mode === "live"
              ? liveHistory.isLoading
                ? "Loading today's history..."
                : liveItems.length
                ? "Waiting for fresh realtime points..."
                : "No realtime data available."
              : "No data in this range/window."}
          </p>
        ) : isPress ? (
          <div
            className="h-[22rem] -mx-2 cursor-zoom-in sm:-mx-3 lg:-mx-4"
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
                <YAxis
                  width={52}
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  label={{ value: "Amps", angle: -90, position: "insideLeft", fill: "#64748b" }}
                />
                <Tooltip content={<CustomTooltip />} />
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
            className="h-[22rem] -mx-2 cursor-zoom-in sm:-mx-3 lg:-mx-4"
            ref={setWheelElement}
            title="Use mouse wheel to zoom the time axis"
          >
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={chartMargin}>
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
                  label={{ value: "Time", position: "insideBottom", offset: -16, fill: "#64748b" }}
                />
                <YAxis
                  width={52}
                  stroke="#94a3b8"
                  tick={{ fontSize: 12 }}
                  label={{ value: "Value", angle: -90, position: "insideLeft", fill: "#64748b" }}
                />
                <Tooltip content={<CustomTooltip />} />
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
                  fill="#dbeafe"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 1.5 }}
                />
                <Area
                  type="monotone"
                  dataKey={(row: any) => getEnvValues(row).humidity ?? 0}
                  name="Humidity (%)"
                  stroke="#0d9488"
                  fill="#ccfbf1"
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

      </div>
    </div>
  );
}
