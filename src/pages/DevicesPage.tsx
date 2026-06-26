import { useEffect, useMemo, useState } from "react";
import { useAlarms, useRealtime } from "../hooks/queries";
import { StatusPill } from "../components/StatusPill";
import { motion, AnimatePresence } from "framer-motion";
import { useMotionPreset } from "../utils/motion";
import { useNavigate, useLocation } from "react-router-dom";
import { getWifiStrength } from "../utils/wifi";
import WifiIcon from "../components/WifiIcon";
import TelemetryParameterList from "../components/TelemetryParameterList";
import ShiftProductionPie from "../components/ShiftProductionPie";
import { useAuth } from "../auth/auth";
import { getSiteConfig } from "../config/sites";
import { filterRowsForSession } from "../utils/accessPolicy";
import { buildEnergyMetricGroups } from "../utils/energyMeter";
import EnergyMetricGroupCard from "../components/EnergyMetricGroupCard";
import { useAlarmAcknowledge } from "../hooks/useAlarmAcknowledge";
import { getOpenAlarmDeviceIds } from "../utils/alarmRows";

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
  const ciKeys = ["common issue", "common issues", "common alarm", "commonAlarm", "commonIssue"];
  const lower: Record<string, any> = {};
  Object.entries(item || {}).forEach(([k, v]) => (lower[String(k).toLowerCase()] = v));
  const commonIssue = ciKeys.some((k) => {
    if (!(k in lower)) return false;
    const v = lower[k];
    if (typeof v === "boolean") return v;
    const n = Number(v);
    if (Number.isFinite(n)) return n !== 0;
    return Boolean(v);
  });
  const category = !online || commonIssue ? "issue" : "good";
  return { online, commonIssue, category };
}

function isType002(item: any) {
  return String(item?.deviceType ?? "").trim().toLowerCase() === "type_002";
}

