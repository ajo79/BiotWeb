import { useAnalytics } from "../hooks/queries";
import MetricCard from "../components/MetricCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import WifiIcon from "../components/WifiIcon";
import { rssiLabel, rssiToBars, wifiLabel } from "../utils/wifi";
import { useAuth } from "../auth/auth";
import { getSiteConfig } from "../config/sites";
import { useDashboard } from "../hooks/queries";
import { buildAllowedDeviceIdSet } from "../utils/accessPolicy";

function classify(item: any) {
  const statusTag = String(item?._onlineStatus ?? "").trim().toLowerCase();
  const onlineFromState =
    statusTag === "online" || statusTag === "stale"
      ? true
      : statusTag === "offline"
      ? false
      : undefined;
  const ts = Number(item?.ts);
  const online = typeof onlineFromState === "boolean" ? onlineFromState : Number.isFinite(ts) ? Date.now() - ts <= 15_000 : true;
  const keys = ["common issue", "common issues", "common alarm", "commonalarm", "common_issue"];
  const lower: Record<string, any> = {};
  Object.entries(item || {}).forEach(([k, v]) => {
    lower[String(k).toLowerCase()] = v;
  });
  const commonIssue = keys.some((key) => {
    if (!(key in lower)) return false;
    const value = lower[key];
    if (typeof value === "boolean") return value;
    const n = Number(value);
    if (Number.isFinite(n)) return n !== 0;
    return Boolean(value);
  });
  return { online, category: !online || commonIssue ? "issue" : "good" };
}

export default function AnalyticsPage() {
  const { data, isLoading } = useAnalytics();
  const { state } = useAuth();
  const activeSite = getSiteConfig(state.siteKey);
  const dashboard = useDashboard();
  const allowedDeviceIds = buildAllowedDeviceIdSet(
    dashboard.data?.RealTimeDataMonitor ?? [],
    state
  );
  const summarySource = Array.from(
    new Map(
      (dashboard.data?.RealTimeDataMonitor ?? [])
        .filter((row: any) => allowedDeviceIds.has(String(row?.deviceId ?? "").trim()))
        .map((row: any) => [String(row.deviceId).trim().toUpperCase(), row])
    ).values()
  );
  const filteredSummary = summarySource.reduce(
    (acc, row) => {
      const result = classify(row);
      acc.total += 1;
      if (result.online) acc.online += 1;
      if (result.category === "good") acc.good += 1;
      else acc.issue += 1;
      return acc;
    },
    { total: 0, online: 0, good: 0, issue: 0 }
  );
  const filteredUptime = (data?.uptime ?? []).filter((row: any) =>
    allowedDeviceIds.has(String(row?.deviceId ?? "").trim())
  );
  const uptimeChart = filteredUptime.slice(0, 12).map((d: any) => ({ deviceId: d.deviceId, uptime: Math.round(d.uptime * 100) }));
  const filteredAnomalies = (data?.anomalies ?? []).filter((row: any) =>
    allowedDeviceIds.has(String(row?.deviceId ?? "").trim())
  );
  const filteredAlarmCount = Object.entries(data?.alarms ?? {}).reduce((sum, [deviceId, count]) => {
    if (!allowedDeviceIds.has(String(deviceId).trim())) return sum;
    return sum + Number(count || 0);
  }, 0);
  const formatWindow = (ms?: number) => {
    const n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "--";
    const totalMinutes = Math.floor(n / 60000);
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 48) return `${totalHours}h`;
    const days = Math.floor(totalHours / 24);
    const remH = totalHours % 24;
    return remH ? `${days}d ${remH}h` : `${days}d`;
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Devices" value={filteredUptime.length || "--"} sub="seen in history" />
        <MetricCard title="Good vs Issue" value={`${filteredSummary.good}/${filteredSummary.issue}`} sub="current snapshot" accent="#0EA5E9" />
        <MetricCard title="Open alarms" value={filteredAlarmCount} sub="total records" accent="#F97316" />
        <MetricCard title="Anomalies" value={filteredAnomalies.length ?? 0} sub={activeSite.features.showEnvironmentMetrics ? "temp/humidity/offline" : "meter/offline"} accent="#F43F5E" />
      </div>

      <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-slate-400">Availability</p>
            <h2 className="text-xl font-semibold">Uptime by Device</h2>
          </div>
          {isLoading && <span className="text-xs text-slate-400">Calculating…</span>}
        </div>
        {uptimeChart.length === 0 ? (
          <p className="text-sm text-slate-400">No history yet.</p>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={uptimeChart} margin={{ left: -10 }}>
                  <XAxis dataKey="deviceId" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1f2937" }} labelStyle={{ color: "#e2e8f0" }} formatter={(v) => `${v}%`} />
                  <Bar dataKey="uptime" fill="#22c55e" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 border-t border-white/5 pt-3 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2 text-left">Device</th>
                    <th className="px-3 py-2 text-left">Uptime</th>
                    <th className="px-3 py-2 text-left">Window</th>
                    <th className="px-3 py-2 text-left">Samples</th>
                    <th className="px-3 py-2 text-left">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUptime.map((row: any) => {
                    const rssi = Number(row?.rssi);
                    const hasRssi = Number.isFinite(rssi);
                    const bars = hasRssi ? rssiToBars(rssi) : row?.wifiStrength;
                    const signalLabel = hasRssi ? `${Math.round(rssi)} dBm` : wifiLabel(row?.wifiStrength);
                    const signalQuality = hasRssi ? rssiLabel(rssi) : Number.isFinite(Number(row?.wifiStrength)) ? `Level ${Math.round(Number(row?.wifiStrength))}/4` : "Unknown";
                    return (
                      <tr key={row.deviceId} className="border-t border-white/5 hover:bg-white/5">
                        <td className="px-3 py-2 font-semibold text-slate-200">{row.deviceId}</td>
                        <td className="px-3 py-2 text-slate-200">{Math.round((row.uptime ?? 0) * 100)}%</td>
                        <td className="px-3 py-2 text-slate-300">{formatWindow(row.windowMs)}</td>
                        <td className="px-3 py-2 text-slate-300">{row.readingCount ?? 0}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <WifiIcon strength={bars} size={18} />
                            <div className="leading-tight">
                              <p className="text-slate-200 text-sm">{signalLabel}</p>
                              <p className="text-xs text-slate-500">{signalQuality}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-slate-400">Anomaly queue</p>
            <h2 className="text-xl font-semibold">Devices needing attention</h2>
          </div>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredAnomalies.map((a: any, idx: number) => (
            <div key={idx} className="glass rounded-xl p-3 border border-white/5">
              <p className="text-sm font-semibold">{a.deviceId}</p>
              <p className="text-xs text-slate-400">Score {a.score}</p>
              <p className="text-xs text-slate-500">{a.ts ? new Date(a.ts).toLocaleString() : ""}</p>
            </div>
          ))}
          {(!filteredAnomalies || filteredAnomalies.length === 0) && <p className="text-slate-400 text-sm">No anomalies detected right now.</p>}
        </div>
      </div>
    </div>
  );
}
