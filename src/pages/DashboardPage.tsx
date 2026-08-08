import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import MetricCard from "../components/MetricCard";
import EnergyKpiCard from "../components/EnergyKpiCard";
import { useDashboard, useRealtime } from "../hooks/queries";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMotionPreset } from "../utils/motion";
import { getWifiStrength } from "../utils/wifi";
import WifiIcon from "../components/WifiIcon";
import TelemetryParameterList from "../components/TelemetryParameterList";
import { useAuth } from "../auth/auth";
import { getSiteConfig } from "../config/sites";
import { filterRowsForSession } from "../utils/accessPolicy";
import { buildEnergyMetricGroups } from "../utils/energyMeter";

const COLORS = ["#16A34A", "#F97316", "#0EA5E9", "#E2E8F0"];
const HEALTH_COLOR_MAP: Record<string, string> = {
  "Online": "#16A34A", // green
  "Good": "#0284C7",   // blue
  "Issue": "#dc2626",  // red
};
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
  const online =
    typeof onlineFromState === "boolean" ? onlineFromState : Number.isFinite(ts) ? Date.now() - ts <= OFFLINE_AFTER_MS : true;
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
  const uniqueItems = Array.from(
    new Map(
      items
        .filter((item) => String(item?.deviceId ?? "").trim())
        .map((item) => [String(item.deviceId).trim().toUpperCase(), item])
    ).values()
  );
  const total = uniqueItems.length;
  let online = 0;
  let good = 0;
  let issue = 0;
  uniqueItems.forEach((item) => {
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
  const { state } = useAuth();
  const navigate = useNavigate();
  const motionPreset = useMotionPreset();
  const activeSite = getSiteConfig(state.siteKey);
  const isEnergySite = activeSite.key === "ACME_ENERGY";
  const [selectedDeviceId, setSelectedDeviceId] = useState("");

  const feedItems = useMemo(() => {
    const items = filterRowsForSession(realtime.data?.items ?? [], state);
    return [...items].sort((a, b) => String(a.deviceId ?? "").localeCompare(String(b.deviceId ?? "")));
  }, [realtime.data?.items, state]);

  useEffect(() => {
    if (!feedItems.length) return;
    if (!selectedDeviceId || !feedItems.some((item) => String(item.deviceId) === selectedDeviceId)) {
      setSelectedDeviceId(String(feedItems[0].deviceId));
    }
  }, [feedItems, selectedDeviceId]);

  const realtimeSummary = useMemo(() => {
    if (!feedItems.length) return null;
    return buildSummary(feedItems);
  }, [feedItems]);

  const fallbackSummary = useMemo(() => {
    return buildSummary(filterRowsForSession(data?.RealTimeDataMonitor ?? [], state));
  }, [data?.RealTimeDataMonitor, state]);

  const summary = realtimeSummary ?? fallbackSummary ?? { total: 0, online: 0, good: 0, issue: 0 };
  const pct = (value: number) => (summary.total ? Math.round((value / summary.total) * 100) : 0);
  const pieData = [
    { name: "Online", value: summary.online },
    { name: "Good", value: summary.good },
    { name: "Issue", value: summary.issue },
  ].filter((d) => d.value > 0);

  if (isEnergySite) {
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
          <MetricCard
            title="Online"
            value={summary.online}
            sub="heartbeat ≤10s"
            accent="#16a34a"
            progress={pct(summary.online)}
            onClick={() => navigate("/devices?filter=online")}
          />
          <MetricCard
            title="Good"
            value={summary.good}
            sub="no common alarms"
            accent="#0284c7"
            progress={pct(summary.good)}
            onClick={() => navigate("/devices?filter=good")}
          />
          <MetricCard
            title="Issue"
            value={summary.issue}
            sub="offline or alarm"
            accent="#dc2626"
            progress={pct(summary.issue)}
            onClick={() => navigate("/devices?filter=issue")}
          />
        </div>

        <div className="grid lg:grid-cols-[1.35fr_0.95fr] gap-4 items-stretch">
          <section className="rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_34%),linear-gradient(135deg,_#ffffff,_#f8fafc)] p-5 shadow-ambient">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Realtime Meters</p>
                <h3 className="text-2xl font-semibold text-slate-900">Live Meter Feed</h3>
              </div>
            </div>

            <div className="space-y-4">
              {feedItems.map((item) => {
                const itemState = classify(item);
                const wifi = itemState.online ? getWifiStrength(item) : undefined;
                const groups = buildEnergyMetricGroups(item);
                return (
                  <motion.div
                    key={String(item.deviceId)}
                    {...motionPreset}
                    className="rounded-[1.8rem] border border-slate-200 bg-white/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-2xl font-semibold text-slate-900">{item.deviceName || item.deviceId}</p>
                        <p className="text-sm text-slate-500">{item.deviceId}</p>
                        <div className="mt-3 flex items-center gap-2">
                          <WifiIcon strength={wifi} offline={!itemState.online} />
                          <span className={`text-sm font-semibold ${itemState.online ? "text-emerald-700" : "text-rose-700"}`}>
                            {itemState.online ? "Online" : "Offline"}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                        onClick={() => navigate(`/devices/${encodeURIComponent(item.deviceId)}`)}
                      >
                        Open Meter
                      </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {groups.map((group) => (
                        <EnergyKpiCard
                          key={`${item.deviceId}-${group.key}`}
                          title={group.title}
                          tone={group.tone}
                          primary={group.primary}
                          metrics={group.metrics}
                          layout={group.layout}
                          showPrimary={false}
                        />
                      ))}
                    </div>
                  </motion.div>
                );
              })}
              {realtime.isLoading && <p className="text-slate-400 text-sm">Loading realtime...</p>}
            </div>
          </section>

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
                          <Cell key={`cell-${index}`} fill={HEALTH_COLOR_MAP[entry.name] || COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="absolute left-4 bottom-3 flex gap-3 flex-wrap items-center text-sm">
                  {pieData.map((d, i) => (
                    <span key={d.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: HEALTH_COLOR_MAP[d.name] || COLORS[i % COLORS.length] }}></span>
                      <span>
                        {d.name}: {d.value}
                      </span>
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
        <MetricCard
          title="Online"
          value={summary.online}
          sub="heartbeat ≤10s"
          accent="#16a34a"
          progress={pct(summary.online)}
          onClick={() => navigate("/devices?filter=online")}
        />
        <MetricCard
          title="Good"
          value={summary.good}
          sub="no common alarms"
          accent="#0284c7"
          progress={pct(summary.good)}
          onClick={() => navigate("/devices?filter=good")}
        />
        <MetricCard
          title="Issue"
          value={summary.issue}
          sub="offline or alarm"
          accent="#dc2626"
          progress={pct(summary.issue)}
          onClick={() => navigate("/devices?filter=issue")}
        />
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4 items-stretch">
        <div className="glass rounded-2xl p-5 shadow-ambient border border-white/5 relative pb-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-blue-600">Live devices</p>
              <h2 className="text-xl font-semibold">
                {activeSite.features.showEnergyMeterFocusCopy ? "Meter Feed" : "Realtime Feed"}
              </h2>
            </div>
            <span className="text-xs text-blue-600">auto 5s</span>
          </div>
          <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
            {feedItems.map((item) => {
              const itemState = classify(item);
              const wifi = itemState.online ? getWifiStrength(item) : undefined;
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
                      <WifiIcon strength={wifi} offline={!itemState.online} />
                      {!itemState.online && <span className="text-xs text-slate-500">Offline</span>}
                    </div>
                  </div>
                  <TelemetryParameterList item={item} align="right" className="min-w-[220px]" maxVisible={4} />
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
                        <Cell key={`cell-${index}`} fill={HEALTH_COLOR_MAP[entry.name] || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="absolute left-4 bottom-3 flex gap-3 flex-wrap items-center text-sm">
                {pieData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: HEALTH_COLOR_MAP[d.name] || COLORS[i % COLORS.length] }}></span>
                    <span>
                      {d.name}: {d.value}
                    </span>
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
