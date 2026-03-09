import { useMemo } from "react";
import clsx from "clsx";
import {
  type ScopePreset,
  formatDurationShort,
  resolveScopePreset,
  resolveScopeWindowMs,
  timePerDivisionMs,
} from "../utils/chartTimebase";

const DIAL_SIZE = 240;
const DIAL_CENTER = DIAL_SIZE / 2;
const LABEL_RADIUS = 102;
const TICK_OUTER_RADIUS = 96;
const TICK_INNER_RADIUS = 86;
const ARC_RADIUS = 90;
const NEEDLE_RADIUS = 64;

const toPoint = (angleDeg: number, radius: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: DIAL_CENTER + Math.cos(rad) * radius,
    y: DIAL_CENTER + Math.sin(rad) * radius,
  };
};

const describeArc = (startAngleDeg: number, endAngleDeg: number, radius: number) => {
  const start = toPoint(startAngleDeg, radius);
  const end = toPoint(endAngleDeg, radius);
  const largeArcFlag = Math.abs(endAngleDeg - startAngleDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
};

type Props = {
  presetId: string;
  onPresetChange: (presetId: string) => void;
  presets: ScopePreset[];
  label?: string;
  className?: string;
};

export default function TimeDivisionKnob({
  presetId,
  onPresetChange,
  presets,
  label = "Timebase",
  className,
}: Props) {
  const minAngle = -130;
  const maxAngle = 130;
  const activeIndex = Math.max(
    0,
    presets.findIndex((preset) => preset.id === presetId)
  );
  const activePreset = presets[activeIndex] ?? resolveScopePreset(presetId);
  const activeWindowMs = resolveScopeWindowMs(activePreset.id);
  const perDivisionMs = timePerDivisionMs(activeWindowMs);

  const pointerRotate = useMemo(() => {
    if (presets.length <= 1) return 0;
    const ratio = activeIndex / (presets.length - 1);
    return minAngle + ratio * (maxAngle - minAngle);
  }, [activeIndex, presets.length, minAngle, maxAngle]);
  const baseArcPath = useMemo(
    () => describeArc(minAngle, maxAngle, ARC_RADIUS),
    [minAngle, maxAngle]
  );
  const activeArcPath = useMemo(
    () => describeArc(minAngle, pointerRotate, ARC_RADIUS),
    [minAngle, pointerRotate]
  );
  const needleTip = useMemo(() => toPoint(pointerRotate, NEEDLE_RADIUS), [pointerRotate]);
  const tickAngles = useMemo(() => {
    if (presets.length <= 1) return [minAngle];
    return presets.map((_, idx) => {
      const ratio = idx / (presets.length - 1);
      return minAngle + ratio * (maxAngle - minAngle);
    });
  }, [presets, minAngle, maxAngle]);

  const step = (delta: number) => {
    const nextIndex = Math.max(0, Math.min(presets.length - 1, activeIndex + delta));
    const nextPreset = presets[nextIndex];
    if (nextPreset && nextPreset.id !== activePreset.id) {
      onPresetChange(nextPreset.id);
    }
  };

  return (
    <div
      className={clsx(
        "glass relative overflow-hidden rounded-[1.75rem] border border-slate-200 p-4 text-slate-900 shadow-ambient",
        className
      )}
      style={{
        background:
          "linear-gradient(170deg, rgba(255,255,255,0.96) 0%, rgba(239,246,255,0.95) 52%, rgba(224,242,254,0.88) 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(circle at 30% 12%, rgba(255,255,255,0.8), transparent 42%), linear-gradient(120deg, rgba(148,163,184,0.1), transparent 30%)",
        }}
      />

      <p className="relative text-[11px] uppercase tracking-[0.3em] text-slate-500">{label}</p>
      <div className="relative mt-2 flex justify-center">
        <div className="relative h-60 w-60">
          <svg
            width={DIAL_SIZE}
            height={DIAL_SIZE}
            viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
            className="absolute inset-0"
            aria-hidden="true"
          >
            <circle
              cx={DIAL_CENTER}
              cy={DIAL_CENTER}
              r={108}
              fill="url(#knobPanel)"
              stroke="#dbe7f5"
              strokeWidth="1.5"
            />

            <path d={baseArcPath} fill="none" stroke="#cbd5e1" strokeWidth="13" strokeLinecap="round" />
            <path d={activeArcPath} fill="none" stroke="#38bdf8" strokeWidth="13" strokeLinecap="round" />

            {tickAngles.map((angle, idx) => {
              const a = toPoint(angle, TICK_INNER_RADIUS);
              const b = toPoint(angle, TICK_OUTER_RADIUS);
              const activeTick = idx <= activeIndex;
              return (
                <line
                  key={idx}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={activeTick ? "#0284c7" : "#94a3b8"}
                  strokeWidth={activeTick ? 2.3 : 1.6}
                  strokeLinecap="round"
                  opacity={activeTick ? 0.95 : 0.65}
                />
              );
            })}

            <line
              x1={DIAL_CENTER}
              y1={DIAL_CENTER}
              x2={needleTip.x}
              y2={needleTip.y}
              stroke="#2563eb"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx={DIAL_CENTER} cy={DIAL_CENTER} r={46} fill="url(#knobCore)" stroke="#d1d5db" strokeWidth="1.4" />
            <circle cx={DIAL_CENTER} cy={DIAL_CENTER} r={13} fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.2" />

            <defs>
              <linearGradient id="knobPanel" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="55%" stopColor="#f0f7ff" />
                <stop offset="100%" stopColor="#e0f2fe" />
              </linearGradient>
              <linearGradient id="knobCore" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>
            </defs>
          </svg>

          {presets.map((preset, idx) => {
            const angle = tickAngles[idx] ?? minAngle;
            const point = toPoint(angle, LABEL_RADIUS);
            const isActive = preset.id === activePreset.id;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onPresetChange(preset.id)}
                className={clsx(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold transition",
                  isActive
                    ? "border-blue-500 bg-blue-600 text-white shadow-glow"
                    : "border-slate-200 bg-white/95 text-slate-600 hover:border-blue-300 hover:text-blue-700"
                )}
                style={{ left: `${point.x}px`, top: `${point.y}px` }}
                aria-label={`Set time window ${preset.label}`}
              >
                {preset.id}
              </button>
            );
          })}

          <button
            type="button"
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                step(-1);
              }
              if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                step(1);
              }
            }}
            className="absolute inset-[4.9rem] rounded-full"
            aria-label={`Selected window ${activePreset.label}`}
          >
            <span className="absolute inset-x-0 bottom-2 text-center text-sm font-semibold text-slate-700">
              {activePreset.label}
            </span>
          </button>
        </div>
      </div>

      <div className="relative mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => step(-1)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-35"
          disabled={activeIndex === 0}
          aria-label="Decrease time window"
        >
          Prev
        </button>
        <div className="text-center text-[11px] leading-5 text-slate-600">
          <div>
            Window <span className="font-semibold text-slate-900">{formatDurationShort(activeWindowMs)}</span>
          </div>
          <div>
            Time/Div <span className="font-semibold text-blue-700">{formatDurationShort(perDivisionMs)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => step(1)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-35"
          disabled={activeIndex === presets.length - 1}
          aria-label="Increase time window"
        >
          Next
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, presets.length - 1)}
        step={1}
        value={activeIndex}
        onChange={(e) => {
          const idx = Number(e.target.value);
          const preset = presets[idx];
          if (preset) onPresetChange(preset.id);
        }}
        className="relative mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600"
        aria-label="Sweep preset slider"
      />
    </div>
  );
}
