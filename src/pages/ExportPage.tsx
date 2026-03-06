import { useMemo, useState } from "react";
import { getIoTReadingsHistory } from "../api/client";
import { useDashboard } from "../hooks/queries";
import { formatNumericLikeCell } from "../utils/numberFormat";

type ExportParam = {
  id: string;
  label: string;
  order: number;
  value: any;
};

type DynamicColumn = {
  id: string;
  metricId: string;
  label: string;
  order: number;
  fieldKey?: string;
};

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

const toEpochMs = (value: any) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  if (n > 1e9 && n < 1e12) return Math.round(n * 1000);
  return Math.round(n);
};

const parseBooleanLike = (value: any): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on", "alarm", "active"].includes(lowered)) return true;
    if (["0", "false", "no", "n", "off", "ok", "normal", "inactive", "none"].includes(lowered)) return false;
  }
  return undefined;
};

const parseDisplayBoolean = (value: any): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["true", "yes", "y", "on", "alarm", "active"].includes(lowered)) return true;
    if (["false", "no", "n", "off", "ok", "normal", "inactive", "none"].includes(lowered)) return false;
  }
  return undefined;
};

const safeJsonParse = (value: any) => {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeParametersForExport = (raw: any): ExportParam[] => {
  const source = (() => {
    if (Array.isArray(raw)) return raw;
    const parsed = safeJsonParse(raw);
    return Array.isArray(parsed) ? parsed : [];
  })();

  return source
    .map((entry, idx) => {
      const item = typeof entry === "string" ? safeJsonParse(entry) : entry;
      if (!item || typeof item !== "object") return null;

      const key = String(item.key ?? `param_${idx + 1}`);
      const labelBase = String(item.label ?? item.key ?? `Parameter ${idx + 1}`);
      const unit = item.unit != null ? String(item.unit).trim() : "";
      const label = unit && !labelBase.toLowerCase().includes(unit.toLowerCase()) ? `${labelBase} (${unit})` : labelBase;
      const orderRaw = Number(item.order);
      const order = Number.isFinite(orderRaw) ? orderRaw : idx + 1;

      return {
        id: key.trim().toLowerCase(),
        label: label.trim(),
        order,
        value: item.value,
      };
    })
    .filter((item): item is ExportParam => Boolean(item))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
};

const isEnvParam = (param: ExportParam) => {
  const text = `${param.id} ${param.label}`.toLowerCase();
  return text.includes("temp") || text.includes("humid");
};

const parsePhaseAmp = (text: string) => {
  const match = text.toLowerCase().match(/(?:press|ph(?:ase)?)\s*[-_ ]?(\d+)\s*amp/);
  if (!match) return undefined;
  const phase = Number(match[1]);
  if (!Number.isFinite(phase)) return undefined;
  return {
    phase,
    metricId: `press_${phase}_amps`,
    label: `Press ${phase} Amps`,
  };
};

const hasMeaningfulValue = (value: any) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
};

const resolveDeviceName = (row: any) => {
  const candidates = [row?.deviceName, row?.device_name, row?.["device name"]];
  for (const value of candidates) {
    if (value == null) continue;
    const out = String(value).trim();
    if (out) return out;
  }
  return "";
};

const resolveCommonAlarm = (row: any) => {
  const keys = [
    "Common Alarm",
    "common alarm",
    "CommonAlarm",
    "commonAlarm",
    "Common_Issue",
    "Common Issue",
    "common_issue",
    "common issue",
  ];

  const lower: Record<string, any> = {};
  Object.entries(row || {}).forEach(([k, v]) => {
    lower[String(k).toLowerCase()] = v;
  });

  for (const key of keys) {
    const lk = key.toLowerCase();
    if (!(lk in lower)) continue;
    const parsed = parseBooleanLike(lower[lk]);
    if (typeof parsed === "boolean") return parsed;
  }

  return false;
};

const resolveWifiStrength = (row: any) => {
  const candidates = [row?.wifi_strength, row?.wifiStrength, row?.wifiSignal, row?.wifi];
  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
};

