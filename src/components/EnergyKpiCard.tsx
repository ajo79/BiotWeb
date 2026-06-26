import type { EnergyMetricChip, EnergyGroupLayout, EnergyGroupTone } from "../utils/energyMeter";

type EnergyKpiCardProps = {
  title: string;
  tone: EnergyGroupTone;
  primary?: EnergyMetricChip;
  metrics?: EnergyMetricChip[];
  subtitle?: string;
  layout?: EnergyGroupLayout;
};

const toneAccent: Record<EnergyGroupTone, string> = {
  consumption: "from-cyan-500 to-sky-600",
  power: "from-slate-900 via-indigo-900 to-blue-900",
  voltage: "from-indigo-500 to-violet-600",
  current: "from-blue-500 to-cyan-600",
  quality: "from-emerald-500 to-teal-600",
};

const sevenSegClass =
  "[font-family:'Digital-7_Mono','Digital-7','DS-Digital','Seven_Segment','Courier_New',monospace]";

function DigitalRows({ metrics }: { metrics: EnergyMetricChip[] }) {
  return (
        <div className="space-y-2">
          {metrics.map((metric) => (
            <div key={metric.id ?? metric.label} className="grid grid-cols-[56px_1fr] items-end gap-3">
              <div className="font-mono text-[1.1rem] font-semibold uppercase tracking-[0.08em] text-indigo-700">
                {metric.label}
              </div>
              <div className="flex items-end justify-end gap-2 border-b border-slate-300 pb-1">
                    <span className={`${sevenSegClass} text-[3.4rem] leading-none tracking-tight text-indigo-700`}>{metric.value}</span>
                    <span className="font-mono text-[0.95rem] uppercase tracking-[0.12em] text-slate-500">
                      {metric.unit ?? ""}
                    </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function EnergyKpiCard({
  title,
  tone,
  primary,
  metrics = [],
  subtitle,
  layout = "summary",
}: EnergyKpiCardProps) {
  const visibleMetrics = metrics.slice(0, layout === "phase_table" ? 4 : 5);

  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.10)] ring-1 ring-white/70">
      <div className={`bg-gradient-to-r ${toneAccent[tone]} px-4 py-3 text-white`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.24em]">{title}</div>
            {subtitle ? <div className="mt-1 text-[11px] text-white/80">{subtitle}</div> : null}
          </div>
          <div className="h-8 w-8 rounded-full border border-white/25 bg-white/10" />
        </div>
      </div>

      <div className="min-h-[17rem] bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.75),_transparent_30%),linear-gradient(180deg,#f8fbff_0%,#eef4ea_100%)] px-4 py-4 text-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Live Meter Page</p>
          <div className="rounded-full border border-slate-200 bg-white/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            BlackStar
          </div>
        </div>

        {layout === "phase_table" ? (
          visibleMetrics.length ? (
            <DigitalRows metrics={visibleMetrics} />
          ) : (
            <div className="font-mono text-sm uppercase tracking-[0.14em] text-slate-500">No phase values</div>
          )
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto] items-start gap-3">
              <div className="space-y-1">
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">Display Page</p>
              </div>
              <div className="text-right">
                <div className={`${sevenSegClass} text-[2.9rem] leading-none tracking-tight text-indigo-700`}>{primary?.value ?? "--"}</div>
                <div className="mt-1 font-mono text-[0.78rem] uppercase tracking-[0.16em] text-slate-600">
                  {primary?.unit ?? "No Data"}
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200/80 bg-white/45 p-3">
              {visibleMetrics.length ? (
                <div className="space-y-2">
                  {visibleMetrics.map((metric) => (
                    <div key={metric.id ?? metric.label} className="grid grid-cols-[1fr_auto] items-center gap-2">
                      <span className="font-mono text-[0.78rem] uppercase tracking-[0.12em] text-slate-600">{metric.label}</span>
                      <span className={`${sevenSegClass} text-[1.8rem] leading-none tracking-tight text-indigo-700`}>
                        {metric.value}
                        {metric.unit ? <span className="ml-1 text-[0.72rem] uppercase text-slate-500">{metric.unit}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="font-mono text-sm uppercase tracking-[0.14em] text-slate-500">No matching meter values</div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
        <span>BlackStar Products</span>
        <span>Live</span>
      </div>
    </div>
  );
}
