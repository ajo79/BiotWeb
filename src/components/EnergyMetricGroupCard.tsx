import type { EnergyMetricGroup } from "../utils/energyMeter";

type Props = {
  group: EnergyMetricGroup;
  subtitle?: string;
};

const toneAccent = {
  consumption: "from-cyan-500 to-sky-600",
  reactive: "from-rose-600 via-fuchsia-600 to-purple-700",
  power: "from-slate-900 via-indigo-900 to-blue-900",
  voltage: "from-indigo-500 to-violet-600",
  current: "from-blue-500 to-cyan-600",
  quality: "from-emerald-500 to-teal-600",
} as const;

const sevenSegClass =
  "[font-family:'Digital-7_Mono','Digital-7','DS-Digital','Seven_Segment','Courier_New',monospace]";

export default function EnergyMetricGroupCard({ group, subtitle }: Props) {
  const visibleMetrics = group.metrics.slice(0, group.layout === "phase_table" ? 4 : 5);

  return (
    <div className="self-start overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
      <div className={`bg-gradient-to-r ${toneAccent[group.tone]} px-4 py-3 text-white`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em]">{group.title}</div>
            {subtitle ? <div className="mt-1 text-[10px] text-white/80">{subtitle}</div> : null}
          </div>
          <div className="h-7 w-7 rounded-full border border-white/25 bg-white/10" />
        </div>
      </div>

      <div className="bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.78),_transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef4ea_100%)] px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Display View</div>
          <div className="rounded-full border border-slate-200 bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Meter
          </div>
        </div>

        {group.layout === "phase_table" ? (
          visibleMetrics.length ? (
            <div className="space-y-2">
              {visibleMetrics.map((metric) => (
                <div key={metric.id ?? metric.label} className="grid grid-cols-[52px_1fr] items-end gap-3">
                  <span className="font-mono text-[1rem] font-semibold uppercase tracking-[0.08em] text-indigo-700">{metric.label}</span>
                  <div className="flex items-end justify-end gap-2 border-b border-slate-300 pb-1">
                    <span className={`${sevenSegClass} text-[3rem] leading-none tracking-tight text-indigo-700`}>{metric.value}</span>
                    <span className="font-mono text-[0.82rem] uppercase tracking-[0.1em] text-slate-500">{metric.unit ?? ""}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="font-mono text-sm uppercase tracking-[0.14em] text-slate-500">No phase values</div>
          )
        ) : visibleMetrics.length ? (
          <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-white/45 p-3">
            {visibleMetrics.map((metric) => (
              <div key={metric.id ?? metric.label} className="grid grid-cols-[1fr_auto] items-center gap-2">
                <span className="font-mono text-[0.72rem] uppercase tracking-[0.12em] text-slate-600">{metric.label}</span>
                <span className={`${sevenSegClass} text-[1.6rem] leading-none text-indigo-700`}>
                  {metric.value}
                  {metric.unit ? <span className="ml-1 text-[0.68rem] uppercase text-slate-500">{metric.unit}</span> : null}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="font-mono text-sm uppercase tracking-[0.14em] text-slate-500">No matching meter metrics</div>
        )}
      </div>
    </div>
  );
}
