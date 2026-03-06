import { useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDeviceHistory, useRealtime } from "../hooks/queries";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, CartesianGrid, Brush, ReferenceLine } from "recharts";
import { motion } from "framer-motion";
import { useMotionPreset } from "../utils/motion";
import { extractPressMetrics, getEnvValues } from "../utils/metrics";

const HEARTBEAT_THRESHOLD_MS = 10_000;
const POLLING_GRANULARITY_MS = 5_000;
const OFFLINE_AFTER_MS = HEARTBEAT_THRESHOLD_MS + POLLING_GRANULARITY_MS;

function toLocalStart(val: string) {
  const [y, m, d] = val.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d).getTime();
}
function toLocalEnd(val: string) {
  const [y, m, d] = val.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export default function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const motionPreset = useMotionPreset();
  const [mode, setMode] = useState<"live" | "history">("live");
  const [liveSeries, setLiveSeries] = useState<any[]>([]);
  const [thresholds, setThresholds] = useState<{ low: string; high: string }>({ low: "", high: "" });
  const lastTsRef = useRef<number | null>(null);
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const realtime = useRealtime({
    enabled: mode === "live",
    refetchInterval: mode === "live" ? 5000 : false,
  });
  const query = useDeviceHistory(id || "", toLocalStart(range.start), toLocalEnd(range.end));
  const liveItem = useMemo(() => {
    const items = realtime.data?.items ?? [];
    return items.find((d) => String(d.deviceId) === String(id));
  }, [realtime.data?.items, id]);
  const liveStatusTag = String(liveItem?._onlineStatus ?? "").trim().toLowerCase();
  const liveOnlineFromState =
    liveStatusTag === "online" || liveStatusTag === "stale"
      ? true
      : liveStatusTag === "offline"
      ? false
      : undefined;
  const liveTs = Number(liveItem?.ts);
  const heartbeatTs = Number(liveItem?._lastHeartbeatTs ?? liveTs);
  const isLiveOnline =
    typeof liveOnlineFromState === "boolean"
      ? liveOnlineFromState
      : Number.isFinite(liveTs)
      ? Date.now() - liveTs <= OFFLINE_AFTER_MS
      : true;
  const lastSeen = Number.isFinite(heartbeatTs) ? new Date(heartbeatTs).toLocaleString() : "unknown";

  useEffect(() => {
    if (mode !== "live") return;
    setLiveSeries([]);
    lastTsRef.current = null;
  }, [id, mode]);

  useEffect(() => {
    if (mode !== "live") return;
    const items = realtime.data?.items ?? [];
    const match = items.find((d) => String(d.deviceId) === String(id));
    if (!match) return;
    const ts = Number(match.ts ?? Date.now());
    if (lastTsRef.current === ts) return;
    lastTsRef.current = ts;
    setLiveSeries((prev) => {
      const next = [...prev, { ...match, ts }];
      return next.slice(-30);
    });
  }, [realtime.data?.items, id, mode]);

  const source = mode === "live" ? liveSeries : (query.data ?? []);
  const chartData = useMemo(() => (source ?? []).map((r) => ({
    ...r,
    time: r.ts ? new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
  })), [source]);
  const pressIds = useMemo(
    () => Array.from(new Set(chartData.flatMap((r) => extractPressMetrics(r).map((p) => p.id)))).sort((a, b) => Number(a) - Number(b)),
    [chartData]
  );
  const hasPress = pressIds.length > 0;
  const lowThreshold = Number(thresholds.low);
  const highThreshold = Number(thresholds.high);
  const hasLow = Number.isFinite(lowThreshold);
  const hasHigh = Number.isFinite(highThreshold);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="glass rounded-xl px-4 py-3 border border-white/5">
          <p className="text-xs text-slate-400">Device</p>
          <p className="text-lg font-semibold">{id}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="glass rounded-xl px-3 py-2 border border-white/5">From
            <input className="bg-transparent ml-2 focus:outline-none" type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} />
          </label>
          <label className="glass rounded-xl px-3 py-2 border border-white/5">To
            <input className="bg-transparent ml-2 focus:outline-none" type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} />
          </label>
          <button onClick={() => { setMode("live"); }} className={`px-3 py-2 rounded-xl font-semibold border ${mode === "live" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-600 border-blue-200"}`}>Live</button>
          <button onClick={() => { setMode("history"); query.refetch(); }} className={`px-3 py-2 rounded-xl font-semibold border ${mode === "history" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-600 border-blue-200"}`}>Search History</button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="flex flex-col">
            Low threshold {hasPress ? "(A)" : ""}
            <input
              value={thresholds.low}
              onChange={(e) => setThresholds((t) => ({ ...t, low: e.target.value }))}
              className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel w-28"
              placeholder="e.g. 0.5"
            />
          </label>
          <label className="flex flex-col">
            High threshold {hasPress ? "(A)" : ""}
            <input
              value={thresholds.high}
              onChange={(e) => setThresholds((t) => ({ ...t, high: e.target.value }))}
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
          </div>
          {query.isLoading && <span className="text-xs text-slate-400">Loading…</span>}
        </div>
        {mode === "live" && !isLiveOnline ? (
          <div className="rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-sm text-slate-400">
            Device is offline. Live telemetry is unavailable. Last seen: {lastSeen}.
          </div>
        ) : chartData.length === 0 ? (
          <p className="text-sm text-slate-400">{mode === "live" ? "Waiting for live data..." : "No data for selected window."}</p>
        ) : (() => {
          if (hasPress) {
            return (
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                    <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#94a3b8" width={52} tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
                      labelStyle={{ color: "#0f172a" }}
                      formatter={(value: any) =>
                        Number.isFinite(Number(value)) ? Number(value).toFixed(2) : value
                      }
                    />
                    <Legend />
                    {hasLow && (
                      <ReferenceLine y={lowThreshold} stroke="#f97316" strokeDasharray="6 4" label={{ value: `Low ${lowThreshold}`, position: "right", fill: "#f97316", fontSize: 11 }} />
                    )}
                    {hasHigh && (
                      <ReferenceLine y={highThreshold} stroke="#dc2626" strokeDasharray="6 4" label={{ value: `High ${highThreshold}`, position: "right", fill: "#dc2626", fontSize: 11 }} />
                    )}
                    {pressIds.map((pid, idx) => (
                      <Line
                        key={pid}
                        type="monotone"
                        dataKey={(d: any) => {
                          const p = extractPressMetrics(d).find((pp) => pp.id === pid);
                          return p ? p.amps : 0;
                        }}
                        name={`Phase ${pid} Amps`}
                        stroke={["#2563eb", "#16a34a", "#f59e0b", "#dc2626"][idx % 4]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                    <Brush dataKey="time" height={24} stroke="#2563eb" travellerWidth={12} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          }
          return (
            <div className="h-72">
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="temp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="hum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                  <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" width={52} tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
                    labelStyle={{ color: "#0f172a" }}
                    formatter={(value: any) =>
                      Number.isFinite(Number(value)) ? Number(value).toFixed(2) : value
                    }
                  />
                  <Legend />
                  {hasLow && (
                    <ReferenceLine y={lowThreshold} stroke="#f97316" strokeDasharray="6 4" label={{ value: `Low ${lowThreshold}`, position: "right", fill: "#f97316", fontSize: 11 }} />
                  )}
                  {hasHigh && (
                    <ReferenceLine y={highThreshold} stroke="#dc2626" strokeDasharray="6 4" label={{ value: `High ${highThreshold}`, position: "right", fill: "#dc2626", fontSize: 11 }} />
                  )}
                  <Area type="monotone" dataKey={(d: any) => getEnvValues(d).temperature ?? 0} name="Temp (°C)" stroke="#2563eb" fill="url(#temp)" strokeWidth={2} />
                  <Area type="monotone" dataKey={(d: any) => getEnvValues(d).humidity ?? 0} name="Humidity (%)" stroke="#0d9488" fill="url(#hum)" strokeWidth={2} />
                  <Brush dataKey="time" height={24} stroke="#2563eb" travellerWidth={12} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          );
        })()}
      </motion.div>
    </div>
  );
}
