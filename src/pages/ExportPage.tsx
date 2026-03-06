import { useMemo, useState } from "react";
import { getIoTReadingsHistory } from "../api/client";
import { useDashboard } from "../hooks/queries";
import { flattenPayloadDeep } from "../utils/metrics";
import { formatNumericLikeCell } from "../utils/numberFormat";

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

export default function ExportPage() {
  const dashboard = useDashboard();
  const [form, setForm] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    return { deviceId: "", start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const [isLoading, setIsLoading] = useState(false);
  const deviceOptions = useMemo(() => {
    const all = [
      ...(dashboard.data?.IoTReadings ?? []),
      ...(dashboard.data?.RealTimeDataMonitor ?? []),
    ];
    const ids = new Set<string>();
    all.forEach((row) => {
      const id = row?.deviceId != null ? String(row.deviceId).trim() : "";
      if (id) ids.add(id);
    });
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [dashboard.data?.IoTReadings, dashboard.data?.RealTimeDataMonitor]);

  const toCell = (value: any) => {
    if (value == null) return "";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return formatNumericLikeCell(value);
  };

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const fromTs = toLocalStart(form.start);
      const toTs = toLocalEnd(form.end);
      const historyRows = await getIoTReadingsHistory({
        deviceId: form.deviceId || undefined,
        from: fromTs,
        to: toTs,
      });
      const filtered = (historyRows ?? [])
        .map((row) => flattenPayloadDeep(row))
        .filter((row) => {
          const ts = Number(row.ts);
          const did = row.deviceId != null ? String(row.deviceId) : "";
          if (Number.isFinite(fromTs) && ts < fromTs) return false;
          if (Number.isFinite(toTs) && ts > toTs) return false;
          if (form.deviceId && did !== form.deviceId) return false;
          return true;
        })
        .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));

      if (!filtered.length) {
        window.alert("No data for that range/device.");
        return;
      }

      const metaKeys = new Set([
        "deviceid",
        "devicename",
        "device_name",
        "ts",
        "timestamp",
        "time",
        "timeiso",
      ]);

      const payloadKeySet = new Map<string, string>();
      filtered.forEach((row) => {
        Object.keys(row || {}).forEach((key) => {
          if (!key) return;
          const lower = String(key).toLowerCase();
          if (metaKeys.has(lower)) return;
          if (lower === "payload") return;
          if (!payloadKeySet.has(lower)) payloadKeySet.set(lower, key);
        });
      });

      const payloadKeys = Array.from(payloadKeySet.values()).sort((a, b) => {
        const aMatch = String(a).match(/(?:phase|press)\s*([0-9]+)/i);
        const bMatch = String(b).match(/(?:phase|press)\s*([0-9]+)/i);
        if (aMatch && bMatch) return Number(aMatch[1]) - Number(bMatch[1]);
        if (aMatch) return -1;
        if (bMatch) return 1;
        return String(a).localeCompare(String(b));
      });

      const headers = ["deviceId", "deviceName", ...payloadKeys, "ts", "timeISO"];

      const rows = filtered.map((r) => {
        const deviceId = r.deviceId != null ? String(r.deviceId) : "";
        const deviceName = r.deviceName ?? (r as any).device_name ?? (r as any)["device name"] ?? "";
        const ts = Number(r.ts);
        const payloadValues = payloadKeys.map((key) => toCell((r as any)[key]));
        return [deviceId, deviceName, ...payloadValues, Number.isFinite(ts) ? ts : "", Number.isFinite(ts) ? new Date(ts).toISOString() : ""];
      });
      const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/\"/g, '\"\"')}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "export.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      window.alert(e?.message || "Export failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-5 border border-white/5 shadow-ambient max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm text-slate-400">CSV download</p>
          <h2 className="text-xl font-semibold">Export Readings</h2>
        </div>
        {isLoading && <span className="text-xs text-slate-400">Working…</span>}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Device ID (optional)
          <select
            value={form.deviceId}
            onChange={(e) => setForm((f) => ({ ...f, deviceId: e.target.value }))}
            className="glass rounded-lg px-3 py-2 border border-white/5 bg-panel focus:border-blue-500 outline-none"
          >
            <option value="">All devices</option>
            {deviceOptions.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-sm">
            From
            <input
              type="date"
              value={form.start}
              onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
              className="glass rounded-lg px-3 py-2 border border-white/5 focus:border-blue-500 outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            To
            <input
              type="date"
              value={form.end}
              onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
              className="glass rounded-lg px-3 py-2 border border-white/5 focus:border-blue-500 outline-none"
            />
          </label>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          onClick={handleExport}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold shadow-glow disabled:opacity-60"
          disabled={isLoading}
        >
          {isLoading ? "Preparing…" : "Download CSV"}
        </button>
        <p className="text-sm text-slate-400">Client builds CSV directly from AWS data.</p>
      </div>
    </div>
  );
}
