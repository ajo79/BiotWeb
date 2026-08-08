import { Navigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDeviceHistory, useRealtime } from "../hooks/queries";
import { useTimeZoom } from "../hooks/useTimeZoom";
import {
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
import { getNumericMetricValue, getNumericParameterMetrics } from "../utils/metrics";
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
import { useAuth } from "../auth/auth";
import { buildAllowedDeviceIdSet, filterRowsForSession, isAllowedDeviceId } from "../utils/accessPolicy";
import { getSiteConfig } from "../config/sites";
import EnergyMetricGroupCard from "../components/EnergyMetricGroupCard";
import {
  buildEnergyMetricGroups,
  buildEnergyPresetsFromMetricOptions,
  isMeterConfigurationMetric,
} from "../utils/energyMeter";

const HEARTBEAT_THRESHOLD_MS = 10_000;
const POLLING_GRANULARITY_MS = 5_000;
const OFFLINE_AFTER_MS = HEARTBEAT_THRESHOLD_MS + POLLING_GRANULARITY_MS;
const LIVE_MAX_POINTS = Math.ceil(LIVE_SCOPE_BUFFER_MS / 5_000) + 240;
const LINE_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#0891b2", "#7c3aed", "#ea580c", "#64748b"];

type StatSummary = { min: string; max: string; avg: string };
type ChartMetricOption = { id: string; label: string; order: number; isPhaseAmp: boolean };

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

const deriveMetricOptions = (rows: any[]): ChartMetricOption[] => {
  const byId = new Map<string, ChartMetricOption>();
  rows.forEach((row) => {
    getNumericParameterMetrics(row).forEach((metric) => {
      if (byId.has(metric.id)) return;
      byId.set(metric.id, {
        id: metric.id,
        label: metric.displayLabel,
        order: metric.order,
        isPhaseAmp: metric.isPhaseAmp,
      });
    });
  });

  return Array.from(byId.values()).sort(
    (a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)
  );
};

const computeStats = (values: number[]): StatSummary => {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return { min: "--", max: "--", avg: "--" };
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const fmt = (value: number) => value.toFixed(2);
  return { min: fmt(min), max: fmt(max), avg: fmt(avg) };
};

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useAuth();
  const activeSite = getSiteConfig(state.siteKey);
  const isEnergySite = activeSite.key === "ACME_ENERGY";
  const motionPreset = useMotionPreset();
  const [mode, setMode] = useState<"live" | "history">("live");
  const [liveSeries, setLiveSeries] = useState<any[]>([]);
  const [liveHistoryAnchorTs, setLiveHistoryAnchorTs] = useState(() => Date.now());
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
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
  const allowedDeviceIds = useMemo(
    () => buildAllowedDeviceIdSet(realtime.data?.items ?? [], state),
    [realtime.data?.items, state]
  );
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

  useEffect(() => {
    if (mode !== "live" || !id) return;
    const timer = window.setInterval(() => {
      void liveHistoryQuery.refetch();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [mode, id, liveHistoryQuery.refetch]);

  const liveItem = useMemo(() => {
    const items = filterRowsForSession(realtime.data?.items ?? [], state);
    return items.find((item) => String(item.deviceId) === String(id));
  }, [realtime.data?.items, id, state]);

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
    const items = filterRowsForSession(realtime.data?.items ?? [], state);
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
  }, [realtime.data?.items, id, mode, state]);

  const historyData = useMemo(() => normalizePlotRows(filterRowsForSession(historyQuery.data ?? [], state)), [historyQuery.data, state]);
  const liveHistoryData = useMemo(() => normalizePlotRows(filterRowsForSession(liveHistoryQuery.data ?? [], state)), [liveHistoryQuery.data, state]);
  const liveRealtimeData = useMemo(() => normalizePlotRows(liveSeries), [liveSeries]);
  const isUnauthorizedDevice = Boolean(id && allowedDeviceIds.size > 0 && !isAllowedDeviceId(id, allowedDeviceIds));

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

  const metricOptions = useMemo(() => {
    const options = deriveMetricOptions(seriesData);
    return isEnergySite ? options.filter((metric) => !isMeterConfigurationMetric(metric)) : options;
  }, [seriesData, isEnergySite]);
  const energyPresets = useMemo(() => buildEnergyPresetsFromMetricOptions(metricOptions), [metricOptions]);

  useEffect(() => {
    setSelectedMetricIds((prev) => {
      const available = new Set(metricOptions.map((metric) => metric.id));
      const kept = prev.filter((metricId) => available.has(metricId));
      if (kept.length) return kept;
      if (!metricOptions.length) return [];

      if (isEnergySite) {
        const defaults = energyPresets.flatMap((preset) => preset.metricIds);
        return defaults.length ? Array.from(new Set(defaults)) : metricOptions.map((metric) => metric.id);
      }

      const defaults = metricOptions.filter((metric) => metric.isPhaseAmp).map((metric) => metric.id);
      const firstNonPhase = metricOptions.find((metric) => !metric.isPhaseAmp)?.id;
      if (firstNonPhase && !defaults.includes(firstNonPhase)) {
        defaults.push(firstNonPhase);
      }
      if (!defaults.length) defaults.push(metricOptions[0].id);
      return defaults;
    });
  }, [metricOptions, isEnergySite, energyPresets]);

  const selectedMetrics = useMemo(
    () => metricOptions.filter((metric) => selectedMetricIds.includes(metric.id)),
    [metricOptions, selectedMetricIds]
  );
  const metricSet = useMemo(() => new Set(selectedMetricIds), [selectedMetricIds]);

  const axisTicks = useMemo(() => {
    if (mode === "live") {
      return buildTicksByIntervalMs(visibleStartTs, visibleEndTs, scopeDivisionMs, 5000);
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

  const lowThreshold = Number(thresholds.low);
  const highThreshold = Number(thresholds.high);
  const thresholdEligible = selectedMetrics.length > 0 && selectedMetrics.every((metric) => metric.isPhaseAmp);
  const hasLow = thresholdEligible && Number.isFinite(lowThreshold);
  const hasHigh = thresholdEligible && Number.isFinite(highThreshold);
  const overviewGroups = useMemo(() => (liveItem ? buildEnergyMetricGroups(liveItem) : []), [liveItem]);

  const statsByMetric = useMemo(() => {
    const out: Record<string, StatSummary> = {};
    metricOptions.forEach((metric) => {
      const values = chartData.map((row) => {
        const value = getNumericMetricValue(row, metric.id);
        return value ?? NaN;
      });
      out[metric.id] = computeStats(values);
    });
    return out;
  }, [chartData, metricOptions]);

  const energyChartPanels = useMemo(
    () =>
      energyPresets
        .map((preset) => ({
          id: preset.id,
          title: preset.title,
          description: preset.description,
          metrics: metricOptions.filter((metric) => preset.metricIds.includes(metric.id)),
        }))
        .filter((panel) => panel.metrics.length),
    [energyPresets, metricOptions]
  );

  const toggleMetric = (metricId: string) => {
    setSelectedMetricIds((prev) => {
      if (prev.includes(metricId)) {
        const next = prev.filter((id) => id !== metricId);
        return next.length ? next : prev;
      }
      return [...prev, metricId];
    });
  };

  const modeLabel =
    isEnergySite
      ? energyChartPanels.length
        ? `${energyChartPanels.length} separate graph panels`
        : "Energy chart panels"
      : chartData.length === 0
      ? "Device Metrics"
      : selectedMetrics.length
      ? `${selectedMetrics.length} selected`
      : "No metrics selected";

  const renderMetricsChart = (metricsToRender: ChartMetricOption[], chartKey: string, allowThresholds: boolean) => {
    const showLow = allowThresholds && metricsToRender.length > 0 && metricsToRender.every((metric) => metric.isPhaseAmp) && Number.isFinite(lowThreshold);
    const showHigh = allowThresholds && metricsToRender.length > 0 && metricsToRender.every((metric) => metric.isPhaseAmp) && Number.isFinite(highThreshold);

    return (
      <ResponsiveContainer key={chartKey}>
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
            formatter={(value: any) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : value)}
          />
          <Legend verticalAlign="top" height={30} />
          {showLow && (
            <ReferenceLine
              y={lowThreshold}
              stroke="#f97316"
              strokeDasharray="6 4"
              label={{ value: `Low ${lowThreshold}`, position: "right", fill: "#f97316", fontSize: 11 }}
            />
          )}
          {showHigh && (
            <ReferenceLine
              y={highThreshold}
              stroke="#dc2626"
              strokeDasharray="6 4"
              label={{ value: `High ${highThreshold}`, position: "right", fill: "#dc2626", fontSize: 11 }}
            />
          )}
          {metricsToRender.map((metric, idx) => (
            <Line
              key={metric.id}
              type="monotone"
              dataKey={(row: any) => {
                const value = getNumericMetricValue(row, metric.id);
                return value ?? null;
              }}
              name={metric.label}
              stroke={LINE_COLORS[idx % LINE_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, fill: LINE_COLORS[idx % LINE_COLORS.length], stroke: "#ffffff", strokeWidth: 1.5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  if (isUnauthorizedDevice) {
    return <Navigate to="/devices" replace />;
  }

  return (
    <div className="space-y-4">
      {isEnergySite && liveItem && (
        <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,_#ffffff,_#f8fafc)] p-5 shadow-ambient">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Meter Overview</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">{liveItem.deviceName || liveItem.deviceId}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Live and history charts split into separate meter sections for each parameter group.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              Status: <span className={`font-semibold ${isLiveOnline ? "text-emerald-700" : "text-rose-700"}`}>{isLiveOnline ? "Online" : "Offline"}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            {overviewGroups.map((group) => (
              <EnergyMetricGroupCard key={group.key} group={group} />
            ))}
          </div>
        </div>
      )}

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
              const changed = nextRange.start !== appliedRange.start || nextRange.end !== appliedRange.end;
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

        {!isEnergySite && (
          <div className="flex-1 min-w-[220px]">
            <p className="text-xs text-slate-400">Metrics</p>
            {metricOptions.length ? (
              <div className="mt-1 flex max-h-24 flex-wrap gap-2 overflow-auto pr-1">
                {metricOptions.map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    onClick={() => toggleMetric(metric.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                      metricSet.has(metric.id)
                        ? "border-blue-300 bg-blue-600 text-white"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                    title={metric.label}
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">No numeric parameters in current data.</p>
            )}
          </div>
        )}

        {!isEnergySite && thresholdEligible && (
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

      <motion.div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient" {...motionPreset}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-slate-400">{mode === "live" ? "Live" : "History"}</p>
            <h2 className="text-xl font-semibold">{isEnergySite ? "Energy Metrics" : "Device Metrics"}</h2>
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

        {!isEnergySite && (
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
            {selectedMetrics.map((metric) => (
              <div key={metric.id} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <span className="font-semibold text-slate-800">{metric.label}</span>{" "}
                <span>
                  min {statsByMetric[metric.id]?.min ?? "--"} / max {statsByMetric[metric.id]?.max ?? "--"} / avg {statsByMetric[metric.id]?.avg ?? "--"}
                </span>
              </div>
            ))}
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
        ) : isEnergySite ? (
          energyChartPanels.length ? (
            <div
              className="grid gap-4 cursor-zoom-in"
              ref={setWheelElement}
              title="Use mouse wheel to zoom the time axis"
            >
              {energyChartPanels.map((panel) => (
                <section key={panel.id} className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Separate Graph</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{panel.title}</h3>
                      <p className="mt-1 text-xs text-slate-500">{panel.description}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                      {panel.metrics.length} metrics
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    {panel.metrics.map((metric) => (
                      <div key={metric.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                        <span className="font-semibold text-slate-800">{metric.label}</span>{" "}
                        <span>
                          min {statsByMetric[metric.id]?.min ?? "--"} / max {statsByMetric[metric.id]?.max ?? "--"} / avg {statsByMetric[metric.id]?.avg ?? "--"}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 h-[19rem]">{renderMetricsChart(panel.metrics, panel.id, false)}</div>
                </section>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No energy graph groups could be resolved from this meter's parameters.</p>
          )
        ) : !selectedMetrics.length ? (
          <p className="text-sm text-slate-500">Select at least one metric to render the chart.</p>
        ) : (
          <div
            className="h-[21rem] -mx-2 cursor-zoom-in sm:-mx-3 lg:-mx-4"
            ref={setWheelElement}
            title="Use mouse wheel to zoom the time axis"
          >
            {renderMetricsChart(selectedMetrics, "generic-device-chart", true)}
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