export default function DevicesPage() {
  const { data, isLoading } = useRealtime();
  const alarms = useAlarms();
  const { state } = useAuth();
  const activeSite = getSiteConfig(state.siteKey);
  const isEnergySite = activeSite.key === "ACME_ENERGY";
  const [filter, setFilter] = useState<"all" | "online" | "good" | "issue">("all");
  const navigate = useNavigate();
  const location = useLocation();
  const motionPreset = useMotionPreset();
  const { acknowledge, ackingByKey, feedbackByKey } = useAlarmAcknowledge();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const f = params.get("filter");
    if (f === "all" || f === "online" || f === "good" || f === "issue") {
      setFilter(f);
    }
  }, [location.search]);

  const items = useMemo(() => {
    const arr = filterRowsForSession(data?.items ?? [], state);
    const sorted = [...arr].sort((a, b) => String(a.deviceId ?? "").localeCompare(String(b.deviceId ?? "")));
    if (filter === "all") return sorted;
    if (filter === "online") return sorted.filter((it) => classify(it).online);
    return sorted.filter((it) => classify(it).category === filter);
  }, [data?.items, filter, state]);

  const openAlarmDeviceIds = useMemo(
    () => getOpenAlarmDeviceIds(alarms.data ?? []),
    [alarms.data]
  );

  const buildDeviceAlarmModel = (item: any, itemState: ReturnType<typeof classify>) => {
    const deviceId = String(item?.deviceId ?? "").trim();
    const isAckable =
      itemState.online &&
      itemState.commonIssue &&
      openAlarmDeviceIds.has(deviceId.toUpperCase());
    const ackKey = deviceId ? `device:${deviceId}` : "";
    return {
      isAckable,
      ackKey,
      feedback: ackKey ? feedbackByKey[ackKey] : undefined,
      isSending: ackKey ? Boolean(ackingByKey[ackKey]) : false,
    };
  };

  const renderDeviceActions = (item: any, itemState: ReturnType<typeof classify>, tone: "light" | "dark") => {
    const deviceId = String(item?.deviceId ?? "").trim();
    const alarm = buildDeviceAlarmModel(item, itemState);
    const graphButtonClass =
      tone === "light"
        ? "rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
        : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50";
    const ackButtonClass =
      tone === "light"
        ? `rounded-2xl border px-5 py-3 text-sm font-semibold shadow-sm transition ${
            alarm.isSending
              ? "cursor-not-allowed border-slate-300 bg-slate-200 text-slate-500"
              : "border-blue-300 bg-blue-500 text-white hover:border-blue-200 hover:bg-blue-400"
          }`
        : `rounded-xl border px-3 py-2 text-xs font-semibold transition ${
            alarm.isSending
              ? "cursor-not-allowed border-slate-500 bg-slate-700 text-slate-300"
              : "border-blue-300 bg-blue-500 text-white hover:border-blue-200 hover:bg-blue-400"
          }`;

    return (
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          onClick={() => navigate(`/devices/${encodeURIComponent(deviceId)}`)}
          className={graphButtonClass}
        >
          Graph
        </button>
        {alarm.isAckable ? (
          <button
            type="button"
            onClick={() => {
              void acknowledge(deviceId, alarm.ackKey);
            }}
            disabled={alarm.isSending}
            className={ackButtonClass}
          >
            {alarm.isSending ? "Sending ACK..." : "ACK"}
          </button>
        ) : null}
        {alarm.feedback ? (
          <p className={`basis-full text-[11px] ${tone === "light" ? "text-slate-500" : "text-slate-400"}`}>{alarm.feedback}</p>
        ) : null}
      </div>
    );
  };

  if (isEnergySite) {
    return (
      <div className="space-y-5">
        <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,_#f8fafc,_#ffffff)] p-5 shadow-ambient">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Meter Fleet</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">BlackStar Products Devices</h2>
              <p className="mt-1 text-sm text-slate-600">Modern live meter cards with device health, KPI groups, and direct meter access.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[{ key: "all", label: "All" }, { key: "online", label: "Online" }, { key: "good", label: "Healthy" }, { key: "issue", label: "Attention" }].map((chip) => (
                <button
                  key={chip.key}
                  onClick={() => setFilter(chip.key as any)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    filter === chip.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {chip.label}
                </button>
              ))}
              <span className="ml-2 text-xs text-slate-400">auto-refresh 5s</span>
            </div>
          </div>
        </div>

        <div className="grid gap-5">
          <AnimatePresence>
            {items.map((item) => {
              const itemState = classify(item);
              const wifi = itemState.online ? getWifiStrength(item) : undefined;
              const groups = buildEnergyMetricGroups(item).filter((group) => group.metrics.length);
              return (
                <motion.div
                  key={`${item.deviceId}`}
                  layout
                  {...motionPreset}
                  className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-ambient transition hover:-translate-y-1"
                >
                  <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_#f8fbff,_#ffffff)] px-5 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <p className="text-sm text-slate-400">{item.deviceId}</p>
                        <p className="text-2xl font-semibold text-slate-900">{item.deviceName || "Meter Device"}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <WifiIcon strength={wifi} offline={!itemState.online} />
                            <span className={`text-sm font-semibold ${itemState.online ? "text-emerald-700" : "text-rose-700"}`}>
                              {itemState.online ? "Online" : "Offline"}
                            </span>
                          </div>
                          <StatusPill
                            label={itemState.category === "good" ? "Healthy" : itemState.online ? "Alarm" : "Offline"}
                            tone={itemState.category === "good" ? "ok" : "issue"}
                          />
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                            {(item as any).deviceType || "type_003"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                          <span className="font-medium text-slate-400">Updated:</span>{" "}
                          <span className="font-semibold text-slate-700">{item.ts ? new Date(item.ts).toLocaleString() : "--"}</span>
                        </div>
                        {renderDeviceActions(item, itemState, "light")}
                      </div>
                    </div>
                  </div>

                  {!itemState.online ? (
                    <div className="px-5 py-5">
                      <div className="rounded-[1.5rem] border border-rose-100 bg-[linear-gradient(135deg,_#fff7f7,_#fff1f2)] px-4 py-4 text-sm text-rose-700">
                        Device is offline. Live telemetry is unavailable.
                      </div>
                    </div>
                  ) : groups.length ? (
                    <div className="px-5 py-5">
                      <div className="grid gap-4 xl:grid-cols-5">
                        {groups.map((group) => (
                          <EnergyMetricGroupCard
                            key={`${item.deviceId}-${group.key}`}
                            group={group}
                            subtitle={item.deviceName || item.deviceId}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="px-5 py-5">
                      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4">
                      <TelemetryParameterList item={item} maxVisible={6} />
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        {isLoading && <p className="text-slate-400 text-sm">Loading devices…</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[{ key: "all", label: "All" }, { key: "online", label: "Online" }, { key: "good", label: "Good" }, { key: "issue", label: "Issue" }].map((chip) => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key as any)}
            className={`px-3 py-1.5 rounded-full text-sm border transition ${filter === chip.key ? "bg-blue-600 text-white border-blue-300" : "glass border-white/5"}`}
          >
            {chip.label}
          </button>
        ))}
        <span className="text-xs text-slate-400">auto-refresh 5s</span>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <AnimatePresence>
          {items.map((item) => {
            const itemState = classify(item);
            const wifi = itemState.online ? getWifiStrength(item) : undefined;
            return (
              <motion.div
                key={`${item.deviceId}`}
                layout
                {...motionPreset}
                className="glass rounded-2xl p-4 border border-white/5 shadow-ambient hover:-translate-y-1 transition"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-400">{item.deviceId}</p>
                    <p className="text-lg font-semibold">{item.deviceName || "Device"}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <WifiIcon strength={wifi} offline={!itemState.online} />
                      {!itemState.online && <span className="text-xs text-slate-500">Offline</span>}
                    </div>
                  </div>
                  <StatusPill label={itemState.category === "good" ? "Healthy" : itemState.online ? "Alarm" : "Offline"} tone={itemState.category === "good" ? "ok" : "issue"} />
                </div>
                {!itemState.online ? (
                  <div className="mt-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-400">
                    Device is offline. Live telemetry is unavailable.
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                    <TelemetryParameterList item={item} maxVisible={4} />
                  </div>
                )}
                {activeSite.features.showShiftProduction && isType002(item) && (
                  <div className="mt-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
                    <ShiftProductionPie item={item} />
                  </div>
                )}
                <div className="mt-3">{renderDeviceActions(item, itemState, "dark")}</div>
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
