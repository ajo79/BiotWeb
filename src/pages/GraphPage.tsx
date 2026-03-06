import { useEffect, useMemo, useState } from "react";
import { useRealtime } from "../hooks/queries";
import { useDeviceHistory } from "../hooks/queries";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, CartesianGrid, Brush, ReferenceLine } from "recharts";
import { extractPressMetrics, getEnvValues } from "../utils/metrics";

const HEARTBEAT_THRESHOLD_MS = 10_000;
const POLLING_GRANULARITY_MS = 5_000;
const OFFLINE_AFTER_MS = HEARTBEAT_THRESHOLD_MS + POLLING_GRANULARITY_MS;
const LIVE_WINDOW_MS = 30 * 60 * 1000;
const LIVE_MAX_POINTS = 360;

const normalizeTimestamp = (ts?: number) => {
  const n = Number(ts);
  if (!Number.isFinite(n)) return undefined;
  if (n > 0 && n < 1_000_000_000_000) return n * 1000;
  return n;
};
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
  const ts = normalizeTimestamp(item?.ts);
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
  const [thresholds, setThresholds] = useState<{ low: string; high: string }>({ low: "", high: "" });
  const [refreshAnimating, setRefreshAnimating] = useState(false);
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 1);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
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
    const deviceTs = normalizeTimestamp(reading?.ts);
    const sampleTs = Date.now();
    setLiveSeries((prev) => {
      const lastSampleTs = Number(prev.at(-1)?.sampleTs ?? prev.at(-1)?.ts);
      if (Number.isFinite(lastSampleTs) && sampleTs <= lastSampleTs) return prev;
      const next = [...prev, { ...reading, ts: deviceTs ?? reading?.ts, sampleTs }];
      const cutoff = Date.now() - LIVE_WINDOW_MS;
      const filtered = next.filter((r) => Number(r?.sampleTs ?? r?.ts) >= cutoff);
      return filtered.slice(-LIVE_MAX_POINTS);
    });
  }, [mode, liveItems, selectedId, liveTick]);

  useEffect(() => {
    if (mode === "live") setLiveSeries([]);
  }, [mode, selectedId]);

  const history = useDeviceHistory(
    mode === "history" ? selectedId : "",
    toLocalStart(range.start),
    toLocalEnd(range.end)
  );

  const deviceOptions = allDeviceOptions;
  const historyData = useMemo(
    () => (history.data ?? []).map((r) => ({ ...r, time: r.ts ? new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "" })),
    [history.data]
  );
  const liveData = useMemo(
    () => liveSeries.map((r) => {
      const ts = Number(r?.sampleTs ?? r?.ts);
      return { ...r, time: ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "" };
    }),
    [liveSeries]
  );
  const chartData = mode === "live" ? liveData : historyData;

  const selected = realtime.data?.items?.find((d) => d.deviceId === selectedId);
  const status = selected ? classify(selected) : { online: true, commonIssue: false };
  const lastSeen = selected?.ts ? new Date(selected.ts).toLocaleString() : "unknown";

  const pressIds = useMemo(() => {
    const ids = new Set<string>();
    chartData.forEach((r) => {
      extractPressMetrics(r).forEach((p) => ids.add(p.id));
    });
    return Array.from(ids).sort((a, b) => Number(a) - Number(b));
  }, [chartData]);
  const isPress = pressIds.length > 0;
  const showLabels = chartData.length <= 20;
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
    const f = (v: number) => v.toFixed(2);
    return { min: f(min), max: f(max), avg: f(avg) };
  };

  const stats = useMemo<Stats>(() => {
    if (isPress) {
      const perPhase: Record<string, StatSummary> = {};
      pressIds.forEach((pid) => {
        const vals = chartData.map((r) => {
          const p = extractPressMetrics(r).find((x) => x.id === pid);
          return p ? p.amps : NaN;
        });
        perPhase[pid] = computeStats(vals);
      });
      return { type: "press", perPhase };
    }
    const tempVals = chartData.map((r) => getEnvValues(r).temperature ?? NaN);
    const humVals = chartData.map((r) => getEnvValues(r).humidity ?? NaN);
    return { type: "env", temp: computeStats(tempVals), hum: computeStats(humVals) };
  }, [chartData, isPress, pressIds]);

  const DotWithLabel = (props: any) => {
    const { cx, cy, value } = props;
    if (!showLabels || !Number.isFinite(value) || cx == null || cy == null) {
      return <circle cx={cx} cy={cy} r={2} fill="#2563eb" />;
    }
    return (
      <g>
        <circle cx={cx} cy={cy} r={2.5} fill="#2563eb" />
        <text x={cx} y={cy - 8} fontSize="10" textAnchor="middle" fill="#0f172a">
          {Number(value).toFixed(2)}
        </text>
      </g>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload ?? {};
    const ts = row?.sampleTs ?? row?.ts;
    const dt = ts ? new Date(ts).toLocaleString() : label;
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow">
        <div className="font-semibold text-slate-900">{dt}</div>
        {row?.sampleTs && row?.ts && row.sampleTs !== row.ts && (
          <div className="text-[11px] text-slate-500">Device time: {new Date(row.ts).toLocaleString()}</div>
        )}
        <div className="mt-1 space-y-0.5">
          {payload.map((p: any, idx: number) => {
            const color = p.color || p.stroke || "#0f172a";
            const value = Number.isFinite(p.value) ? Number(p.value).toFixed(2) : p.value;
            return (
              <div key={idx} style={{ color }} className="flex items-center justify-between gap-3">
                <span className="font-semibold">{p.name}</span>
                <span>{value}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleHistoryRefresh = async () => {
    setRefreshAnimating(true);
    await history.refetch();
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
              className={`px-3 py-1.5 rounded-full text-sm border transition ${mode === chip.key ? "bg-blue-600 text-white border-blue-300" : "glass border-white/5"}`}
            >
              {chip.label}
            </button>
          ))}
          {mode === "live" && <span className="text-xs text-slate-400">auto-refresh 5s</span>}
        </div>
        <div className="flex flex-col text-sm">
          <label className="text-slate-400">Device</label>
          <select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} className="mt-1 glass rounded-lg px-3 py-2 border border-white/5 bg-panel">
            {deviceOptions.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>
        {mode === "history" && (
          <div className="flex items-center gap-2 text-sm">
            <label className="flex flex-col">From
              <input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel" />
            </label>
            <label className="flex flex-col">To
              <input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel" />
            </label>
          </div>
        )}
        <div className="text-sm text-slate-600">Status: <span className="text-slate-900">{status.online ? (status.commonIssue ? "Alarm" : "Online") : "Offline"}</span></div>
        {mode === "history" && (
          <button
            onClick={handleHistoryRefresh}
            className={`px-3 py-2 rounded-xl bg-blue-600 text-white font-semibold shadow-glow transition transform active:scale-95 ${
              refreshAnimating || history.isFetching ? "animate-pulse" : ""
            }`}
            disabled={history.isFetching}
          >
            <span className={`inline-block mr-1 ${history.isFetching ? "animate-spin" : ""}`}>↻</span>
            Refresh
          </button>
        )}
        {isPress && (
          <div className="flex items-center gap-2 text-sm">
            <label className="flex flex-col">
              Low threshold (A)
              <input
                value={thresholds.low}
                onChange={(e) => setThresholds((t) => ({ ...t, low: e.target.value }))}
                className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel w-28"
                placeholder="e.g. 0.5"
              />
            </label>
            <label className="flex flex-col">
              High threshold (A)
              <input
                value={thresholds.high}
                onChange={(e) => setThresholds((t) => ({ ...t, high: e.target.value }))}
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
          {mode === "history" && history.isLoading && <span className="text-xs text-slate-400">Loading…</span>}
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
          <div>Points: <span className="text-slate-900 font-semibold">{chartData.length}</span></div>
          <div>Mode: <span className="text-slate-900 font-semibold">{chartData.length === 0 ? "Device Metrics" : isPress ? "Press Amps" : "Env (Temp/Humidity)"}</span></div>
          {mode === "live" && (
            <div className="col-span-2 text-slate-500">Window: last {Math.round(LIVE_WINDOW_MS / 60000)} minutes</div>
          )}
          {stats.type === "press" ? (
            <div className="col-span-2 flex flex-wrap gap-3">
              {pressIds.map((pid) => (
                <div key={pid} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                  <span className="font-semibold text-slate-800">Phase {pid}</span>{" "}
                  <span>min {stats.perPhase[pid].min} / max {stats.perPhase[pid].max} / avg {stats.perPhase[pid].avg}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="col-span-2 flex flex-wrap gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <span className="font-semibold text-slate-800">Temp</span> min {stats.temp.min} / max {stats.temp.max} / avg {stats.temp.avg}
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <span className="font-semibold text-slate-800">Humidity</span> min {stats.hum.min} / max {stats.hum.max} / avg {stats.hum.avg}
              </div>
            </div>
          )}
        </div>
        {mode === "live" && !status.online ? (
          <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-400">
            Device is offline. Live telemetry is unavailable. Last seen: {lastSeen}.
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-slate-400">{mode === "live" ? (liveItems.length ? "Waiting for realtime points…" : "No realtime data available.") : "No data in this range."}</p>
        ) : (() => {
          if (isPress) {
            return (
              <div className="h-80">
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                    <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} label={{ value: "Amps", angle: -90, position: "insideLeft", fill: "#64748b" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
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
                      <Line key={pid} type="monotone" dataKey={(d: any) => {
                        const p = extractPressMetrics(d).find((pp) => pp.id === pid);
                        return p ? p.amps : 0;
                      }} name={`Phase ${pid} Amps`} stroke={["#2563eb", "#16a34a", "#f59e0b", "#dc2626"][idx % 4]} strokeWidth={2} dot={DotWithLabel} />
                    ))}
                    <Brush dataKey="time" height={24} stroke="#2563eb" travellerWidth={12} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          }
          return (
            <div className="h-80">
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 12 }} label={{ value: "Time", position: "insideBottom", offset: -4, fill: "#64748b" }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} label={{ value: "Value", angle: -90, position: "insideLeft", fill: "#64748b" }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
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
                  <Area type="monotone" dataKey={(d: any) => getEnvValues(d).temperature ?? 0} name="Temp (°C)" stroke="#2563eb" fill="#dbeafe" strokeWidth={2} dot={DotWithLabel} />
                  <Area type="monotone" dataKey={(d: any) => getEnvValues(d).humidity ?? 0} name="Humidity (%)" stroke="#0d9488" fill="#ccfbf1" strokeWidth={2} dot={DotWithLabel} />
                  <Brush dataKey="time" height={24} stroke="#2563eb" travellerWidth={12} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
