import { useMemo } from "react";
import { useAlarms } from "../hooks/queries";
import { mergeAlarmRows } from "../utils/alarmRows";
import { useAuth } from "../auth/auth";
import { filterAlarmRowsForSession } from "../utils/accessPolicy";

export default function AlarmsPage() {
  const { data, isLoading } = useAlarms();
  const { state } = useAuth();

  const rows = useMemo(() => {
    const visibleAlarms = filterAlarmRowsForSession(data, state);
    return mergeAlarmRows(visibleAlarms).sort((a, b) => {
      const aTs = Number(a.activeTs ?? 0);
      const bTs = Number(b.activeTs ?? 0);
      return bTs - aTs;
    });
  }, [data, state]);

  return (
    <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold">Alarm Console</h2>
        </div>
        {isLoading && <span className="text-xs text-slate-400">Refreshing…</span>}
      </div>
      <div className="overflow-auto max-h-[420px]">
        <table className="min-w-full text-sm">
          <thead className="text-slate-400 text-xs uppercase tracking-wider">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Device</th>
              <th className="px-3 py-2 text-left">Message</th>
              <th className="px-3 py-2 text-left">Active date/time</th>
              <th className="px-3 py-2 text-left">Cleared date/time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const deviceId = String(row?.deviceId ?? "").trim();
              const deviceName = String(row?.deviceName ?? "").trim();
              const message = String(row?.message ?? "").trim() || "Alarm";
              const activeTs = Number(row?.activeTs);
              const clearedTs = Number(row?.clearedTs);
              const activeTimeText = String(row?.activeTimeText ?? "").trim();
              const clearedTimeText = String(row?.clearedTimeText ?? "").trim();

              return (
                <tr
                  key={`${deviceId}-${Number(row?.activeTs) || 0}-${Number(row?.clearedTs) || 0}-${index}`}
                  className="border-t border-white/5 hover:bg-white/5"
                >
                  <td className="px-3 py-2 text-slate-300">{index + 1}</td>
                  <td className="px-3 py-2 font-semibold">
                    <span>{deviceName || deviceId || "--"}</span>
                    {deviceName && deviceId ? <span className="ml-2 font-normal text-slate-400">{deviceId}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-slate-200">{message}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {activeTimeText || (Number.isFinite(activeTs) ? new Date(activeTs).toLocaleString() : "--")}
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {clearedTimeText || (Number.isFinite(clearedTs) ? new Date(clearedTs).toLocaleString() : "--")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isLoading && rows.length === 0 && <p className="text-slate-400 text-sm">No alarms yet.</p>}
      </div>
    </div>
  );
}
