import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import MetricCard from "../components/MetricCard";
import { useDashboard, useRealtime } from "../hooks/queries";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMotionPreset } from "../utils/motion";
import { extractPressMetrics, getEnvValues } from "../utils/metrics";
import { getWifiStrength } from "../utils/wifi";
import { formatTwoDecimals } from "../utils/numberFormat";
import WifiIcon from "../components/WifiIcon";
import { StatusPill } from "../components/StatusPill";

const COLORS = ["#16A34A", "#F97316", "#0EA5E9", "#E2E8F0"];
const HEARTBEAT_THRESHOLD_MS = 10_000;
const POLLING_GRANULARITY_MS = 5_000;
const OFFLINE_AFTER_MS = HEARTBEAT_THRESHOLD_MS + POLLING_GRANULARITY_MS;

function classify(item: any) {
  const statusTag = String(item?._onlineStatus ?? "").trim().toLowerCase();
  const onlineFromState =
    statusTag === "online" || statusTag === "stale"
      ? true
      : statusTag === "offline"
      ? false
      : undefined;
  const ts = Number(item?.ts);
  const online = typeof onlineFromState === "boolean" ? onlineFromState : Number.isFinite(ts) ? Date.now() - ts <= OFFLINE_AFTER_MS : true;
  const keys = [
    "Common Issue",
    "Common Issues",
    "Common Alarm",
    "CommonAlarm",
    "Common_Issue",
    "Common_Alarm",
    "common_issue",
    "common alarm",
    "common issue",
    "commonAlarm",
    "commonIssue",
  ];
  const lower: Record<string, any> = {};
  Object.entries(item || {}).forEach(([k, v]) => {
    lower[String(k).toLowerCase()] = v;
  });
  const commonIssue = keys.some((k) => {
    const lk = k.toLowerCase();
    if (!(lk in lower)) return false;
    const v = lower[lk];
    if (typeof v === "boolean") return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n !== 0;
    return Boolean(v);
  });
  const category = !online || commonIssue ? "issue" : "good";
  return { online, commonIssue, category };
}

function buildSummary(items: any[] = []) {
  const total = items.length;
  let online = 0;
  let good = 0;
  let issue = 0;
  items.forEach((item) => {
    const { online: on, category } = classify(item);
    if (on) online += 1;
    if (category === "good") good += 1;
    else issue += 1;
  });
  return { total, online, good, issue };
}

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const realtime = useRealtime();
  const navigate = useNavigate();
  const motionPreset = useMotionPreset();
  const realtimeItems = useMemo(() => {
    const items = realtime.data?.realtimeItems ?? [];
    return [...items].sort((a, b) => String(a.deviceId ?? "").localeCompare(String(b.deviceId ?? "")));
  }, [realtime.data?.realtimeItems]);
  const realtimeSummary = useMemo(() => {
    if (!realtimeItems.length) return null;
    return buildSummary(realtimeItems);
  }, [realtimeItems]);
  const summary = realtimeSummary ?? data?.summary ?? { total: 0, online: 0, good: 0, issue: 0 };
  const pct = (value: number) => (summary.total ? Math.round((value / summary.total) * 100) : 0);
  const pieData = [
    { name: "Good", value: summary.good },
    { name: "Issue", value: summary.issue }
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Devices"
          value={summary.total}
          sub={realtimeSummary ? "reporting now" : "Known to platform"}
          accent="#2563eb"
          progress={summary.total ? 100 : 0}
          onClick={() => navigate("/devices?filter=all")}
        />
        <MetricCard title="Online" value={summary.online} sub="heartbeat ≤10s" accent="#16a34a" progress={pct(summary.online)} onClick={() => navigate("/devices?filter=online")} />
        <MetricCard title="Good" value={summary.good} sub="no common alarms" accent="#0284c7" progress={pct(summary.good)} onClick={() => navigate("/devices?filter=good")} />
        <MetricCard title="Issue" value={summary.issue} sub="offline or alarm" accent="#dc2626" progress={pct(summary.issue)} onClick={() => navigate("/devices?filter=issue")} />
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4 items-stretch">
        <div className="glass rounded-2xl p-5 shadow-ambient border border-white/5 relative pb-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-blue-600">Live devices</p>
              <h2 className="text-xl font-semibold">Realtime Feed</h2>
            </div>
            <span className="text-xs text-blue-600">auto 5s</span>
          </div>
          <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
            {realtimeItems.slice(0, 12).map((item) => {
              const state = classify(item);
              const presses = extractPressMetrics(item);
              const env = getEnvValues(item);
              const wifi = state.online ? getWifiStrength(item) : undefined;
              return (
                <motion.div
                  key={`${item.deviceId}`}
                  {...motionPreset}
                  className="rounded-xl border border-white/5 p-3 glass flex items-center justify-between gap-4"
                >
                  <div className="min-w-[140px]">
                    <p className="font-semibold leading-5">{item.deviceName || item.deviceId}</p>
                    <p className="text-xs text-slate-600">{item.deviceId}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <WifiIcon strength={wifi} offline={!state.online} />
                      {!state.online && <span className="text-xs text-slate-500">Offline</span>}
                    </div>
                  </div>
                  {presses.length ? (
                    <div className="text-right text-sm min-w-[170px] leading-6 space-y-1">
                      {presses.slice(0, 3).map((p) => (
                        <div key={p.id} className="flex justify-end gap-2">
                      <span className="text-slate-600 font-semibold">Phase {p.id}:</span>
                          <span className="text-blue-700 font-semibold">{p.amps.toFixed(2)} A</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-right text-sm min-w-[120px] leading-6">
                      <p className="text-blue-700 font-semibold">{formatTwoDecimals(env.temperature)}°C</p>
                      <p className="text-teal-600 font-semibold">{formatTwoDecimals(env.humidity)}%</p>
                    </div>
                  )}
                </motion.div>
              );
            })}
            {realtime.isLoading && <p className="text-blue-600 text-sm">Loading realtime...</p>}
          </div>
        </div>

        <div className="glass rounded-2xl p-5 shadow-ambient border border-white/5 relative">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-blue-600">Fleet health</p>
              <h2 className="text-xl font-semibold">Health Breakdown</h2>
            </div>
          </div>
          {isLoading || !pieData.length ? (
            <p className="text-blue-600 text-sm">Waiting for data...</p>
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={4}>
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="absolute left-4 bottom-3 flex gap-3 flex-wrap items-center text-sm">
                {pieData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }}></span>
                    <span>{d.name}: {d.value}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
