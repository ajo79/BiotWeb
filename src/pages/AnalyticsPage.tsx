import { useAnalytics } from "../hooks/queries";
import MetricCard from "../components/MetricCard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import WifiIcon from "../components/WifiIcon";
import { rssiLabel, rssiToBars, wifiLabel } from "../utils/wifi";

export default function AnalyticsPage() {
  const { data, isLoading } = useAnalytics();
  const uptimeChart = (data?.uptime ?? []).slice(0, 12).map((d: any) => ({ deviceId: d.deviceId, uptime: Math.round(d.uptime * 100) }));
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
        <MetricCard title="Devices" value={data?.totalDevices ?? "--"} sub="seen in history" />
        <MetricCard title="Good vs Issue" value={`${data?.summary?.good ?? 0}/${data?.summary?.issue ?? 0}`} sub="current snapshot" accent="#0EA5E9" />
        <MetricCard title="Open alarms" value={Object.values(data?.alarms ?? {}).reduce((a: any, b: any) => a + (b as number), 0) || 0} sub="total records" accent="#F97316" />
        <MetricCard title="Anomalies" value={data?.anomalies?.length ?? 0} sub="temp/humidity/offline" accent="#F43F5E" />
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
                  {(data?.uptime ?? []).map((row: any) => {
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
          {(data?.anomalies ?? []).map((a: any, idx: number) => (
            <div key={idx} className="glass rounded-xl p-3 border border-white/5">
              <p className="text-sm font-semibold">{a.deviceId}</p>
              <p className="text-xs text-slate-400">Score {a.score}</p>
              <p className="text-xs text-slate-500">{a.ts ? new Date(a.ts).toLocaleString() : ""}</p>
            </div>
          ))}
          {(!data?.anomalies || data.anomalies.length === 0) && <p className="text-slate-400 text-sm">No anomalies detected right now.</p>}
        </div>
      </div>
    </div>
  );
}