const resolveEnvValue = (row: any, params: ExportParam[], kind: "temperature" | "humidity") => {
  const direct = row?.[kind];
  const directNum = Number(direct);
  if (Number.isFinite(directNum)) return directNum;

  const param = params.find((p) => {
    const t = `${p.id} ${p.label}`.toLowerCase();
    return kind === "temperature" ? t.includes("temp") : t.includes("humid");
  });

  return param?.value;
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
    if (typeof value === "number") return formatNumericLikeCell(value);
    const displayBool = parseDisplayBoolean(value);
    if (typeof displayBool === "boolean") return displayBool ? "Yes" : "No";
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
        .filter((row) => {
          const ts = toEpochMs(row?.ts);
          if (!Number.isFinite(ts)) return false;
          const did = row.deviceId != null ? String(row.deviceId) : "";
          if (Number.isFinite(fromTs) && ts < fromTs) return false;
          if (Number.isFinite(toTs) && ts > toTs) return false;
          if (form.deviceId && did !== form.deviceId) return false;
          return true;
        })
        .sort((a, b) => (toEpochMs(b?.ts) ?? 0) - (toEpochMs(a?.ts) ?? 0));

      if (!filtered.length) {
        window.alert("No data for that range/device.");
        return;
      }

      const columnMap = new Map<string, DynamicColumn>();

      filtered.forEach((row) => {
        const params = normalizeParametersForExport(row?.parameters);
        params.forEach((param) => {
          if (isEnvParam(param)) return;
          const amp = parsePhaseAmp(`${param.id} ${param.label}`);
          const metricId = amp?.metricId ?? `param_${param.id}`;
          const label = amp?.label ?? param.label;
          const order = amp ? 10_000 + amp.phase : param.order;
          const id = `m:${metricId}`;
          if (columnMap.has(id)) return;
          columnMap.set(id, {
            id,
            metricId,
            label,
            order,
          });
        });

        Object.keys(row || {}).forEach((key) => {
          const amp = parsePhaseAmp(key);
          if (!amp) return;

          const id = `m:${amp.metricId}`;
          const existing = columnMap.get(id);
          if (existing) {
            if (!existing.fieldKey) existing.fieldKey = key;
            return;
          }

          columnMap.set(id, {
            id,
            metricId: amp.metricId,
            label: amp.label,
            order: 10_000 + amp.phase,
            fieldKey: key,
          });
        });
      });

      const dynamicColumns = Array.from(columnMap.values()).sort(
        (a, b) => a.order - b.order || a.label.localeCompare(b.label)
      );

      const hasTemperatureColumn = filtered.some((row) => {
        const params = normalizeParametersForExport(row?.parameters);
        return hasMeaningfulValue(resolveEnvValue(row, params, "temperature"));
      });

      const hasHumidityColumn = filtered.some((row) => {
        const params = normalizeParametersForExport(row?.parameters);
        return hasMeaningfulValue(resolveEnvValue(row, params, "humidity"));
      });

      const headers = [
        "Device ID",
        "Device Name",
        "Time (ISO)",
        ...(hasTemperatureColumn ? ["Temperature (deg C)"] : []),
        ...(hasHumidityColumn ? ["Humidity (%)"] : []),
        "Common Alarm",
        "WiFi Strength",
        ...dynamicColumns.map((col) => col.label),
      ];

      const rows = filtered.map((r) => {
        const deviceId = r.deviceId != null ? String(r.deviceId) : "";
        const deviceName = resolveDeviceName(r);
        const ts = toEpochMs(r?.ts);
        const params = normalizeParametersForExport(r?.parameters);
        const paramValues = new Map<string, any>();
        params.forEach((param) => {
          const amp = parsePhaseAmp(`${param.id} ${param.label}`);
          const metricId = amp?.metricId ?? `param_${param.id}`;
          if (!paramValues.has(metricId)) paramValues.set(metricId, param.value);
        });

        const temperature = resolveEnvValue(r, params, "temperature");
        const humidity = resolveEnvValue(r, params, "humidity");
        const commonAlarm = resolveCommonAlarm(r);
        const wifiStrength = resolveWifiStrength(r);

        const dynamicValues = dynamicColumns.map((col) => {
          const fromParam = paramValues.get(col.metricId);
          if (hasMeaningfulValue(fromParam)) return toCell(fromParam);
          if (col.fieldKey) return toCell((r as any)[col.fieldKey]);
          return "";
        });

        const rowValues = [
          deviceId,
          deviceName,
          Number.isFinite(ts) ? new Date(ts).toISOString() : "",
        ];

        if (hasTemperatureColumn) rowValues.push(toCell(temperature));
        if (hasHumidityColumn) rowValues.push(toCell(humidity));

        rowValues.push(commonAlarm ? "Yes" : "No");
        rowValues.push(toCell(wifiStrength));
        rowValues.push(...dynamicValues);
        return rowValues;
      });

      const csv = [
        headers.join(","),
        ...rows.map((r) => r.map((v) => `"${String(v).replace(/\"/g, '\"\"')}"`).join(",")),
      ].join("\n");
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
        <p className="text-sm text-slate-400">CSV includes user-friendly fields and parameter values.</p>
      </div>
    </div>
  );
}
