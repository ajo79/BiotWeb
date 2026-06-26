import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getNumericMetricValue } from "../utils/metrics";

type ChartMetric = {
  id: string;
  label: string;
};

type Props = {
  title: string;
  subtitle?: string;
  data: any[];
  metrics: ChartMetric[];
  tickFormatter?: (value: number) => string;
  height?: number;
};

const LINE_COLORS = ["#0f766e", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

export default function EnergyChartPanel({ title, subtitle, data, metrics, tickFormatter, height = 240 }: Props) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-ambient">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Trend</p>
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>

      {!data.length || !metrics.length ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
          No chart data available for this metric group.
        </div>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 12 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
              <XAxis
                type="number"
                dataKey="plotTs"
                stroke="#94a3b8"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => (tickFormatter ? tickFormatter(Number(value)) : String(value))}
                minTickGap={24}
                domain={["dataMin", "dataMax"]}
              />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 12 }} width={52} />
              <Tooltip
                contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px" }}
                formatter={(value: any) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : value)}
              />
              <Legend verticalAlign="top" height={28} />
              {metrics.map((metric, idx) => (
                <Line
                  key={metric.id}
                  type="monotone"
                  dataKey={(row: any) => getNumericMetricValue(row, metric.id) ?? null}
                  name={metric.label}
                  stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
