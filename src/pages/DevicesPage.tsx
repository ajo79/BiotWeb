import { useEffect, useMemo, useState } from "react";
import { useRealtime } from "../hooks/queries";
import { StatusPill } from "../components/StatusPill";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionPreset } from "../utils/motion";
import { useNavigate, useLocation } from "react-router-dom";
import { extractPressMetrics, getEnvValues } from "../utils/metrics";
import { getWifiStrength } from "../utils/wifi";
import { formatTwoDecimals } from "../utils/numberFormat";
import WifiIcon from "../components/WifiIcon";

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
  const ciKeys = [
    "common issue", "common issues", "common alarm", "commonAlarm", "commonIssue"
  ];
  const lower: Record<string, any> = {};
  Object.entries(item || {}).forEach(([k, v]) => lower[String(k).toLowerCase()] = v);
  const commonIssue = ciKeys.some((k) => {
    if (!(k in lower)) return false;
    const v = lower[k];
    if (typeof v === "boolean") return v;
    const n = Number(v); if (Number.isFinite(n)) return n !== 0;
    return Boolean(v);
  });
  const category = !online || commonIssue ? "issue" : "good";
  return { online, commonIssue, category };
}

export default function DevicesPage() {
  const { data, isLoading } = useRealtime();
  const [filter, setFilter] = useState<"all" | "online" | "good" | "issue">("all");
  const navigate = useNavigate();
  const location = useLocation();
  const motionPreset = useMotionPreset();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const f = params.get("filter");
    if (f === "all" || f === "online" || f === "good" || f === "issue") {
      setFilter(f);
    }
  }, [location.search]);

  const items = useMemo(() => {
    const arr = data?.items ?? [];
    const sorted = [...arr].sort((a, b) => String(a.deviceId ?? "").localeCompare(String(b.deviceId ?? "")));
    if (filter === "all") return sorted;
    if (filter === "online") return sorted.filter((it) => classify(it).online);
    return sorted.filter((it) => classify(it).category === filter);
  }, [data?.items, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[{ key: "all", label: "All" }, { key: "online", label: "Online" }, { key: "good", label: "Good" }, { key: "issue", label: "Issue" }].map((chip) => (
          <button key={chip.key} onClick={() => setFilter(chip.key as any)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${filter === chip.key ? "bg-blue-600 text-white border-blue-300" : "glass border-white/5"}`}>
            {chip.label}
          </button>
        ))}
        <span className="text-xs text-slate-400">auto-refresh 5s</span>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {items.map((item) => {
            const state = classify(item);
            const presses = extractPressMetrics(item);
            const env = getEnvValues(item);
            const wifi = state.online ? getWifiStrength(item) : undefined;
            return (
              <motion.div
                key={`${item.deviceId}`}
                layout
                {...motionPreset}
                className="glass rounded-2xl p-4 border border-white/5 shadow-ambient hover:-translate-y-1 transition cursor-pointer"
                onClick={() => navigate(`/devices/${encodeURIComponent(item.deviceId)}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-400">{item.deviceId}</p>
                    <p className="text-lg font-semibold">{item.deviceName || "Device"}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <WifiIcon strength={wifi} offline={!state.online} />
                      {!state.online && <span className="text-xs text-slate-500">Offline</span>}
                    </div>
                  </div>
                  <StatusPill label={state.category === "good" ? "Healthy" : state.online ? "Alarm" : "Offline"} tone={state.category === "good" ? "ok" : "issue"} />
                </div>
                {!state.online ? (
                  <div className="mt-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-400">
                    Device is offline. Live telemetry is unavailable.
                  </div>
                ) : presses.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    {presses.slice(0, 4).map((p) => (
                      <div key={p.id} className="glass rounded-xl p-3 border border-white/5">
                        <p className="text-slate-400 text-xs">Phase {p.id} Amps</p>
                        <p className="text-blue-700 text-lg font-semibold">{p.amps.toFixed(2)} A</p>
                      </div>
                    ))}
                  </div>
                ) : (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="glass rounded-xl p-3 border border-white/5">
                      <p className="text-slate-400 text-xs">Temperature</p>
                      <p className="text-blue-700 text-lg font-semibold">{formatTwoDecimals(env.temperature)}°C</p>
                    </div>
                    <div className="glass rounded-xl p-3 border border-white/5">
                      <p className="text-slate-400 text-xs">Humidity</p>
                      <p className="text-teal-600 text-lg font-semibold">{formatTwoDecimals(env.humidity)}%</p>
                    </div>
                  </div>
                )}
                <div className="mt-2 text-xs text-slate-400">Updated: {item.ts ? new Date(item.ts).toLocaleString() : "--"}</div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {isLoading && <p className="text-slate-400 text-sm">Loading devices…</p>}
    </div>
  );
}
