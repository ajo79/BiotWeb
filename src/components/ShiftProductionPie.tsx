import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { getDecodedParameters, toNumber } from "../utils/metrics";

type ShiftDatum = {
  shift: 1 | 2 | 3;
  key: string;
  label: string;
  value: number;
  color: string;
};

const SHIFT_CONFIG: Omit<ShiftDatum, "value">[] = [
  { shift: 1, key: "shift_1_count", label: "Shift 1", color: "#2563eb" },
  { shift: 2, key: "shift_2_count", label: "Shift 2", color: "#16a34a" },
  { shift: 3, key: "shift_3_count", label: "Shift 3", color: "#f97316" },
];

const toSafeCount = (value: any) => {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Number(n));
};

const pickByAliases = (item: any, aliases: string[]) => {
  if (!item || typeof item !== "object") return undefined;
  const lower: Record<string, any> = {};
  Object.entries(item).forEach(([k, v]) => {
    lower[String(k).toLowerCase()] = v;
  });

  for (const alias of aliases) {
    const lk = alias.toLowerCase();
    if (!(lk in lower)) continue;
    const parsed = toSafeCount(lower[lk]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

const resolveShiftCount = (item: any, shift: 1 | 2 | 3) => {
  const params = getDecodedParameters(item);
  const regex = new RegExp(`\\bshift[\\s_-]*${shift}\\b`);

  for (const param of params) {
    const text = `${param.key} ${param.label}`.toLowerCase();
    if (!regex.test(text)) continue;
    if (!/\bcount\b|\bproduction\b/.test(text)) continue;
    const parsed = toSafeCount(param.value);
    if (parsed !== undefined) return parsed;
  }

  const aliases = [
    `shift_${shift}_count`,
    `shift${shift}_count`,
    `shift${shift}count`,
    `shift_${shift}_production_count`,
    `shift${shift}_production_count`,
    `shift_${shift}_production`,
    `shift${shift}_production`,
  ];

  return (
    pickByAliases(item, aliases) ??
    pickByAliases(item?.payload, aliases)
  );
};

const formatCount = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "--";

export default function ShiftProductionPie({ item }: { item: any }) {
  const summary = useMemo(() => {
    const data: ShiftDatum[] = SHIFT_CONFIG.map((cfg) => ({
      ...cfg,
      value: resolveShiftCount(item, cfg.shift) ?? 0,
    }));
    const total = data.reduce((sum, d) => sum + d.value, 0);
    const max = total > 0 ? data.reduce((best, cur) => (cur.value > best.value ? cur : best), data[0]) : null;
    const pieData = data.filter((d) => d.value > 0);
    return { data, pieData, total, max };
  }, [item]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">Shift Production</p>
        {summary.max && (
          <p className="text-xs text-slate-600">
            Max: <span className="font-semibold text-slate-800">{summary.max.label}</span>
          </p>
        )}
      </div>

      {summary.total <= 0 ? (
        <p className="text-xs text-slate-500">No production data.</p>
      ) : (
        <>
          <div className="h-28">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={summary.pieData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={22}
                  outerRadius={44}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {summary.pieData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            {summary.data.map((row) => (
              <div key={row.key} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                  <span>{row.label}</span>
                </div>
                <p className="mt-0.5 font-semibold text-slate-900">{formatCount(row.value)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
