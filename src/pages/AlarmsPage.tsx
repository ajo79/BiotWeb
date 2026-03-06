import { useAlarms } from "../hooks/queries";

export default function AlarmsPage() {
  const { data, isLoading } = useAlarms();

  return (
    <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm text-slate-400">ESP32 alarms</p>
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
              <th className="px-3 py-2 text-left">Time</th>
              
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((row, idx) => {
              const ts = row.ts ?? row.timestamp;
              const message = row?.payload?.message || row?.message || "Alarm";
              return (
                <tr key={idx} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-3 py-2 text-slate-300">{idx + 1}</td>
                  <td className="px-3 py-2 font-semibold">{row.deviceId}</td>
                  <td className="px-3 py-2 text-slate-200">{message}</td>
                  <td className="px-3 py-2 text-slate-400">{ts ? new Date(ts).toLocaleString() : "--"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!isLoading && (data ?? []).length === 0 && <p className="text-slate-400 text-sm">No alarms yet.</p>}
      </div>
    </div>
  );
}
